import * as fs from 'fs/promises'
import * as path from 'path'
import { validateNodeCueFile, validateCueFileForMode } from '../schema/validation'
import { getCueDomain } from '../../domains'
import {
  AudioNodeCueFile,
  NodeCueFile,
  NodeCueMode,
  NetNodeCueFile,
  NodeCueKind,
  NetEventNode,
  AudioEventNodeUnion,
} from '../../types/nodeCueTypes'
import { NodeCueCompilationError, NodeCueCompiler } from '../compiler/NodeCueCompiler'
import { CueRegistry } from '../../registries/CueRegistry'
import { AudioCueRegistry, AudioCueGroup } from '../../registries/AudioCueRegistry'
import type { ICueGroup } from '../../interfaces/INetCueGroup'
import { INetCue } from '../../interfaces/INetCue'
import { LightingNodeCue } from '../runtime/LightingNodeCue'
import { MotionNodeCue } from '../runtime/MotionNodeCue'
import { AudioNodeCue } from '../runtime/AudioNodeCue'
import { AudioMotionNodeCue } from '../runtime/AudioMotionNodeCue'
import { CueType } from '../../types/cueTypes'
import { AudioCueType } from '../../types/audioCueTypes'
import { IAudioCue } from '../../interfaces/IAudioCue'
import { EffectRegistry } from '../runtime/EffectRegistry'
import { EffectCompiler } from '../compiler/EffectCompiler'
import type { EffectLoader } from './EffectLoader'
import { migrateLegacyBearings } from './migrateLegacyBearings'
import type { EffectMode, EffectReference } from '../../types/nodeCueTypes'
import { createLogger } from '../../../../shared/logger'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { BaseNodeFileLoader, BaseListSummary, BaseLoadResult } from './BaseNodeFileLoader'
const log = createLogger('NodeCueLoader')

export interface NodeCueFileSummary {
  path: string
  groupId: string
  groupName: string
  cueCount: number
  lightingCueCount: number
  motionCueCount: number
  /** Cue counts contributed by registered kind strategies, keyed by kind. */
  kindCueCounts?: Record<string, number>
  mode: NodeCueMode
  updatedAt: number
  errors?: string[]
  bundled?: boolean
}

export type NodeCueListSummary = BaseListSummary<NodeCueMode, NodeCueFileSummary>

export type NodeCueLoadResult = BaseLoadResult

/** Optional host callbacks for node cue debug/error emission; used when the host provides them. */
export type NodeRuntimeCallbacks = import('../runtime/executionTypes').NodeRuntimeCallbacks

/**
 * The registry each mode loads into, keyed by mode. Audio is a different class from the net modes,
 * so this is a per-mode type map rather than one registry type.
 */
export interface CueRegistriesByMode {
  yarg: CueRegistry
  rb3: CueRegistry
  audio: AudioCueRegistry
}

interface NodeCueLoaderOptions {
  baseDir: string
  registries: CueRegistriesByMode
  effectLoader?: EffectLoader
  /** Injected host emit for cue/effect runtime IPC; required for production main. */
  runtimeBroadcaster: RuntimeBroadcaster
  /** When provided, passed to LightingNodeCue for debug/error emission. */
  getNodeRuntimeCallbacks?: () => NodeRuntimeCallbacks | undefined
}

interface FileRegistration {
  mode: NodeCueMode
  groupId: string
  /** Which strategy owns this registration, so the same one tears it down. */
  kind?: string
}

/**
 * Handles cue files of a kind the loader does not build itself.
 *
 * A build that ships its own cue kind registers one of these instead of adding a branch to the
 * loader's register, unregister, cue-type and summary paths. The lighting and motion kinds are built
 * in, so a strategy is consulted only for files it claims.
 */
export interface NodeCueKindStrategy {
  kind: string
  /** Whether this strategy owns the file, decided from the cues it declares. */
  claimsFile(file: NodeCueFile): boolean
  /** Build and register the file's group, collecting per-cue compile failures. */
  registerFile(file: NodeCueFile, mode: NodeCueMode, compileErrors: string[]): Promise<void>
  unregisterFile(mode: NodeCueMode, groupId: string): void
  /** Cue types this kind offers for a mode, when the editor asks for this kind. */
  cueTypesFor?(mode: NodeCueMode): readonly string[]
  /** Cues of this kind in the file, surfaced on its summary. */
  countCues?(file: NodeCueFile): number
}

