import { EventEmitter } from 'events'
import * as fs from 'fs/promises'
import * as path from 'path'
import chokidar, { FSWatcher } from 'chokidar'
import { realPathOf } from '../../../helpers/realPath'
import { writeFileAtomic } from '../../../helpers/atomicFileWrite'
import type { NodeFileChanges } from './migrateOlderNodeFile'
import { createLogger } from '../../../../shared/logger'

const log = createLogger('BaseNodeFileLoader')

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
 * - {@link readAndRegister} parse + validate + register a single file (per-loader)
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
  /** What the load changed in a file an older build wrote, which it then saved. */
  migrations?: string[]
  /** What the load read differently in a file it left as it is on disk, and why it left it. */
  unsaved?: string[]
}

const GROUP_ID_REFUSED_ADVICE = 'Import this file to give it a group ID of its own.'

/** One summary bucket per mode, keyed by the mode discriminant. */
export type BaseListSummary<TMode extends string, TSummary> = Record<TMode, TSummary[]>

export interface BaseLoadResult {
  loaded: number
  failed: number
  errors: string[]
  /** One line per change made to a file an older build wrote, led by the file's name. */
  migrations: string[]
  /** One line per file the load read differently and left as it is on disk, led by its name. */
  unsaved: string[]
}

export const isJsonFile = (filename: string): boolean => filename.toLowerCase().endsWith('.json')

/** The group id a file holds, or was refused, in its mode. */
export interface GroupIdClaim<TMode extends string> {
  mode: TMode
  groupId: string
}

const sameGroupId = <TMode extends string>(
  a: GroupIdClaim<TMode>,
  b: GroupIdClaim<TMode>,
): boolean => a.mode === b.mode && a.groupId.trim().toLowerCase() === b.groupId.trim().toLowerCase()

const errorCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined

/** Write a new file, refusing a path that already holds one. */
async function createFile(filePath: string, contents: string): Promise<void> {
  try {
    await fs.writeFile(filePath, contents, { encoding: 'utf-8', flag: 'wx' })
  } catch (error) {
    if (errorCode(error) === 'EEXIST') {
      throw new Error(
        `A file named '${path.basename(filePath)}' already exists. Choose a different name.`,
      )
    }
    throw error
  }
}

