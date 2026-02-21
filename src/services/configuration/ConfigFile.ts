import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as fsPromises from 'fs/promises'

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

  constructor(filename: string, defaultData: T, version: number = 1) {
    const configDir = path.join(app.getPath('appData'), 'Photonics.rocks')

    // Log the storage directory (only once per process)
    if (!global.__PHOTONICS_CONFIG_LOGGED__) {
      console.log(`[Photonics Config] JSON storage directory: ${configDir}`)
      global.__PHOTONICS_CONFIG_LOGGED__ = true
    }

    this.filePath = path.join(configDir, filename)
    this.currentVersion = version
    this.defaultData = defaultData
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

  /**
   * Loads data from file or returns default if file doesn't exist
   */
  private load(): T {
    if (fs.existsSync(this.filePath)) {
      try {
        const fileContent = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(fileContent)

        // Handle versioned and non-versioned formats
        let data: T
        let version: number

        if (this.isVersionedFormat(parsed)) {
          data = parsed.data
          version = parsed.version
        } else {
          // Legacy format without versioning
          data = parsed
          version = 0
        }

        // Migrate if needed
        if (version < this.currentVersion) {
          data = this.migrateData(data, version, this.currentVersion)
          // Save migrated data (fire-and-forget: we are in constructor, cannot await)
          this.save(data).catch((err) =>
            console.error(
              `[Photonics Config] Failed to save migrated data to ${this.filePath}:`,
              err,
            ),
          )
        }

        // Only log on first load per file
        if (!this.hasLoggedLoad) {
          console.log(
            `[Photonics Config] Loaded configuration from ${this.filePath} (v${this.currentVersion})`,
          )
          this.hasLoggedLoad = true
        }

        return data
      } catch (error) {
        console.error(`Error loading configuration from ${this.filePath}:`, error)
        console.log('Using default configuration')
        this.save(this.defaultData).catch((err) =>
          console.error(
            `[Photonics Config] Failed to save default config to ${this.filePath}:`,
            err,
          ),
        )
        return this.defaultData
      }
    } else {
      console.log(`Configuration file not found: ${this.filePath}, creating default`)
      this.save(this.defaultData).catch((err) =>
        console.error(`[Photonics Config] Failed to save default config to ${this.filePath}:`, err),
      )
      return this.defaultData
    }
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
  private applyMigration(data: T, _fromVersion: number, _toVersion: number): T {
    // Override this method in subclasses to implement specific migrations
    // For now, return the data as-is (no migrations defined)
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
    const basename = path.basename(this.filePath)
    const tempPath = path.join(dir, `.${basename}.tmp.${process.pid}`)
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
    this.data = newData
    await this.save(newData)
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
