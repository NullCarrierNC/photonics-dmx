import { EventEmitter } from 'events'
import * as fs from 'fs/promises'
import * as path from 'path'
import chokidar, { FSWatcher } from 'chokidar'

/**
 * Shared file-system plumbing for the node-cue and effect loaders.
 *
 * Owns the orchestration both {@link NodeCueLoader} and {@link EffectLoader}
 * need: reading JSON files from one directory per mode under a base dir,
 * registering the results, keeping a per-mode summary list, watching the
 * directories for changes, and sandboxing all paths to those roots.
 *
 * The mode discriminant is a string union that differs per loader
 * (`NodeCueMode` = `'yarg' | 'audio' | 'rb3'`, `EffectMode` = `'yarg' | 'audio'`),
 * captured here as the generic `TMode extends string`. The concrete mode list is
 * supplied to the constructor, so each mode is a data-driven directory/summary
 * bucket rather than a hardcoded branch. `TSummary` is the per-file summary entry
 * type, which always carries at least a `path` and `mode`.
 *
 * Subclasses supply only their specifics via the protected abstract hooks:
 * - {@link loadFile} parse + validate + register a single file (per-loader)
 * - {@link removeRegistration} unregister/forget a single file on unlink
 * - {@link makeErrorSummary} build the placeholder summary for a failed file
 *
 * Subclasses keep their own loader-specific public API on top (readFile,
 * saveFile, deleteFile, the *ForIpc resolvers, conflict checks, etc.).
 */
export interface BaseFileSummary<TMode extends string> {
  path: string
  mode: TMode
  updatedAt: number
  errors?: string[]
}

/** One summary bucket per mode, keyed by the mode discriminant. */
export type BaseListSummary<TMode extends string, TSummary> = Record<TMode, TSummary[]>

export interface BaseLoadResult {
  loaded: number
  failed: number
  errors: string[]
}

export const isJsonFile = (filename: string): boolean => filename.toLowerCase().endsWith('.json')

export abstract class BaseNodeFileLoader<
  TMode extends string,
  TSummary extends BaseFileSummary<TMode>,