/** A rename replaces a read-only file, so a file's own write permission is checked first. */
async function assertWritableIfPresent(filePath: string): Promise<void> {
  try {
    await fs.access(filePath, fs.constants.W_OK)
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }
}

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
   * What the last save of each file wrote and loaded, so the watcher's report of that same write
   * does not load it a second time.
   */
  private readonly savedContents = new Map<string, string>()

  /** Files a load refused a group id another file holds, by path. */
  private readonly refusedGroupIds = new Map<string, GroupIdClaim<TMode>>()

  /** Group ids a file let go of since the last change was reported. */
  private releasedGroupIds: GroupIdClaim<TMode>[] = []

  /**
   * @param baseDir application base directory
   * @param subDir  segment under `node-data` that scopes this loader's roots,
   *                e.g. `'cues'` or `'effects'`.
   * @param modes   the mode discriminants this loader handles; each maps to a
   *                directory `<baseDir>/node-data/<subDir>/<mode>` and a summary
   *                bucket.
   * @param fileKind what messages call one of this loader's files, e.g. `'cue'`.
   */
  constructor(
    baseDir: string,
    subDir: string,
    modes: readonly TMode[],
    private readonly fileKind: string,
  ) {
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

  /** The mode discriminants this loader handles, which IPC payloads are checked against. */
  public getModes(): readonly TMode[] {
    return this.modes
  }

  // ---- per-loader specifics -------------------------------------------------

  /** Parse, validate and register a single file; returns its summary. */
  protected abstract readAndRegister(mode: TMode, filePath: string): Promise<TSummary>

  /** Remove the registration a file holds, letting go of its group id. */
  protected abstract removeRegistration(filePath: string): void

  /** The group id each file holding one holds, by path. */
  protected abstract heldGroupIds(): Iterable<[string, GroupIdClaim<TMode>]>

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
        migrations: acc.migrations.concat(curr.migrations),
        unsaved: acc.unsaved.concat(curr.unsaved),
      }),
      { loaded: 0, failed: 0, errors: [], migrations: [], unsaved: [] },
    )

    await this.publishChanges()
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
    // Sorted, so files load and groups register in the same order on every platform. readdir hands
    // them back in whatever order the filesystem keeps.
    const files = (await fs.readdir(dir).catch(() => [] as string[])).sort().filter(isJsonFile)

    // A file loaded before and gone from disk since (e.g. a manual reload() with no chokidar unlink
    // event) is dropped before any file loads, so a group id it held is free for the files that do.
    const currentPaths = new Set(files.map((file) => path.join(dir, file)))
    for (const { path: stalePath } of this.summaries[mode]) {
      if (!currentPaths.has(stalePath)) this.forgetFile(stalePath)
    }

    let loaded = 0
    let failed = 0
    const errors: string[] = []
    const migrations: string[] = []
    const unsaved: string[] = []
    const summaries: TSummary[] = []

    for (const file of files) {
      const filePath = path.join(dir, file)
      try {
        const summary = await this.loadFile(mode, filePath)
        if (!summary) continue
        summaries.push(summary)
        for (const note of summary.migrations ?? []) migrations.push(`${file}: ${note}`)
        for (const note of summary.unsaved ?? []) unsaved.push(`${file}: ${note}`)
        loaded++
      } catch (error) {
        failed++
        const message = error instanceof Error ? error.message : String(error)
        summaries.push(this.makeErrorSummary(mode, filePath, message))
        errors.push(`${path.basename(file)}: ${message}`)
      }
    }

    this.summaries[mode] = summaries
    return { loaded, failed, errors, migrations, unsaved }
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

    this.watcher.on('add', (file) => void this.handleFileChange(file))
    this.watcher.on('change', (file) => void this.handleFileChange(file))
    this.watcher.on('unlink', (file) => void this.handleFileRemoved(file))
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
    if (await this.isOwnSave(filePath)) {
      return
    }

    await this.loadFileRecordingErrors(mode, filePath)
    await this.publishChanges()
  }

  /**
   * Load one file of a mode. A file whose links lead outside the mode's folder is not loaded, and
   * whatever it registered before is dropped, so it reads as no file at all. Returns null for it.
   */
  protected async loadFile(mode: TMode, filePath: string): Promise<TSummary | null> {
    this.refusedGroupIds.delete(filePath)
    if (!this.isPathWithinDir(filePath, this.dirs[mode])) {
      log.warn(`Skipping ${filePath}: it links outside ${this.dirs[mode]}.`)
      this.forgetFile(filePath)
      return null
    }
    return this.readAndRegister(mode, filePath)
  }

  /**
   * Load one file, and when that fails record an error summary for it, so the editor flags the
   * file.
   */
  protected async loadFileRecordingErrors(mode: TMode, filePath: string): Promise<void> {
    try {
      await this.loadFile(mode, filePath)
    } catch (error) {
      this.onFileChangeError(filePath, error)
      const message = error instanceof Error ? error.message : String(error)
      this.updateSummary(this.makeErrorSummary(mode, filePath, message))
    }
  }

  /**
   * Write a file a save produced, noting what was written for {@link isOwnSave}. A create-only
   * write refuses a path that already holds a file. Any other write replaces the file whole
   * through a temp file, and refuses a file the user made read-only.
   */
  protected async writeSavedFile(
    filePath: string,
    contents: string,
    createOnly: boolean,
  ): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    if (createOnly) {
      await createFile(filePath, contents)
    } else {
      await assertWritableIfPresent(filePath)
      await writeFileAtomic(filePath, contents)
    }
    this.savedContents.set(path.resolve(filePath), contents)
  }

  /**
   * Write back a file a load brought forward from an older build, with the `changes` the load
   * made. The changes are reported as saved once the write lands. A file holding values this build
   * does not know is left as it is, and so is one whose write fails. Both are reported as unsaved,
   * and the next load reads them the same way again.
   */
  protected async writeMigratedFile(
    filePath: string,
    data: unknown,
    changes: NodeFileChanges,
  ): Promise<Pick<BaseFileSummary<TMode>, 'migrations' | 'unsaved'>> {
    const notes = changes.older
    if (changes.unknown.length > 0) {
      return {
        unsaved: [
          `Holds values this version does not know and is left as it is on disk: ${[...changes.unknown, ...notes].join(' ')}`,
        ],
      }
    }
    if (notes.length === 0) return {}
    try {
      await this.writeSavedFile(filePath, JSON.stringify(data, null, 2), false)
      return { migrations: [...notes] }
    } catch (error) {
      log.warn('Could not save the brought-forward file', filePath, error)
      const code = errorCode(error)
      const reason =
        typeof code === 'string' ? code : error instanceof Error ? error.message : String(error)
      return {
        unsaved: [
          `Could not save the update from an older version (${reason}), so each load updates it again: ${notes.join(' ')}`,
        ],
      }
    }
  }

  /** Whether the file on disk is still exactly what the last save of it wrote and loaded. */
  private async isOwnSave(filePath: string): Promise<boolean> {
    const key = path.resolve(filePath)
    const saved = this.savedContents.get(key)
    if (saved === undefined) {
      return false
    }
    this.savedContents.delete(key)
    const onDisk = await fs.readFile(filePath, 'utf-8').catch(() => null)
    return onDisk === saved
  }

  protected async handleFileRemoved(filePath: string): Promise<void> {
    this.forgetFile(filePath)
    await this.publishChanges()
  }

  /** Drop a file's registration and its summary. */
  protected forgetFile(filePath: string): void {
    this.refusedGroupIds.delete(filePath)
    this.removeRegistration(filePath)
    this.removeSummary(filePath)
  }

  /**
   * Load again, in name order, each file refused a group id a file has since let go of, so the
   * first of them takes it. Then report the summary.
   */
  protected async publishChanges(): Promise<void> {
    while (this.releasedGroupIds.length > 0) {
      const released = this.releasedGroupIds
      this.releasedGroupIds = []
      const waiting = [...this.refusedGroupIds]
        .filter(([, refused]) => released.some((claim) => sameGroupId(claim, refused)))
        .sort(([a], [b]) => (path.basename(a) < path.basename(b) ? -1 : 1))
      for (const [filePath, { mode }] of waiting) {
        await this.loadFileRecordingErrors(mode, filePath)
      }
    }
    this.emit('changed', this.getSummary())
  }

  // ---- group ids ------------------------------------------------------------

  /** Note that a file has let go of a group id, so a file refused it can take it. */
  protected releaseGroupId(mode: TMode, groupId: string): void {
    this.releasedGroupIds.push({ mode, groupId })
  }

  /** The path of another file in the mode that holds this group id, if one does. */
  protected groupIdHolder(filePath: string, mode: TMode, groupId: string): string | undefined {
    const target = path.resolve(filePath)
    for (const [heldPath, held] of this.heldGroupIds()) {
      if (sameGroupId(held, { mode, groupId }) && path.resolve(heldPath) !== target) {
        return heldPath
      }
    }
    return undefined
  }

  private groupIdTaken(holder: string, mode: TMode, groupId: string, advice: string): Error {
    return new Error(
      `The ${mode} ${this.fileKind} file ${path.basename(holder)} already uses group id '${groupId}'. ${advice}`,
    )
  }

  /** Throw when another file in the mode holds the group id, ending the message with `advice`. */
  protected assertGroupIdFree(
    filePath: string,
    mode: TMode,
    groupId: string,
    advice: string,
  ): void {
    const holder = this.groupIdHolder(filePath, mode, groupId)
    if (holder) throw this.groupIdTaken(holder, mode, groupId, advice)
  }

  /**
   * Settle the group id a load claims. The first file in name order holds it, so a load is refused
   * an id an earlier-named file holds, and takes one a later-named file holds. Returns the file it
   * takes the id from, which it hands to {@link refuseGroupId} once it holds the id.
   */
  protected claimGroupId(filePath: string, mode: TMode, groupId: string): string | undefined {
    const holder = this.groupIdHolder(filePath, mode, groupId)
    if (holder === undefined) return undefined
    if (path.basename(holder) < path.basename(filePath)) {
      this.removeRegistration(filePath)
      this.refusedGroupIds.set(filePath, { mode, groupId })
      throw this.groupIdTaken(holder, mode, groupId, GROUP_ID_REFUSED_ADVICE)
    }
    return holder
  }

  /** Record a file as refused the group id `holder` has taken from it. */
  protected refuseGroupId(filePath: string, mode: TMode, groupId: string, holder: string): void {
    this.refusedGroupIds.set(filePath, { mode, groupId })
    const { message } = this.groupIdTaken(holder, mode, groupId, GROUP_ID_REFUSED_ADVICE)
    this.updateSummary(this.makeErrorSummary(mode, filePath, message))
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

  /** The mode whose folder holds the path itself, before any link in it is followed. */
  protected getModeFromPath(filePath: string): TMode | null {
    const folder = path.dirname(path.resolve(filePath))
    return this.modes.find((mode) => path.resolve(this.dirs[mode]) === folder) ?? null
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
   * Resolves a user-supplied path to an absolute path to a file in one of this loader's mode
   * folders, with every link in it leading back into that folder, and that folder's mode. Relative
   * segments are anchored to {@link baseDir} so paths cannot escape via cwd. The `label` is woven
   * into the error messages so each loader keeps its existing wording (e.g. "Node cue").
   */
  protected resolveExistingFilePath(
    userPath: string,
    label: string,
    dirLabel: string,
  ): { filePath: string; mode: TMode } {
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
    const mode = this.getModeFromPath(resolved)
    if (mode === null || !this.isPathWithinDir(resolved, this.dirs[mode])) {
      throw new Error(`${dirLabel}`)
    }
    return { filePath: resolved, mode }
  }

  protected resolveInDir(baseDir: string, filename: string): string {
    const resolvedBase = this.resolvePath(baseDir)
    const resolvedPath = this.resolvePath(path.join(resolvedBase, filename))
    if (!this.isPathWithinDir(resolvedPath, resolvedBase)) {
      throw new Error('Resolved path is outside of the allowed directory.')
    }
    return resolvedPath
  }

  /**
   * Whether a path lies in a directory once every link in either is followed, so a link inside a
   * mode directory cannot lead a load or a save outside it.
   */
  protected isPathWithinDir(targetPath: string, baseDir: string): boolean {
    const resolvedBase = this.resolvePath(baseDir)
    const realBase = realPathOf(resolvedBase) ?? resolvedBase
    const realTarget = realPathOf(this.resolvePath(targetPath))
    if (realTarget === null) return false
    return realTarget === realBase || realTarget.startsWith(`${realBase}${path.sep}`)
  }
}
