import * as fs from 'fs/promises'
import * as path from 'path'
import { validateEffectFile } from '../schema/validation'
import { EffectFile, EffectMode, EffectReference } from '../../types/nodeCueTypes'
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
  bundled?: boolean
}

export type EffectListSummary = BaseListSummary<EffectFileSummary>

export type EffectLoadResult = BaseLoadResult

interface EffectLoaderOptions {
  baseDir: string
}

export class EffectLoader extends BaseNodeFileLoader<EffectMode, EffectFileSummary> {
  constructor(options: EffectLoaderOptions) {
    super(options.baseDir, 'effects')
  }

  public async readFile(filePath: string): Promise<EffectFile> {
    const resolvedPath = this.resolveExistingEffectFilePath(filePath)
    const mode = this.getModeFromPath(resolvedPath)
    if (!mode) {
      throw new Error('Unsupported effect file path.')
    }

    const data = await fs.readFile(resolvedPath, 'utf-8')
    const parsed = JSON.parse(data)
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

    const targetDir = mode === 'yarg' ? this.yargDir : this.audioDir
    const sanitizedName = this.sanitizeFilename(filename)
    const filePath = this.resolveInDir(targetDir, sanitizedName)

    this.assertNoConflictingEffectGroupIdForPath(filePath, mode, content.group.id)

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8')
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
   * Load an effect file by reference (used at runtime to load referenced effects)
   */
  public async loadEffectByReference(
    ref: EffectReference,
    mode: EffectMode,
  ): Promise<EffectFile | null> {
    const dir = mode === 'yarg' ? this.yargDir : this.audioDir
    const files = await fs.readdir(dir).catch(() => [])

    for (const file of files) {
      if (!isJsonFile(file)) {
        continue
      }

      const filePath = path.join(dir, file)
      try {
        const effectFile = await this.readFile(filePath)
        if (effectFile.group.id === ref.effectFileId) {
          return effectFile
        }
      } catch {
        // Skip invalid files
        continue
      }
    }

    return null
  }

  protected async loadFile(mode: EffectMode, filePath: string): Promise<EffectFileSummary | null> {
    const contents = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(contents)
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

    const summary: EffectFileSummary = {
      path: filePath,
      groupId: file.group.id,
      groupName: file.group.name,
      effectCount: file.effects.length,
      mode,
      updatedAt: Date.now(),
      bundled: file.bundled ?? false,
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
    const summaries = mode === 'yarg' ? this.summaries.yarg : this.summaries.audio
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
