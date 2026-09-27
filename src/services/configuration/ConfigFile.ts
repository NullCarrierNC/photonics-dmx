import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as fsPromises from 'fs/promises'
import {
  corruptBackupFilePath,
  repairedCopyFilePath,
  type ConfigCorruptInfo,
  type ConfigCorruptReason,
  type ConfigRepairReport,
} from './configCorruptTypes'
import { migrateStepwise, readEnvelope, type ConfigWithVersion } from './configFileEnvelope'
import {
  renameSyncWithRetry,
  renameWithRetry,
  writeFileAtomic,
} from '../../photonics-dmx/helpers/atomicFileWrite'
import { createLogger } from '../../shared/logger'

const log = createLogger('ConfigFile')

declare global {
  /** Set by the first ConfigFile constructed in the process, so the storage directory is logged once
   *  however many config files are opened. */
  var __PHOTONICS_CONFIG_LOGGED__: boolean | undefined
}

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
  /**
   * Runs on every load after migration and before validation. Returns the data unchanged (same
   * reference) when nothing needs fixing, or a repaired copy otherwise; a changed reference is
   * persisted. Use to seed shape additions (e.g. new required keys) so a same-version file that
   * predates them passes validation instead of triggering corrupt-recovery.
   *
   * `data` is typed T but not yet checked, so a hook tests any shape it relies on. `validate` is
   * the check that follows.
   *
   * `reportRepair` tells the corrupt-recovery hook that stored values were put back to their
   * defaults, or that keys were dropped, with a message naming them. It is passed on only once the
   * repaired data passes `validate`, since a file that fails is set aside whole.
   */
  normalizeLoaded?: (data: T, reportRepair: ConfigRepairReport) => T
}

type RecoveryDetail = { parseOrMigrateError?: unknown; schemaText?: string }

