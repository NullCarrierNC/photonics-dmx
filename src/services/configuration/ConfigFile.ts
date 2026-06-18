import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as fsPromises from 'fs/promises'
import {
  corruptBackupFilePath,
  type ConfigCorruptInfo,
  type ConfigCorruptReason,
} from './configCorruptTypes'
import { createLogger } from '../../shared/logger'

const log = createLogger('ConfigFile')

/**
 * In-memory result of config validation after load/migration.
 * (`false` and error strings, not a thrown error.)
 */
export type ConfigDataValidCheck<T> = (
  data: T,
) => { valid: true } | { valid: false; errors: string[] }

export type ConfigFileHooks<T> = {
  validate?: ConfigDataValidCheck<T>
  onCorruptRecovery?: (info: ConfigCorruptInfo) => void
  /** If the file is legacy unversioned JSON, reshape before `migrateData` (e.g. lights array → `{ lights }`). */
  coerceUnversioned?: (raw: unknown) => T
}

/**
 * Configuration data with version tracking
 */
interface ConfigWithVersion<T> {
  version: number
  data: T
}

/**
 * Handles individual configuration file operations
 */
export class ConfigFile<T> {
  private readonly filePath: string
  private data: T
  private hasLoggedLoad: boolean = false
  private readonly currentVersion: number
  private readonly defaultData: T
  private readonly validate: ConfigDataValidCheck<T> | undefined
  private readonly onCorruptRecovery: ((info: ConfigCorruptInfo) => void) | undefined
  private readonly coerceUnversioned: ((raw: unknown) => T) | undefined
  // Serializes saves so only one writeFile+rename is in flight per file at a time,
  // avoiding concurrent renames racing the same destination.
  private saveChain: Promise<void> = Promise.resolve()

  constructor(
    filename: string,
    defaultData: T,
    version: number = 1,
    hooks: ConfigFileHooks<T> = {},
  ) {
    const configDir = path.join(app.getPath('appData'), 'Photonics.rocks')

    // Log the storage directory (only once per process)
    if (!global.__PHOTONICS_CONFIG_LOGGED__) {
      log.info(`[Photonics Config] JSON storage directory: ${configDir}`)
      global.__PHOTONICS_CONFIG_LOGGED__ = true
    }

    this.filePath = path.join(configDir, filename)
    this.currentVersion = version
    this.defaultData = defaultData
    this.validate = hooks.validate
    this.onCorruptRecovery = hooks.onCorruptRecovery
    this.coerceUnversioned = hooks.coerceUnversioned
    this.ensureConfigDirectory(configDir)
    this.data = this.load()
  }

  /**
   * Ensures the configuration directory exists
   */
  private ensureConfigDirectory(configDir: string): void {
    if (!fs.existsSync(configDir)) {
      try {
        fs.mkdirSync(configDir, { recursive: true })
        log.info(`Created configuration directory: ${configDir}`)
      } catch (error) {
        log.error(`Error creating configuration directory ${configDir}:`, error)
        throw new Error(`Failed to create configuration directory: ${error}`)
      }
    }
  }

  private recoverToDefault(
    reason: ConfigCorruptReason,
    detail: { parseOrMigrateError?: unknown; schemaText?: string },
  ): T {
    let canWriteDefaults = !fs.existsSync(this.filePath)

    if (fs.existsSync(this.filePath)) {
      const dest = corruptBackupFilePath(this.filePath)
      try {
        fs.renameSync(this.filePath, dest)
        canWriteDefaults = true
      } catch (e) {
        log.error(
          `[Photonics Config] Could not preserve corrupt file by renaming ${this.filePath} → ${dest}:`,
          e,
        )
        canWriteDefaults = false
      }
    }

    let message =
      reason === 'parse'
        ? detail.parseOrMigrateError instanceof Error
          ? detail.parseOrMigrateError.message
          : String(detail.parseOrMigrateError ?? 'JSON parse error')
        : detail.schemaText ??
          (detail.parseOrMigrateError instanceof Error
            ? detail.parseOrMigrateError.message
            : String(detail.parseOrMigrateError ?? 'invalid configuration'))
    if (!canWriteDefaults) {
      message = `${message}; corrupt file left in place: defaults are in memory only until the file can be moved aside.`
    }

    this.onCorruptRecovery?.({
      fileName: path.basename(this.filePath),
      filePath: this.filePath,
      reason,
      message: message || undefined,
    })
    if (canWriteDefaults) {
      log.info(
        `[Photonics Config] Using default configuration (recovered from ${reason} on ${this.filePath})`,
      )
      this.save(this.defaultData).catch((err) =>
        log.error(
          `[Photonics Config] Failed to save default config to ${this.filePath} after recovery:`,
          err,
        ),
      )
    } else {
      log.error(
        `[Photonics Config] Not writing default config to ${this.filePath}: could not move corrupt file aside; using in-memory defaults so the app can start.`,
      )
    }
    return this.defaultData
  }

