import * as fs from 'fs/promises'
import * as path from 'path'
import { validateEffectFile, validateEffectFileInFolder } from '../schema/validation'
import { EffectCompiler } from '../compiler/EffectCompiler'
import { migrateOlderNodeFile, variableRenamesOf } from './migrateOlderNodeFile'
import { EffectFile, EffectMode } from '../../types/nodeCueTypes'
import { createLogger } from '../../../../shared/logger'
import {
  BaseNodeFileLoader,
  BaseListSummary,
  BaseLoadResult,
  isJsonFile,
  type GroupIdClaim,
} from './BaseNodeFileLoader'
const log = createLogger('EffectLoader')

export interface EffectFileSummary {
  path: string
  groupId: string
  groupName: string
  effectCount: number
  mode: EffectMode
  updatedAt: number
  errors?: string[]
  /**
   * Non-fatal findings from validation: the file loaded, but something in it will not do what it
   * looks like it does.
   */
  warnings?: string[]
  /** What the load changed in a file an older build wrote, which it then saved. */
  migrations?: string[]
  /** What the load read differently in a file it left as it is on disk, and why it left it. */
  unsaved?: string[]
  bundled?: boolean
}

export type EffectListSummary = BaseListSummary<EffectMode, EffectFileSummary>

export type EffectLoadResult = BaseLoadResult

interface EffectLoaderOptions {
  baseDir: string
}

export class EffectLoader extends BaseNodeFileLoader<EffectMode, EffectFileSummary> {
  /** The group id each loaded effect file holds, by path. A file that fails its load holds none. */
  private readonly groupHolders = new Map<string, GroupIdClaim<EffectMode>>()

  /** The renames a load gave each loaded file's variable names, by path. */
  private readonly variableRenames = new Map<string, ReadonlyMap<string, string>>()

  constructor(options: EffectLoaderOptions) {
    super(options.baseDir, 'effects', ['yarg', 'audio'], 'effect')
  }

  public async readFile(filePath: string): Promise<EffectFile> {
    const { filePath: resolvedPath, mode } = this.resolveExistingEffectFilePath(filePath)
    const data = await fs.readFile(resolvedPath, 'utf-8')
    const parsed: unknown = JSON.parse(data)
    migrateOlderNodeFile(parsed)
    const validation = validateEffectFileInFolder(mode, parsed)

    if (!validation.valid) {
      throw new Error(`Invalid effect file: ${validation.errors.join(', ')}`)
    }

    if (!validation.data) {
      throw new Error('Effect file validation returned no data')
    }

    return validation.data
  }

  /**
   * Resolves a renderer-supplied path to an absolute path inside the YARG/audio effect roots,
   * or throws. Use this when an IPC handler needs the rooted path (e.g. for fs.copyFile during
   * export) and must not trust the raw IPC string.
   */
  public resolveEffectFilePathForIpc(filePath: string): string {
    return this.resolveExistingEffectFilePath(filePath).filePath
  }

  /**
   * Write a file into a mode's folder and load it. A create-only save refuses a filename that is
   * already taken, and any other save replaces the file at that path.
   */
  public async saveFile(
    mode: EffectMode,
    filename: string,
    content: EffectFile,
    options: { createOnly?: boolean } = {},
  ): Promise<{ success: boolean; path: string }> {
    if (content.mode !== mode) {
      throw new Error('File mode does not match payload mode.')
    }

    const validation = validateEffectFile(content)
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '))
    }

    const targetDir = this.dirs[mode]
    const sanitizedName = this.sanitizeFilename(filename)
    const filePath = this.resolveInDir(targetDir, sanitizedName)

    this.assertGroupIdFree(filePath, mode, content.group.id, 'Choose a different group ID.')

    await this.writeSavedFile(
      filePath,
      JSON.stringify(content, null, 2),
      options.createOnly ?? false,
    )
    await this.loadFile(mode, filePath)