const kindStrategies: NodeCueKindStrategy[] = []

/** Register a cue-kind handler. Call from an import-time module, before any file is loaded. */
export function registerNodeCueKindStrategy(strategy: NodeCueKindStrategy): void {
  kindStrategies.push(strategy)
}

/** Drops every registered strategy. Tests only, so each case starts from the built-in kinds. */
export function __resetNodeCueKindStrategiesForTests(): void {
  kindStrategies.length = 0
}

const strategyForFile = (file: NodeCueFile): NodeCueKindStrategy | undefined =>
  kindStrategies.find((s) => s.claimsFile(file))

export class NodeCueLoader extends BaseNodeFileLoader<NodeCueMode, NodeCueFileSummary> {
  private fileRegistrations: Map<string, FileRegistration> = new Map()
  private customAudioCueTypes: Set<AudioCueType> = new Set()

  constructor(private readonly options: NodeCueLoaderOptions) {
    super(options.baseDir, 'cues', ['yarg', 'audio', 'rb3'])
  }

  protected onBeforeLoadAll(): void {
    this.customAudioCueTypes.clear()
  }

  public async readFile(filePath: string): Promise<NodeCueFile> {
    const resolvedPath = this.resolveExistingCueFilePath(filePath)
    const mode = this.getModeFromPath(resolvedPath)
    if (!mode) {
      throw new Error('Unsupported node cue path.')
    }

    const data = await fs.readFile(resolvedPath, 'utf-8')
    const parsed = JSON.parse(data)
    migrateLegacyBearings(parsed)
    const validation = validateCueFileForMode(mode, parsed)

    if (!validation.valid) {
      throw new Error(`Invalid node cue file: ${validation.errors.join(', ')}`)
    }

    return validation.data
  }

  /**
   * Resolves a renderer-supplied path to an absolute path inside the YARG/audio cue roots,
   * or throws. Use this when an IPC handler needs the rooted path (e.g. for fs.copyFile during
   * export) and must not trust the raw IPC string.
   */
  public resolveCueFilePathForIpc(filePath: string): string {
    return this.resolveExistingCueFilePath(filePath)
  }

  public async saveFile(
    mode: NodeCueMode,
    filename: string,
    content: NodeCueFile,
  ): Promise<{ success: boolean; path: string }> {
    if (content.mode !== mode) {
      throw new Error('File mode does not match payload mode.')
    }

    const validation = validateNodeCueFile(content)
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '))
    }

    const targetDir = this.dirs[mode]
    const sanitizedName = this.sanitizeFilename(filename)
    const filePath = this.resolveInDir(targetDir, sanitizedName)

    this.assertNoConflictingGroupIdForPath(filePath, mode, content.group.id)

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8')
    await this.loadFile(mode, filePath)

