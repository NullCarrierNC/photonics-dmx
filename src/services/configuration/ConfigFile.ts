import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as fsPromises from 'fs/promises'
import {
  corruptBackupFilePath,
  type ConfigCorruptInfo,
  type ConfigCorruptReason,
} from './configCorruptTypes'

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

  constructor(
    filename: string,
    defaultData: T,
    version: number = 1,
    hooks: ConfigFileHooks<T> = {},
  ) {
    const configDir = path.join(app.getPath('appData'), 'Photonics.rocks')

    // Log the storage directory (only once per process)
    if (!global.__PHOTONICS_CONFIG_LOGGED__) {
      console.log(`[Photonics Config] JSON storage directory: ${configDir}`)
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
        console.log(`Created configuration directory: ${configDir}`)
      } catch (error) {
        console.error(`Error creating configuration directory ${configDir}:`, error)
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
        console.error(
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
      console.log(
        `[Photonics Config] Using default configuration (recovered from ${reason} on ${this.filePath})`,
      )
      this.save(this.defaultData).catch((err) =>
        console.error(
          `[Photonics Config] Failed to save default config to ${this.filePath} after recovery:`,
          err,
        ),
      )
    } else {
      console.error(
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
      console.log(`Configuration file not found: ${this.filePath}, creating default`)
      this.save(this.defaultData).catch((err) =>
        console.error(`[Photonics Config] Failed to save default config to ${this.filePath}:`, err),
      )
      return this.defaultData
    }

    let fileContent: string
    try {
      fileContent = fs.readFileSync(this.filePath, 'utf-8')
    } catch (error) {
      console.error(`[Photonics Config] Failed to read ${this.filePath}:`, error)
      return this.defaultData
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(fileContent)
    } catch (error) {
      console.error(`[Photonics Config] JSON parse failed for ${this.filePath}:`, error)
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
      console.error(
        `[Photonics Config] Migration or shape handling failed for ${this.filePath}:`,
        error,
      )
      return this.recoverToDefault('schema', { parseOrMigrateError: error })
    }

    if (this.validate) {
      const v = this.validate(data)
      if (!v.valid) {
        const schemaText = v.errors.join('; ')
        console.error(
          `[Photonics Config] Schema validation failed for ${this.filePath}:`,
          schemaText,
        )
        return this.recoverToDefault('schema', { schemaText })
      }
    }

    if (migratedNeedsPersist) {
      this.save(data).catch((err) =>
        console.error(`[Photonics Config] Failed to save migrated data to ${this.filePath}:`, err),
      )
    }

    if (!this.hasLoggedLoad) {
      console.log(
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

    console.log(`[Photonics Config] Migrating configuration from v${fromVersion} to v${toVersion}`)

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
   */
  private async save(data: T): Promise<void> {
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
      await fsPromises.rename(tempPath, this.filePath)
    } catch (error) {
      try {
        await fsPromises.unlink(tempPath).catch(() => {})
      } catch {
        // ignore cleanup failure
      }
      console.error(`Error saving configuration to ${this.filePath}:`, error)
      throw new Error(`Failed to save configuration: ${error}`)
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