> extends EventEmitter {
  protected readonly baseDir: string
  protected readonly modes: readonly TMode[]
  protected readonly dirs: Record<TMode, string>
  protected watcher: FSWatcher | null = null
  protected summaries: BaseListSummary<TMode, TSummary>

  /**
   * @param baseDir application base directory
   * @param subDir  segment under `node-data` that scopes this loader's roots,
   *                e.g. `'cues'` or `'effects'`.
   * @param modes   the mode discriminants this loader handles; each maps to a
   *                directory `<baseDir>/node-data/<subDir>/<mode>` and a summary
   *                bucket.
   */
  constructor(baseDir: string, subDir: string, modes: readonly TMode[]) {
    super()
    this.baseDir = baseDir
    this.modes = modes
    this.dirs = {} as Record<TMode, string>
    this.summaries = {} as BaseListSummary<TMode, TSummary>
    for (const mode of modes) {
      this.dirs[mode] = path.join(this.baseDir, 'node-data', subDir, mode)
      this.summaries[mode] = []
    }
  }

  // ---- per-loader specifics -------------------------------------------------

  /** Parse, validate and register a single file; returns its summary. */
  protected abstract loadFile(mode: TMode, filePath: string): Promise<TSummary | null>

  /** Remove a file's registration/summary (used on unlink). */
  protected abstract removeRegistration(filePath: string): void

  /** Build a placeholder summary describing a file that failed to load. */
  protected abstract makeErrorSummary(mode: TMode, filePath: string, message: string): TSummary

  // ---- orchestration --------------------------------------------------------

  public async loadAll(): Promise<BaseLoadResult> {
    await this.ensureDirectories()
    this.onBeforeLoadAll()

    const results = await Promise.all(this.modes.map((mode) => this.loadDirectory(mode)))

    const summary = results.reduce<BaseLoadResult>(
      (acc, curr) => ({
        loaded: acc.loaded + curr.loaded,
        failed: acc.failed + curr.failed,
        errors: acc.errors.concat(curr.errors),
      }),
      { loaded: 0, failed: 0, errors: [] },
    )

    this.emit('changed', this.getSummary())
    return summary
  }

  public async reload(): Promise<BaseLoadResult> {
    return this.loadAll()
  }

  /** Hook for subclasses to reset transient state before a full (re)load. */
  protected onBeforeLoadAll(): void {}

  public getSummary(): BaseListSummary<TMode, TSummary> {
    const result = {} as BaseListSummary<TMode, TSummary>
    for (const mode of this.modes) {
      result[mode] = [...this.summaries[mode]]
    }
    return result
  }

  protected async ensureDirectories(): Promise<void> {
    await Promise.all(this.modes.map((mode) => fs.mkdir(this.dirs[mode], { recursive: true })))
  }

  protected async loadDirectory(mode: TMode): Promise<BaseLoadResult> {
    const dir = this.dirs[mode]
    const files = await fs.readdir(dir).catch(() => [] as string[])

    // Paths this mode registered on its previous load, so a file that has since vanished from disk
    // (e.g. a manual reload() with no chokidar unlink event) is unregistered rather than left stale
    // in the registry.
    const previousPaths = new Set(this.summaries[mode].map((s) => s.path))
    const currentPaths = new Set<string>()

    let loaded = 0
    let failed = 0
    const errors: string[] = []
    const summaries: TSummary[] = []

    for (const file of files) {
      if (!isJsonFile(file)) {
        continue
      }

      const filePath = path.join(dir, file)
      currentPaths.add(filePath)
      try {
        const summary = await this.loadFile(mode, filePath)
        if (summary) {
          summaries.push(summary)
        }
        loaded++
      } catch (error) {
        failed++
        const message = error instanceof Error ? error.message : String(error)
        summaries.push(this.makeErrorSummary(mode, filePath, message))
        errors.push(`${path.basename(file)}: ${message}`)
      }
    }

    // Unregister files present last time but gone now.
    for (const stalePath of previousPaths) {
      if (!currentPaths.has(stalePath)) {
        this.removeRegistration(stalePath)
      }
    }

    this.summaries[mode] = summaries
    return { loaded, failed, errors }
  }

  // ---- watching -------------------------------------------------------------

  public async startWatching(): Promise<void> {
    await this.ensureDirectories()

    this.watcher = chokidar.watch(
      this.modes.map((mode) => this.dirs[mode]),
      {
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100,
        },
      },
    )

    this.watcher.on('add', (file) => this.handleFileChange(file))
    this.watcher.on('change', (file) => this.handleFileChange(file))
    this.watcher.on('unlink', (file) => this.handleFileRemoved(file))
  }

  public async dispose(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }

  protected async handleFileChange(filePath: string): Promise<void> {
    const mode = this.getModeFromPath(filePath)
    if (!mode || !isJsonFile(filePath)) {
      return
    }

    try {
      await this.loadFile(mode, filePath)
      this.emit('changed', this.getSummary())
    } catch (error) {
      // A watch-triggered load failure (invalid JSON / failed validation) must not pass
      // silently: record an error summary for the file and emit it so the editor flags the
      // file instead of showing the last good state as if nothing changed.
      this.onFileChangeError(filePath, error)
      const message = error instanceof Error ? error.message : String(error)
      this.updateSummary(this.makeErrorSummary(mode, filePath, message))
      this.emit('changed', this.getSummary())
    }
  }

  protected handleFileRemoved(filePath: string): void {
    this.removeRegistration(filePath)
    this.emit('changed', this.getSummary())
  }

  /** Subclass hook to log a failed watch-triggered reload. */
  protected abstract onFileChangeError(filePath: string, error: unknown): void

  // ---- summary bookkeeping --------------------------------------------------

  protected updateSummary(summary: TSummary): void {
    const summaries = this.summaries[summary.mode]
    const existingIndex = summaries.findIndex((item) => item.path === summary.path)
    if (existingIndex >= 0) {
      summaries[existingIndex] = summary
    } else {
      summaries.push(summary)
    }
  }

  protected removeSummary(filePath: string): void {
    for (const mode of this.modes) {
      this.summaries[mode] = this.summaries[mode].filter((summary) => summary.path !== filePath)
    }
  }

  // ---- path helpers ---------------------------------------------------------

  protected getModeFromPath(filePath: string): TMode | null {
    for (const mode of this.modes) {
      if (this.isPathWithinDir(filePath, this.dirs[mode])) {
        return mode
      }
    }
    return null
  }

  protected sanitizeFilename(filename: string): string {
    const baseName = path.basename(filename)
    if (!baseName || baseName === '.' || baseName === '..') {
      throw new Error('Invalid filename.')
    }
    if (baseName !== filename) {
      throw new Error('Invalid filename. Subdirectories are not allowed.')
    }
    return baseName.endsWith('.json') ? baseName : `${baseName}.json`
  }

  protected resolvePath(targetPath: string): string {
    return path.resolve(targetPath)
  }

  /**
   * Resolves a user-supplied path to an absolute path that must lie under one of
   * this loader's mode roots. Relative segments are anchored to {@link baseDir} so
   * paths cannot escape via cwd. The `label` is woven into the error messages so
   * each loader keeps its existing wording (e.g. "Node cue", "Effect file").
   */
  protected resolveExistingFilePath(userPath: string, label: string, dirLabel: string): string {
    if (typeof userPath !== 'string' || userPath.trim().length === 0) {
      throw new Error(`${label} is required.`)
    }
    if (userPath.includes('\0')) {
      throw new Error(`${label} must not contain null bytes.`)
    }
    const trimmed = userPath.trim()
    const resolved = path.isAbsolute(trimmed)
      ? path.resolve(trimmed)
      : path.resolve(this.baseDir, trimmed)
    if (!this.modes.some((mode) => this.isPathWithinDir(resolved, this.dirs[mode]))) {
      throw new Error(`${dirLabel}`)
    }
    return resolved
  }

  protected resolveInDir(baseDir: string, filename: string): string {
    const resolvedBase = this.resolvePath(baseDir)
    const resolvedPath = this.resolvePath(path.join(resolvedBase, filename))
    if (!this.isPathWithinDir(resolvedPath, resolvedBase)) {
      throw new Error('Resolved path is outside of the allowed directory.')
    }
    return resolvedPath
  }

  protected isPathWithinDir(targetPath: string, baseDir: string): boolean {
    const resolvedBase = this.resolvePath(baseDir)
    const resolvedTarget = this.resolvePath(targetPath)
    return (
      resolvedTarget === resolvedBase || resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)
    )
  }
}