  /**
   * Loads data from file or returns default if file doesn't exist
   */
  private load(): T {
    if (!fs.existsSync(this.filePath)) {
      log.info(`Configuration file not found: ${this.filePath}, creating default`)
      this.save(this.defaultData).catch((err) =>
        log.error(`[Photonics Config] Failed to save default config to ${this.filePath}:`, err),
      )
      return this.defaultData
    }

    let fileContent: string
    try {
      fileContent = fs.readFileSync(this.filePath, 'utf-8')
    } catch (error) {
      log.error(`[Photonics Config] Failed to read ${this.filePath}:`, error)
      // Treat an unreadable file like a parse/schema failure: back it up and surface a
      // recovery event instead of silently masking the user's config with defaults.
      return this.recoverToDefault('read', { parseOrMigrateError: error })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(fileContent)
    } catch (error) {
      log.error(`[Photonics Config] JSON parse failed for ${this.filePath}:`, error)
      return this.recoverToDefault('parse', { parseOrMigrateError: error })
    }

    let data: T
    let version: number
    let migratedNeedsPersist = false
    try {
      if (this.isVersionedFormat(parsed)) {
        data = parsed.data
        version = parsed.version
      } else {
        const raw = this.coerceUnversioned ? this.coerceUnversioned(parsed) : (parsed as T)
        data = raw
        version = 0
      }
      if (version < this.currentVersion) {
        data = this.migrateData(data, version, this.currentVersion)
        migratedNeedsPersist = true
      }
    } catch (error) {
      log.error(
        `[Photonics Config] Migration or shape handling failed for ${this.filePath}:`,
        error,
      )
      return this.recoverToDefault('schema', { parseOrMigrateError: error })
    }

    if (this.validate) {
      const v = this.validate(data)
      if (!v.valid) {
        const schemaText = v.errors.join('; ')
        log.error(`[Photonics Config] Schema validation failed for ${this.filePath}:`, schemaText)
        return this.recoverToDefault('schema', { schemaText })
      }
    }

    if (migratedNeedsPersist) {
      this.save(data).catch((err) =>
        log.error(`[Photonics Config] Failed to save migrated data to ${this.filePath}:`, err),
      )
    }

    if (!this.hasLoggedLoad) {
      log.info(
        `[Photonics Config] Loaded configuration from ${this.filePath} (v${this.currentVersion})`,
      )
      this.hasLoggedLoad = true
    }

    return data
  }

  /**
   * Checks if the parsed data is in versioned format
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON parse result before validation
  private isVersionedFormat(parsed: any): parsed is ConfigWithVersion<T> {
    return parsed && typeof parsed === 'object' && 'version' in parsed && 'data' in parsed
  }

  /**
   * Migrates data from one version to another
   */
  private migrateData(data: T, fromVersion: number, toVersion: number): T {
    if (fromVersion === toVersion) {
      return data
    }

    log.info(`[Photonics Config] Migrating configuration from v${fromVersion} to v${toVersion}`)

    // Apply migrations in sequence
    let migratedData = data
    for (let version = fromVersion + 1; version <= toVersion; version++) {
      migratedData = this.applyMigration(migratedData, version - 1, version)
    }

    return migratedData
  }

  /**
   * Applies a specific migration between versions
   */
  protected applyMigration(data: T, _fromVersion: number, _toVersion: number): T {
    // Override in subclasses to implement version-specific migrations
    return data
  }

  /**
   * Saves data to file with version information.
   * Uses write-temp-then-rename for atomicity and async I/O to avoid blocking the event loop.
   * Saves are serialized via `saveChain` so concurrent calls cannot race the same destination.
   */
  private save(data: T): Promise<void> {
    const run = this.saveChain.then(() => this.writeAtomic(data))
    // Keep the chain alive even if this save rejects, so a single failure
    // doesn't permanently break subsequent saves.
    this.saveChain = run.catch(() => {})
    return run
  }

  /**
   * Performs the actual atomic write: write to a unique temp file, then rename over the target.
   */
  private async writeAtomic(data: T): Promise<void> {
    const versionedData: ConfigWithVersion<T> = {
      version: this.currentVersion,
      data: data,
    }
    const content = JSON.stringify(versionedData, null, 2)
    const dir = path.dirname(this.filePath)
    this.ensureConfigDirectory(dir)
    const basename = path.basename(this.filePath)
    const unique = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const tempPath = path.join(dir, `.${basename}.tmp.${unique}`)
    try {
      await fsPromises.writeFile(tempPath, content, 'utf-8')
      await this.renameWithRetry(tempPath, this.filePath)
    } catch (error) {
      try {
        await fsPromises.unlink(tempPath).catch(() => {})
      } catch {
        // ignore cleanup failure
      }
      log.error(`Error saving configuration to ${this.filePath}:`, error)
      throw new Error(`Failed to save configuration: ${error}`)
    }
  }

  /**
   * Renames with retry-and-backoff for transient Windows file-lock errors.
   *
   * On Windows, rename() fails with EPERM/EACCES/EBUSY when the source temp file or
   * the destination is momentarily held open by another process — antivirus real-time
   * scanning, Controlled Folder Access, cloud-sync of AppData, or the search indexer.
   * These locks clear within tens of milliseconds, so a short backoff almost always
   * succeeds. Non-transient errors (e.g. ENOSPC, ENOENT) are re-thrown immediately.
   */
  private async renameWithRetry(from: string, to: string): Promise<void> {
    const transientCodes = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY'])
    const delaysMs = [10, 20, 40, 80, 160]
    for (let attempt = 0; ; attempt++) {
      try {
        await fsPromises.rename(from, to)
        return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code
        if (!code || !transientCodes.has(code) || attempt >= delaysMs.length) {
          throw error
        }
        const delay = delaysMs[attempt]
        log.warn(
          `Rename of ${to} hit ${code}; retrying in ${delay}ms (attempt ${attempt + 1}/${delaysMs.length})`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  /**
   * Gets the current data
   */
  get(): T {
    return this.data
  }

  /**
   * Updates the data and saves to file
   */
  async update(newData: T): Promise<void> {
    const previous = this.data
    try {
      await this.save(newData)
      this.data = newData
    } catch (err) {
      this.data = previous
      throw err
    }
  }

  /**
   * Gets the file path for debugging
   */
  getFilePath(): string {
    return this.filePath
  }

  /**
   * Gets the current schema version
   */
  getVersion(): number {
    return this.currentVersion
  }
}