/** A stored file's text read into data, or why it could not be. */
type DecodedFile<T> =
  | { ok: true; data: T; version: number; needsPersist: boolean }
  | {
      ok: false
      reason: ConfigCorruptReason
      detail: RecoveryDetail
      /** Set when a newer build stamped the file, which stays in place, read-only. */
      newerVersion?: number
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
  private readonly normalizeLoaded: ((data: T, reportRepair: ConfigRepairReport) => T) | undefined
  // Serializes saves so only one writeFile+rename is in flight per file at a time,
  // avoiding concurrent renames racing the same destination.
  private saveChain: Promise<void> = Promise.resolve()
  /** Set while a corrupt file could not be moved aside. No write replaces it until one can. */
  private corruptFileInPlace = false
  /** Set when a hand repair was adopted and no whole-file replacement has copied it yet. */
  private repairNotCopied = false
  /** The version of a file written by a newer build, which no write replaces. */
  private newerVersionOnDisk: number | null = null
  // Serializes every update and read-modify-write turn. `saveChain` only orders the writes, which
  // is not enough on its own: a write publishes `this.data` after it resolves, so a caller that
  // reads while one is in flight starts from the pre-write value and its later write wins.
  private mutateChain: Promise<unknown> = Promise.resolve()

  constructor(
    filename: string,
    defaultData: T,
    version: number = 1,
    hooks: ConfigFileHooks<T> = {},
  ) {
    const configDir = path.join(app.getPath('appData'), 'Photonics.rocks')

    // Log the storage directory (only once per process)
    if (!globalThis.__PHOTONICS_CONFIG_LOGGED__) {
      log.info(`[Photonics Config] JSON storage directory: ${configDir}`)
      globalThis.__PHOTONICS_CONFIG_LOGGED__ = true
    }

    this.filePath = path.join(configDir, filename)
    this.currentVersion = version
    this.defaultData = defaultData
    this.validate = hooks.validate
    this.onCorruptRecovery = hooks.onCorruptRecovery
    this.normalizeLoaded = hooks.normalizeLoaded
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

  private recoverToDefault(reason: ConfigCorruptReason, detail: RecoveryDetail): T {
    let canWriteDefaults = !fs.existsSync(this.filePath)

    if (fs.existsSync(this.filePath)) {
      const dest = corruptBackupFilePath(this.filePath)
      try {
        renameSyncWithRetry(this.filePath, dest)
        canWriteDefaults = true
      } catch (e) {
        log.error(
          `[Photonics Config] Could not preserve corrupt file by renaming ${this.filePath} → ${dest}:`,
          e,
        )
        canWriteDefaults = false
        this.corruptFileInPlace = true
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
      message = `${message}; corrupt file left in place and defaults in use. Repair it and relaunch to load it, or leave it and the next save moves it aside.`
    }

    this.onCorruptRecovery?.({
      fileName: path.basename(this.filePath),
      filePath: this.filePath,
      reason,
      message: message || undefined,
      ...(canWriteDefaults ? {} : { leftInPlace: true }),
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
    return this.freshDefaults()
  }

  /**
   * A private copy of the shipped defaults.
   *
   * `defaultData` is a module singleton, and what comes back from here becomes `this.data` and is
   * handed to every reader, so returning it directly would let one in-place edit anywhere change
   * the defaults for the rest of the process, and the next recovery would write that to disk.
   */
  private freshDefaults(): T {
    return structuredClone(this.defaultData)
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
      return this.freshDefaults()
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

    const decoded = this.decode(fileContent)
    if (!decoded.ok) {
      if (decoded.newerVersion !== undefined) {
        this.holdNewerFile(decoded.newerVersion, false)
        return this.freshDefaults()
      }
      return this.recoverToDefault(decoded.reason, decoded.detail)
    }

    if (decoded.version > this.currentVersion) {
      this.holdNewerFile(decoded.version, true)
    } else if (decoded.needsPersist) {
      this.save(decoded.data).catch((err) =>
        log.error(`[Photonics Config] Failed to save migrated data to ${this.filePath}:`, err),
      )
    }

    if (!this.hasLoggedLoad) {
      log.info(
        `[Photonics Config] Loaded configuration from ${this.filePath} (v${this.currentVersion})`,
      )
      this.hasLoggedLoad = true
    }

    return decoded.data
  }

  /**
   * A file from a newer build is never saved over, so it keeps the version the newer build stamped.
   * Its settings are in use when this build can read them, and defaults are otherwise.
   */
  private holdNewerFile(version: number, settingsInUse: boolean): void {
    this.newerVersionOnDisk = version
    const fileName = path.basename(this.filePath)
    const inUse = settingsInUse
      ? 'Its settings are in use'
      : 'This version cannot read its settings, so defaults are in use'
    const message = `Written by a newer version of Photonics (format ${version}, this version reads up to ${this.currentVersion}). ${inUse}, and changes are not saved to it while this version runs.`
    log.warn(`[Photonics Config] ${fileName}: ${message}`)
    this.onCorruptRecovery?.({
      fileName,
      filePath: this.filePath,
      reason: 'newerVersion',
      message,
      ...(settingsInUse ? {} : { leftInPlace: true }),
    })
  }

  /**
   * Reads a stored file's text into data: parse, migrate, repair, validate. The load and the check
   * for a hand repair share it, so both accept exactly the same files.
   */
  private decode(fileContent: string): DecodedFile<T> {
    let parsed: unknown
    try {
      parsed = JSON.parse(fileContent)
    } catch (error) {
      log.error(`[Photonics Config] JSON parse failed for ${this.filePath}:`, error)
      return { ok: false, reason: 'parse', detail: { parseOrMigrateError: error } }
    }

    const envelope = readEnvelope<T>(parsed)
    if (!envelope.ok) {
      const { schemaText } = envelope
      log.error(`[Photonics Config] Unusable version in ${this.filePath}: ${schemaText}`)
      return { ok: false, reason: 'schema', detail: { schemaText } }
    }

    const version = envelope.version
    // A newer build's file is held whatever this build makes of its shape.
    const newer = version > this.currentVersion ? { newerVersion: version } : {}

    let data: T
    let migratedNeedsPersist = false
    const repairs: ConfigCorruptInfo[] = []
    try {
      if (envelope.versioned) {
        data = envelope.data
      } else {
        // Unchecked like the versioned data above: `validate` below is the check.
        data = envelope.raw as T
      }
      if (version < this.currentVersion) {
        data = this.migrateData(data, version, this.currentVersion)
        migratedNeedsPersist = true
      }
      if (this.normalizeLoaded) {
        // Repair shape additions that a same-version file may predate (e.g. new required keys),
        // so validation below never fails on them. Persist only when it actually changed the data.
        const normalized = this.normalizeLoaded(data, (message, kind = 'reset') =>
          repairs.push({
            fileName: path.basename(this.filePath),
            filePath: this.filePath,
            reason: kind === 'dropped' ? 'keysDropped' : 'repaired',
            message,
          }),
        )
        if (normalized !== data) {
          data = normalized
          migratedNeedsPersist = true
        }
      }
    } catch (error) {
      log.error(
        `[Photonics Config] Migration or shape handling failed for ${this.filePath}:`,
        error,
      )
      return { ok: false, reason: 'schema', detail: { parseOrMigrateError: error }, ...newer }
    }

    if (this.validate) {
      const v = this.validate(data)
      if (!v.valid) {
        const schemaText = v.errors.join('; ')
        log.error(`[Photonics Config] Schema validation failed for ${this.filePath}:`, schemaText)
        return { ok: false, reason: 'schema', detail: { schemaText }, ...newer }
      }
    }

    for (const repair of repairs) this.onCorruptRecovery?.(repair)
    return { ok: true, data, version, needsPersist: migratedNeedsPersist }
  }

  /**
   * Migrates data from one version to another
   */
  private migrateData(data: T, fromVersion: number, toVersion: number): T {
    if (fromVersion === toVersion) {
      return data
    }

    log.info(`[Photonics Config] Migrating configuration from v${fromVersion} to v${toVersion}`)

    return migrateStepwise(data, fromVersion, toVersion, (d, from, to) =>
      this.applyMigration(d, from, to),
    )
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
    if (this.newerVersionOnDisk !== null) {
      throw new Error(
        `Failed to save configuration: ${path.basename(this.filePath)} is from a newer version of Photonics (format ${this.newerVersionOnDisk}) and is kept as it is`,
      )
    }
    const versionedData: ConfigWithVersion<T> = {
      version: this.currentVersion,
      data: data,
    }
    const content = JSON.stringify(versionedData, null, 2)
    this.ensureConfigDirectory(path.dirname(this.filePath))
    try {
      if (this.corruptFileInPlace) {
        try {
          await renameWithRetry(this.filePath, corruptBackupFilePath(this.filePath))
          log.info(
            `[Photonics Config] Moved the corrupt ${path.basename(this.filePath)} aside before saving`,
          )
        } catch (error) {
          // A file deleted or moved by hand since the load leaves nothing to preserve.
          if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
        }
        this.corruptFileInPlace = false
      }
      await writeFileAtomic(this.filePath, content)
    } catch (error) {
      log.error(`Error saving configuration to ${this.filePath}:`, error)
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
   * Updates the data and saves to file.
   *
   * Data is validated before it reaches disk: an invalid value on disk fails {@link load}'s check on
   * the next launch, and {@link recoverToDefault} then renames the whole file aside, so the user
   * silently loses every setting in it.
   *
   * The check lives here rather than in {@link save} because `save` is also the write path for
   * {@link recoverToDefault}, {@link load} and {@link applyLoadMigration}. Gating those would let a
   * validator fault block corruption recovery itself, leaving the file moved aside with nothing
   * written back. `update` is the only caller carrying user edits, so it is the only one that needs
   * the gate. `this.data` takes the new value only once the save succeeds, so a refused or failed
   * save leaves the in-memory state as it was. The write waits its turn behind every update and
   * {@link mutate} called before it.
   *
   * `newData` may have been built before a hand repair was adopted, so the first update after an
   * adopt copies the file on disk aside before replacing it.
   */
  async update(newData: T): Promise<void> {
    return this.enqueue(async () => {
      await this.copyAdoptedRepair()
      await this.write(newData)
    })
  }

  /** Keeps the adopted hand repair, and whatever turns since added to it, as a sibling copy. */
  private async copyAdoptedRepair(): Promise<void> {
    if (!this.repairNotCopied) {
      return
    }
    const dest = repairedCopyFilePath(this.filePath)
    try {
      await fsPromises.copyFile(this.filePath, dest)
    } catch (error) {
      // A file deleted or moved by hand since the adopt leaves nothing to keep.
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
      this.repairNotCopied = false
      return
    }
    this.repairNotCopied = false
    const fileName = path.basename(this.filePath)
    log.info(`[Photonics Config] Kept the repaired ${fileName} as ${path.basename(dest)}`)
    this.onCorruptRecovery?.({
      fileName,
      filePath: this.filePath,
      reason: 'repairCopied',
      message: `The repaired file was saved as ${path.basename(dest)} before a save replaced it.`,
    })
  }

  private async write(newData: T): Promise<void> {
    if (this.validate) {
      const v = this.validate(newData)
      if (!v.valid) {
        const detail = v.errors.join('; ')
        log.error(`[Photonics Config] Refusing to save invalid data to ${this.filePath}: ${detail}`)
        throw new Error(`Invalid configuration for ${path.basename(this.filePath)}: ${detail}`)
      }
    }

    await this.save(newData)
    this.data = newData
  }

  /**
   * Applies `change` to the current data and saves the result as one serialized turn, so a
   * concurrent mutation cannot read the same starting value and overwrite this one. Use this
   * instead of `get()` followed by `update()` for anything carrying user edits.
   *
   * `change` runs against the freshest data and must return the new value rather than mutating
   * its argument. Returning the input unchanged skips the write.
   */
  async mutate(change: (current: T) => T): Promise<void> {
    return this.enqueue(async () => {
      const next = change(this.data)
      if (next === this.data) {
        return
      }
      await this.write(next)
    })
  }

  private enqueue(turn: () => Promise<void>): Promise<void> {
    const adoptThenTurn = async (): Promise<void> => {
      await this.adoptRepairedFile()
      await turn()
    }
    // Both arms run the turn: a rejected predecessor must not skip this one.
    const run = this.mutateChain.then(adoptThenTurn, adoptThenTurn)
    // A failed turn must not poison the ones behind it.
    this.mutateChain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /**
   * A corrupt file left in place at load may have been repaired by hand since. One that now reads
   * cleanly becomes the data the turn starts from, and the write saves over it.
   */
  private async adoptRepairedFile(): Promise<void> {
    if (!this.corruptFileInPlace) {
      return
    }
    let content: string
    try {
      content = await fsPromises.readFile(this.filePath, 'utf-8')
    } catch {
      // Gone or unreadable, which the write's move-aside handles.
      return
    }
    const decoded = this.decode(content)
    if (decoded.ok) {
      this.data = decoded.data
      this.corruptFileInPlace = false
      this.repairNotCopied = true
      log.info(`[Photonics Config] Adopted the repaired ${path.basename(this.filePath)}`)
      if (decoded.version > this.currentVersion) {
        this.holdNewerFile(decoded.version, true)
      }
    } else if (decoded.newerVersion !== undefined) {
      this.corruptFileInPlace = false
      this.holdNewerFile(decoded.newerVersion, false)
    }
  }

  /**
   * Commits a load-time migration: the new shape becomes readable immediately, and the write to
   * disk follows. {@link update} deliberately publishes only after a successful save, which is
   * right for user edits (a failed write must not leave the app showing state it didn't persist)
   * but wrong for a migration — every reader between startup and the write landing would get the
   * legacy shape the rest of the app no longer understands. A failed write is logged and left for
   * the next launch to retry, since the in-memory shape is the correct one either way.
   */
  applyLoadMigration(newData: T): void {
    this.data = newData
    this.save(newData).catch((err) =>
      log.error(`Failed to persist migrated configuration to ${this.filePath}:`, err),
    )
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