    this.emit('changed', this.getSummary())
    return { success: true, path: filePath }
  }

  public async deleteFile(filePath: string): Promise<{ success: boolean }> {
    const resolvedPath = this.resolveExistingCueFilePath(filePath)
    const mode = this.getModeFromPath(resolvedPath)
    if (!mode) {
      throw new Error('Unsupported node cue path.')
    }

    await fs.rm(resolvedPath, { force: true })
    this.unregisterFile(resolvedPath)
    this.emit('changed', this.getSummary())
    return { success: true }
  }

  public getAvailableCueTypes(
    mode: NodeCueMode,
    kind: NodeCueKind | string = 'lighting',
  ): string[] {
    const strategy = kindStrategies.find((s) => s.kind === kind)
    if (strategy) {
      return [...(strategy.cueTypesFor?.(mode) ?? [])]
    }
    // Audio learns cue types at runtime from its registry and from files loaded this session, so it
    // is the only mode with types to contribute beyond its own enum.
    const registryTypes = new Set(this.options.registries.audio.getAvailableCueTypes(true))
    this.customAudioCueTypes.forEach((type) => registryTypes.add(type))
    return [
      ...getCueDomain(mode).cueTypesFor(kind as NodeCueKind, {
        extraTypes: Array.from(registryTypes),
      }),
    ]
  }

  protected async loadFile(
    mode: NodeCueMode,
    filePath: string,
  ): Promise<NodeCueFileSummary | null> {
    const contents = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(contents)
    migrateLegacyBearings(parsed)
    const validation = validateCueFileForMode(mode, parsed)

    if (!validation.valid) {
      throw new Error(validation.errors.join(', '))
    }

    const file = validation.data
    // Per-cue compile failures are collected here rather than only logged, so the editor
    // can surface them on the file's summary instead of the file appearing to load cleanly.
    const compileErrors: string[] = []
    await this.registerFile(filePath, mode, file, compileErrors)

    const lightingCueCount = file.cues.filter((c) => c.kind === 'lighting').length
    const motionCueCount = file.cues.filter((c) => c.kind === 'motion').length
    const kindCueCounts: Record<string, number> = {}
    for (const strategy of kindStrategies) {
      const count = strategy.countCues?.(file)
      if (count !== undefined) kindCueCounts[strategy.kind] = count
    }

    const summary: NodeCueFileSummary = {
      path: filePath,
      groupId: file.group.id,
      groupName: file.group.name,
      cueCount: file.cues.length,
      lightingCueCount,
      motionCueCount,
      kindCueCounts,
      mode,
      updatedAt: Date.now(),
      bundled: file.bundled ?? false,
      errors: compileErrors.length > 0 ? compileErrors : undefined,
    }

    this.updateSummary(summary)
    return summary
  }

  private async registerFile(
    filePath: string,
    mode: NodeCueMode,
    file: NodeCueFile,
    compileErrors: string[],
  ): Promise<void> {
    let wasAudioGroupEnabled = false
    if (mode === 'audio') {
      const existing = this.fileRegistrations.get(filePath)
      if (existing) {
        wasAudioGroupEnabled = this.options.registries.audio
          .getEnabledGroups()
          .includes(existing.groupId)
      }
    }

    this.unregisterFile(filePath)

    const strategy = strategyForFile(file)
    if (strategy) {
      await strategy.registerFile(file, mode, compileErrors)
      this.fileRegistrations.set(filePath, { mode, groupId: file.group.id, kind: strategy.kind })
      return
    }

    if (mode !== 'audio') {
      // Both net modes compile through the same path and differ only in which registry instance
      // they load into, which the per-mode map supplies.
      const registry = this.options.registries[mode]
      const group = await this.buildNetGroup(file as NetNodeCueFile, compileErrors)
      registry.registerGroup(group)
      const groupMeta = file.group
      if (groupMeta.isDefault) {
        registry.setDefaultGroup(group.id)
      }
      if (groupMeta.isStageKit) {
        registry.setStageKitGroup(group.id)
      }
    } else {
      const group = await this.buildAudioGroup(file as AudioNodeCueFile, compileErrors)
      this.options.registries.audio.registerGroup(group)
      if (wasAudioGroupEnabled) {
        this.options.registries.audio.enableGroup(group.id)
      }
      file.cues.forEach((cue) => {
        if (cue.kind === 'lighting') {
          this.customAudioCueTypes.add(cue.cueTypeId)
        }
      })
    }

    this.fileRegistrations.set(filePath, { mode, groupId: file.group.id })
  }

  private unregisterFile(filePath: string): void {
    const registration = this.fileRegistrations.get(filePath)
    if (!registration) {
      return
    }

    const owner = registration.kind
      ? kindStrategies.find((s) => s.kind === registration.kind)
      : undefined
    if (owner) {
      owner.unregisterFile(registration.mode, registration.groupId)
    } else {
      this.options.registries[registration.mode].unregisterGroup(registration.groupId)
    }
    this.summaries[registration.mode] = this.summaries[registration.mode].filter(
      (summary) => summary.path !== filePath,
    )

    this.fileRegistrations.delete(filePath)
  }

  private async buildNetGroup(file: NetNodeCueFile, compileErrors: string[]): Promise<ICueGroup> {
    const cueMap = new Map<CueType, INetCue>()
    const motionMap = new Map<string, INetCue>()

    for (const cue of file.cues) {
      if (cue.kind === 'lighting') {
        if (cueMap.has(cue.cueType)) {
          throw new NodeCueCompilationError(
            `Duplicate cueType '${cue.cueType}' in group '${file.group.name}'.`,
          )
        }
        try {
          const compiled = NodeCueCompiler.compileCue<NetEventNode>(cue, file.mode)
          compiled.groupVariables = file.group.variables ?? []
          const effectRegistry = await this.buildEffectRegistry(cue.effects ?? [], file.mode)
          const callbacks = this.options.getNodeRuntimeCallbacks?.()
          cueMap.set(
            cue.cueType,
            new LightingNodeCue(
              file.group.id,
              compiled,
              effectRegistry,
              callbacks,
              this.options.runtimeBroadcaster,
            ),
          )
        } catch (err) {
          log.warn(`Skipping cue '${cue.cueType}':`, err)
          compileErrors.push(
            `cue '${cue.cueType}': ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      } else {
        if (motionMap.has(cue.id)) {
          throw new NodeCueCompilationError(
            `Duplicate motion cue id '${cue.id}' in group '${file.group.name}'.`,
          )
        }
        try {
          const compiled = NodeCueCompiler.compileCue<NetEventNode>(cue, file.mode)
          compiled.groupVariables = file.group.variables ?? []
          const effectRegistry = await this.buildEffectRegistry(cue.effects ?? [], file.mode)
          const callbacks = this.options.getNodeRuntimeCallbacks?.()
          motionMap.set(
            cue.id,
            new MotionNodeCue(
              file.group.id,
              compiled,
              effectRegistry,
              callbacks,
              this.options.runtimeBroadcaster,
            ),
          )
        } catch (err) {
          log.warn(`Skipping motion cue '${cue.id}':`, err)
          compileErrors.push(
            `motion cue '${cue.id}': ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
    }

    if (cueMap.size === 0 && motionMap.size === 0) {
      throw new NodeCueCompilationError(
        'Group must contain at least one lighting or motion cue definition.',
      )
    }

    const result: ICueGroup = {
      id: file.group.id,
      name: file.group.name,
      description: file.group.description,
      cues: cueMap,
    }
    if (motionMap.size > 0) {
      result.motionCues = motionMap
    }
    return result
  }

  private async buildAudioGroup(
    file: AudioNodeCueFile,
    compileErrors: string[],
  ): Promise<AudioCueGroup> {
    const cueMap = new Map<AudioCueType, IAudioCue>()
    const motionMap = new Map<string, IAudioCue>()

    for (const cue of file.cues) {
      if (cue.kind === 'lighting') {
        if (cueMap.has(cue.cueTypeId)) {
          throw new NodeCueCompilationError(
            `Duplicate audio cue id '${cue.cueTypeId}' in group '${file.group.name}'.`,
          )
        }
        try {
          const compiled = NodeCueCompiler.compileCue<AudioEventNodeUnion>(cue, 'audio')
          compiled.groupVariables = file.group.variables ?? []
          const effectRegistry = await this.buildEffectRegistry(cue.effects ?? [], 'audio')
          cueMap.set(
            cue.cueTypeId,
            new AudioNodeCue(
              file.group.id,
              compiled,
              effectRegistry,
              this.options.runtimeBroadcaster,
            ),
          )
        } catch (err) {
          log.warn(`Skipping audio cue '${cue.cueTypeId}':`, err)
          compileErrors.push(
            `audio cue '${cue.cueTypeId}': ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      } else {
        if (motionMap.has(cue.id)) {
          throw new NodeCueCompilationError(
            `Duplicate audio motion cue id '${cue.id}' in group '${file.group.name}'.`,
          )
        }
        try {
          const compiled = NodeCueCompiler.compileCue<AudioEventNodeUnion>(cue, 'audio')
          compiled.groupVariables = file.group.variables ?? []
          const effectRegistry = await this.buildEffectRegistry(cue.effects ?? [], 'audio')
          motionMap.set(
            cue.id,
            new AudioMotionNodeCue(
              file.group.id,
              compiled,
              effectRegistry,
              this.options.runtimeBroadcaster,
            ),
          )
        } catch (err) {
          log.warn(`Skipping audio motion cue '${cue.id}':`, err)
          compileErrors.push(
            `audio motion cue '${cue.id}': ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
    }

    if (cueMap.size === 0 && motionMap.size === 0) {
      throw new NodeCueCompilationError(
        'Group must contain at least one lighting or motion audio cue definition.',
      )
    }

    const result: AudioCueGroup = {
      id: file.group.id,
      name: file.group.name,
      description: file.group.description ?? 'Node-based audio cues',
      cues: cueMap,
    }
    if (motionMap.size > 0) {
      result.motionCues = motionMap
    }
    return result
  }

  /**
   * Prevents two cue files in the same domain (yarg vs audio) from sharing one `group.id`,
   * which would overwrite the other in the registry (see registerFile / unregisterGroup).
   */
  private assertNoConflictingGroupIdForPath(
    targetPath: string,
    mode: NodeCueMode,
    groupId: string,
  ): void {
    const normalizedTarget = path.resolve(targetPath)
    const key = groupId.trim().toLowerCase()
    if (!key) {
      return
    }
    for (const [registeredPath, reg] of this.fileRegistrations) {
      if (reg.mode !== mode) {
        continue
      }
      if (path.resolve(registeredPath) === normalizedTarget) {
        continue
      }
      if (reg.groupId.trim().toLowerCase() === key) {
        throw new Error(
          `Another ${mode} cue file already uses group id '${groupId}'. Choose a different group ID.`,
        )
      }
    }
  }

  protected removeRegistration(filePath: string): void {
    this.unregisterFile(filePath)
  }

  protected makeErrorSummary(
    mode: NodeCueMode,
    filePath: string,
    message: string,
  ): NodeCueFileSummary {
    return {
      path: filePath,
      groupId: path.basename(filePath, '.json'),
      groupName: path.basename(filePath, '.json'),
      cueCount: 0,
      lightingCueCount: 0,
      motionCueCount: 0,
      mode,
      updatedAt: Date.now(),
      errors: [message],
    }
  }

  protected onFileChangeError(filePath: string, error: unknown): void {
    log.error('Failed to reload node cue file', filePath, error)
  }

  private resolveExistingCueFilePath(userPath: string): string {
    return this.resolveExistingFilePath(
      userPath,
      'Node cue path',
      'Node cue file path must be under the YARG or audio cue directories.',
    )
  }

  private async buildEffectRegistry(
    effectReferences: EffectReference[],
    mode: NodeCueMode,
  ): Promise<EffectRegistry> {
    const registry = new EffectRegistry()

    if (!this.options.effectLoader || effectReferences.length === 0) {
      return registry
    }

    // Which effect tree this mode raises from is the domain's to say, not the loader's: RB3 folds
    // onto the yarg tree, and a mode added later brings its own answer with its descriptor.
    const effectLoaderMode: EffectMode = getCueDomain(mode).effectMode

    for (const effectRef of effectReferences) {
      try {
        const effectFile = await this.options.effectLoader.loadEffectByReference(
          effectRef,
          effectLoaderMode,
        )

        if (!effectFile) {
          log.warn(
            `Effect file ${effectRef.effectFileId} not found, skipping effect ${effectRef.effectId}`,
          )
          continue
        }

        const effect = effectFile.effects.find((e) => e.id === effectRef.effectId)

        if (!effect) {
          log.warn(
            `Effect ${effectRef.effectId} not found in file ${effectRef.effectFileId}, skipping`,
          )
          continue
        }

        const compiledEffect = EffectCompiler.compile(effect)
        registry.registerEffect(effectRef.effectId, compiledEffect)
      } catch (error) {
        log.error(`Failed to load/compile effect ${effectRef.effectId}:`, error)
      }
    }

    return registry
  }
}
