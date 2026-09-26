import * as fs from 'fs/promises'
import * as path from 'path'
import { validateEffectFile } from '../schema/validation'
import { EffectCompiler } from '../compiler/EffectCompiler'
import { migrateOlderNodeFile } from './migrateOlderNodeFile'
import { EffectFile, EffectMode } from '../../types/nodeCueTypes'
import { createLogger } from '../../../../shared/logger'
import {
  BaseNodeFileLoader,
  BaseListSummary,
  BaseLoadResult,
  isJsonFile,
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
  /** What the load changed in a file an older build wrote, which it then saved. */
  migrations?: string[]
  bundled?: boolean
}

export type EffectListSummary = BaseListSummary<EffectMode, EffectFileSummary>

export type EffectLoadResult = BaseLoadResult

interface EffectLoaderOptions {
  baseDir: string
}

export class EffectLoader extends BaseNodeFileLoader<EffectMode, EffectFileSummary> {
  constructor(options: EffectLoaderOptions) {
    super(options.baseDir, 'effects', ['yarg', 'audio'])
  }

  public async readFile(filePath: string): Promise<EffectFile> {
    const resolvedPath = this.resolveExistingEffectFilePath(filePath)
    const mode = this.getModeFromPath(resolvedPath)
    if (!mode) {
      throw new Error('Unsupported effect file path.')
    }

    const data = await fs.readFile(resolvedPath, 'utf-8')
    const parsed: unknown = JSON.parse(data)
    migrateOlderNodeFile(parsed)
    const validation = validateEffectFile(parsed)

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
    return this.resolveExistingEffectFilePath(filePath)
  }

  public async saveFile(
    mode: EffectMode,
    filename: string,
    content: EffectFile,
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

    this.assertNoConflictingEffectGroupIdForPath(filePath, mode, content.group.id)

    await this.writeSavedFile(filePath, JSON.stringify(content, null, 2))
    await this.loadFile(mode, filePath)

    this.emit('changed', this.getSummary())
    return { success: true, path: filePath }
  }

  public async deleteFile(filePath: string): Promise<{ success: boolean }> {
    const resolvedPath = this.resolveExistingEffectFilePath(filePath)
    const mode = this.getModeFromPath(resolvedPath)
    if (!mode) {
      throw new Error('Unsupported effect file path.')
    }

    await fs.rm(resolvedPath, { force: true })
    this.removeSummary(resolvedPath)
    this.emit('changed', this.getSummary())
    return { success: true }
  }

  /**
   * Every valid effect file of a mode by group id, read from disk in one pass. Invalid files are
   * skipped, and the first file in name order keeps a group id two files share.
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
        const effectFile = await this.readFile(path.join(dir, file))
        if (!byGroupId.has(effectFile.group.id)) {
          byGroupId.set(effectFile.group.id, effectFile)
        }
      } catch {
        // Skip invalid files
      }
    }

    return byGroupId
  }

  protected async loadFile(mode: EffectMode, filePath: string): Promise<EffectFileSummary | null> {
    const contents = await fs.readFile(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(contents)
    const migrations = migrateOlderNodeFile(parsed)
    const validation = validateEffectFile(parsed)

    if (!validation.valid) {
      throw new Error(validation.errors.join(', '))
    }

    const file = validation.data

    if (!file) {
      return {
        path: filePath,
        errors: ['Validation returned no data'],
        mode,
        updatedAt: Date.now(),
      } as EffectFileSummary
    }

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

    if (migrations.length > 0) {
      await this.writeMigratedFile(filePath, parsed)
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
      migrations: migrations.length > 0 ? migrations : undefined,
    }

    this.updateSummary(summary)
    return summary
  }

  /** Two effect JSON files in the same mode must not share the same `group.id`. */
  private assertNoConflictingEffectGroupIdForPath(
    targetPath: string,
    mode: EffectMode,
    groupId: string,
  ): void {
    const normalizedTarget = path.resolve(targetPath)
    const key = groupId.trim().toLowerCase()
    if (!key) {
      return
    }
    const summaries = this.summaries[mode]
    for (const s of summaries) {
      if (path.resolve(s.path) === normalizedTarget) {
        continue
      }
      if (s.groupId.trim().toLowerCase() === key) {
        throw new Error(
          `Another ${mode} effect file already uses group id '${groupId}'. Choose a different group ID.`,
        )
      }
    }
  }

  protected removeRegistration(filePath: string): void {
    this.removeSummary(filePath)
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

  private resolveExistingEffectFilePath(userPath: string): string {
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