    await this.publishChanges()
    return { success: true, path: filePath }
  }

  public async deleteFile(filePath: string): Promise<{ success: boolean }> {
    const { filePath: resolvedPath } = this.resolveExistingEffectFilePath(filePath)
    await fs.rm(resolvedPath, { force: true })
    this.forgetFile(resolvedPath)
    await this.publishChanges()
    return { success: true }
  }

  /**
   * Every valid effect file of a mode by group id, read from disk in one pass. Invalid files are
   * skipped. A group id two files share goes to the file the loader let hold it, or else to the
   * first in name order.
   */
  public async readEffectFilesByGroupId(mode: EffectMode): Promise<Map<string, EffectFile>> {
    const dir = this.dirs[mode]
    const files = (await fs.readdir(dir).catch(() => [] as string[])).sort()
    const byGroupId = new Map<string, EffectFile>()

    for (const file of files) {
      if (!isJsonFile(file)) {
        continue
      }
      try {
        const filePath = path.join(dir, file)
        const effectFile = await this.readFile(filePath)
        if (this.groupIdHolder(filePath, mode, effectFile.group.id)) {
          continue
        }
        if (!byGroupId.has(effectFile.group.id)) {
          byGroupId.set(effectFile.group.id, effectFile)
        }
      } catch {
        // Skip invalid files
      }
    }

    return byGroupId
  }

  protected async readAndRegister(mode: EffectMode, filePath: string): Promise<EffectFileSummary> {
    try {
      return await this.readAndHold(mode, filePath)
    } catch (error) {
      this.removeRegistration(filePath)
      throw error
    }
  }

  private async readAndHold(mode: EffectMode, filePath: string): Promise<EffectFileSummary> {
    const contents = await fs.readFile(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(contents)
    const renames = variableRenamesOf(parsed)
    const changes = migrateOlderNodeFile(parsed)
    const validation = validateEffectFileInFolder(mode, parsed)

    if (!validation.valid) {
      throw new Error(validation.errors.join(', '))
    }

    const file = validation.data

    if (!file) {
      this.removeRegistration(filePath)
      return {
        path: filePath,
        errors: ['Validation returned no data'],
        mode,
        updatedAt: Date.now(),
      } as EffectFileSummary
    }

    const displaced = this.claimGroupId(filePath, mode, file.group.id)
    if (displaced !== undefined) {
      this.groupHolders.delete(displaced)
      this.refuseGroupId(displaced, mode, file.group.id, filePath)
    }
    this.holdGroupId(filePath, { mode, groupId: file.group.id })
    if (renames.size > 0) this.variableRenames.set(filePath, renames)

    // Compile each effect at load (and so at save, which calls loadFile) so invalid action
    // payloads surface on the file summary for the editor rather than only at runtime when a
    // cue first references the effect.
    const compileErrors: string[] = []
    for (const effect of file.effects) {
      try {
        EffectCompiler.compile(effect)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        compileErrors.push(`Effect '${effect.name ?? effect.id}': ${message}`)
      }
    }

    const saved = await this.writeMigratedFile(filePath, parsed, changes)
    const warnings = validation.warnings ?? []
    for (const warning of warnings) {
      log.warn(`${filePath}: ${warning}`)
    }

    const summary: EffectFileSummary = {
      path: filePath,
      groupId: file.group.id,
      groupName: file.group.name,
      effectCount: file.effects.length,
      mode,
      updatedAt: Date.now(),
      bundled: file.bundled ?? false,
      errors: compileErrors.length > 0 ? compileErrors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      migrations: saved.migrations,
      unsaved: saved.unsaved,
    }

    this.updateSummary(summary)
    return summary
  }

  /**
   * The renames a load gave the variable names of the effect file holding a group id. A cue file an
   * older build wrote still passes that effect's parameters by their old names.
   */
  public variableRenamesFor(
    mode: EffectMode,
    groupId: string,
  ): ReadonlyMap<string, string> | undefined {
    for (const [filePath, held] of this.groupHolders) {
      if (held.mode === mode && held.groupId === groupId) return this.variableRenames.get(filePath)
    }
    return undefined
  }

  private holdGroupId(filePath: string, claim: GroupIdClaim<EffectMode>): void {
    const held = this.groupHolders.get(filePath)
    if (held && held.groupId !== claim.groupId) this.releaseGroupId(held.mode, held.groupId)
    this.groupHolders.set(filePath, claim)
  }

  protected heldGroupIds(): Iterable<[string, GroupIdClaim<EffectMode>]> {
    return this.groupHolders
  }

  protected removeRegistration(filePath: string): void {
    this.variableRenames.delete(filePath)
    const held = this.groupHolders.get(filePath)
    if (!held) return
    this.groupHolders.delete(filePath)
    this.releaseGroupId(held.mode, held.groupId)
  }

  protected makeErrorSummary(
    mode: EffectMode,
    filePath: string,
    message: string,
  ): EffectFileSummary {
    return {
      path: filePath,
      groupId: path.basename(filePath, '.json'),
      groupName: path.basename(filePath, '.json'),
      effectCount: 0,
      mode,
      updatedAt: Date.now(),
      errors: [message],
    }
  }

  protected onFileChangeError(filePath: string, error: unknown): void {
    log.error('Failed to reload effect file', filePath, error)
  }

  private resolveExistingEffectFilePath(userPath: string): { filePath: string; mode: EffectMode } {
    return this.resolveExistingFilePath(
      userPath,
      'Effect file path',
      'Effect file path must be under the YARG or audio effect directories.',
    )
  }
}

/**
 * The group ids of the effect files that differ between two summaries: added, removed, loaded
 * again, or moved to another group id (both ids count).
 */
export function changedEffectFileIds(
  previous: EffectListSummary,
  next: EffectListSummary,
): Set<string> {
  const changed = new Set<string>()
  for (const mode of Object.keys(next) as EffectMode[]) {
    const before = new Map(previous[mode].map((summary) => [summary.path, summary]))
    const after = new Map(next[mode].map((summary) => [summary.path, summary]))
    for (const filePath of new Set([...before.keys(), ...after.keys()])) {
      const was = before.get(filePath)
      const now = after.get(filePath)
      if (was === now) {
        continue
      }
      if (was) changed.add(was.groupId)
      if (now) changed.add(now.groupId)
    }
  }
  return changed
}
