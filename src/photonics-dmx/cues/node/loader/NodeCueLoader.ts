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
} from '../../types/nodeCueTypes'
import { CueRegistry } from '../../registries/CueRegistry'
import { AudioCueRegistry, type AudioCueGroup } from '../../registries/AudioCueRegistry'
import { AudioCueType } from '../../types/audioCueTypes'
import { EffectRegistry } from '../runtime/EffectRegistry'
import { EffectCompiler } from '../compiler/EffectCompiler'
import type { EffectLoader } from './EffectLoader'
import { migrateLegacyBearings } from './migrateLegacyBearings'
import { buildAudioGroup, buildNetGroup, type CueGroupBuildContext } from './cueGroupBuilders'
import type { EffectFile, EffectMode, EffectReference } from '../../types/nodeCueTypes'
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
  /** Non-fatal findings from validation: the file loaded, but something in it will not do what it looks like it does. */
  warnings?: string[]
  bundled?: boolean
}

export type NodeCueListSummary = BaseListSummary<NodeCueMode, NodeCueFileSummary>

export type NodeCueLoadResult = BaseLoadResult

/** Optional host callbacks for node cue debug/error emission; used when the host provides them. */
export type NodeRuntimeCallbacks = import('../runtime/executionTypes').NodeRuntimeCallbacks
type NodeCueDebugSwitch = import('../runtime/executionTypes').NodeCueDebugSwitch

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
  /** The effect files the file's cues reference, so a change to one loads the file again. */
  effectFileIds: string[]
}

/**
 * Effect files by group id per effect mode, read once and shared by every cue file built from it.
 */
type EffectFilesByMode = Map<EffectMode, Promise<Map<string, EffectFile>>>

const effectFileIdsOf = (file: NodeCueFile): string[] => [
  ...new Set(
    file.cues.flatMap((cue: { effects?: EffectReference[] }) =>
      (cue.effects ?? []).map((ref) => ref.effectFileId),
    ),
  ),
]

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

  /** The debug switch every cue this loader builds hands to its engines. */
  private readonly nodeCueDebug: NodeCueDebugSwitch = { enabled: false }

  /** The effect files read for the load pass in progress, or null outside one. */
  private effectFilesPass: EffectFilesByMode | null = null

  constructor(private readonly options: NodeCueLoaderOptions) {
    super(options.baseDir, 'cues', ['yarg', 'audio', 'rb3'])
  }

  protected override onBeforeLoadAll(): void {
    this.customAudioCueTypes.clear()
  }

  public override async loadAll(): Promise<NodeCueLoadResult> {
    return this.withEffectFilesPass(() => super.loadAll())
  }

  /**
   * Load again every registered cue file that references one of the given effect files, and report
   * the new summary. Cue files that use none of them keep the groups they have.
   */
  public async reloadFilesUsingEffects(effectFileIds: ReadonlySet<string>): Promise<void> {
    const affected = [...this.fileRegistrations].filter(([, registration]) =>
      registration.effectFileIds.some((id) => effectFileIds.has(id)),
    )
    if (affected.length === 0) {
      return
    }
    await this.withEffectFilesPass(async () => {
      for (const [filePath, registration] of affected) {
        await this.loadFileRecordingErrors(registration.mode, filePath)
      }
    })
    this.emit('changed', this.getSummary())
  }

  /** Run a load pass that reads each effect file once, however many cue files reference it. */
  private async withEffectFilesPass<T>(load: () => Promise<T>): Promise<T> {
    const pass: EffectFilesByMode = new Map()
    this.effectFilesPass = pass
    try {
      return await load()
    } finally {
      if (this.effectFilesPass === pass) {
        this.effectFilesPass = null
      }
    }
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
   * Resolves a renderer-supplied path to an absolute path inside one of the cue roots, or throws.
   * Use this when an IPC handler needs the rooted path (e.g. for fs.copyFile during export) and must
   * not trust the raw IPC string.
   */
  public resolveCueFilePathForIpc(filePath: string): string {
    return this.resolveExistingCueFilePath(filePath)
  }

  /**
   * Write a file into a mode's folder and load it. A create-only save refuses a filename that is
   * already taken, and any other save replaces the file at that path.
   */
  public async saveFile(
    mode: NodeCueMode,
    filename: string,
    content: NodeCueFile,
    options: { createOnly?: boolean } = {},
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

    await this.writeSavedFile(
      filePath,
      JSON.stringify(content, null, 2),
      options.createOnly ?? false,
    )
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

    for (const warning of validation.warnings) {
      log.warn(`${filePath}: ${warning}`)
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
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
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
    const effectFileIds = effectFileIdsOf(file)
    const strategy = strategyForFile(file)
    if (strategy) {
      this.unregisterFile(filePath)
      await strategy.registerFile(file, mode, compileErrors)
      this.fileRegistrations.set(filePath, {
        mode,
        groupId: file.group.id,
        kind: strategy.kind,
        effectFileIds,
      })
      return
    }

    const context = this.buildContext(this.effectFilesPass ?? new Map())

    // The group is built while the previous one keeps serving, and swapped in without an await
    // between taking the old group out and putting the new one in, so no cue resolves against a
    // registry that is missing it.
    if (mode === 'audio') {
      // Narrowed once for the whole branch: `mode` decides the file shape, but it is a separate
      // parameter, so nothing else here narrows `file` off the union. The cue loop needs it too,
      // because `cueTypeId` is the audio cue's identifier and the net cues have no such field.
      const audioFile = file as AudioNodeCueFile
      const group = await this.buildOrUnregister(filePath, () =>
        buildAudioGroup(audioFile, compileErrors, context),
      )
      this.registerAudioGroup(filePath, audioFile, group)
    } else {
      // Both net modes compile through the same path and differ only in which registry instance
      // they load into, which the per-mode map supplies.
      const group = await this.buildOrUnregister(filePath, () =>
        buildNetGroup(file as NetNodeCueFile, compileErrors, context),
      )
      const registry = this.options.registries[mode]
      if (this.holdsGroup(filePath, mode, group.id)) {
        registry.replaceGroup(group)
      } else {
        this.unregisterFile(filePath)
        registry.registerGroup(group)
      }
      registry.applyGroupDesignations(file.group, group)
    }

    this.fileRegistrations.set(filePath, { mode, groupId: file.group.id, effectFileIds })
  }

  /** Build a file's group, taking the file's current group out when the build fails. */
  private async buildOrUnregister<G>(filePath: string, build: () => Promise<G>): Promise<G> {
    try {
      return await build()
    } catch (error) {
      this.unregisterFile(filePath)
      throw error
    }
  }

  /** Whether the file's current registration is a built-in group with this id and mode. */
  private holdsGroup(filePath: string, mode: NodeCueMode, groupId: string): boolean {
    const registration = this.fileRegistrations.get(filePath)
    return (
      registration !== undefined &&
      registration.kind === undefined &&
      registration.mode === mode &&
      registration.groupId === groupId
    )
  }

  private registerAudioGroup(
    filePath: string,
    audioFile: AudioNodeCueFile,
    group: AudioCueGroup,
  ): void {
    const registry = this.options.registries.audio
    if (this.holdsGroup(filePath, 'audio', group.id)) {
      registry.replaceGroup(group)
    } else {
      // Registering a group enables it, so a file whose group id changed would put back a group
      // the user had turned off. A file not loaded before starts enabled.
      const existing = this.fileRegistrations.get(filePath)
      const wasEnabled = existing ? registry.getEnabledGroups().includes(existing.groupId) : true
      this.unregisterFile(filePath)
      registry.registerGroup(group)
      if (!wasEnabled) {
        registry.disableGroup(group.id)
      }
    }
    registry.applyGroupDesignations(audioFile.group, group)

    audioFile.cues.forEach((cue) => {
      if (cue.kind === 'lighting') {
        this.customAudioCueTypes.add(cue.cueTypeId)
        this.warnIfCueIdShared(cue.cueTypeId)
      }
    })
  }

  /**
   * Audio selection plays the first enabled group that carries a cue id, so a second group with the
   * same id never plays that cue. Said once per load, naming the group that wins.
   */
  private warnIfCueIdShared(cueTypeId: string): void {
    const providers = this.options.registries.audio.getEnabledGroupsProviding(cueTypeId)
    if (providers.length > 1) {
      log.warn(
        `Audio cue id '${cueTypeId}' is in several enabled groups (${providers.join(', ')}). Only ${providers[0]} plays it. Give each cue its own id.`,
      )
    }
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
          `The ${mode} cue file ${path.basename(registeredPath)} already uses group id '${groupId}'. Choose a different group ID.`,
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
      'Node cue file path must be under one of the cue directories.',
    )
  }

  /** Turn debug logging on or off for every cue this loader built, running or not. */
  public setDebugEnabled(enabled: boolean): void {
    this.nodeCueDebug.enabled = enabled
  }

  public isDebugEnabled(): boolean {
    return this.nodeCueDebug.enabled
  }

  /** What the group builders need from this loader, reading effect files through `effectFiles`. */
  private buildContext(effectFiles: EffectFilesByMode): CueGroupBuildContext {
    return {
      runtimeBroadcaster: this.options.runtimeBroadcaster,
      nodeCueDebug: this.nodeCueDebug,
      getNodeRuntimeCallbacks: this.options.getNodeRuntimeCallbacks,
      buildEffectRegistry: (effects, mode) => this.buildEffectRegistry(effects, mode, effectFiles),
    }
  }

  private async buildEffectRegistry(
    effectReferences: EffectReference[],
    mode: NodeCueMode,
    effectFiles: EffectFilesByMode,
  ): Promise<EffectRegistry> {
    const registry = new EffectRegistry()

    if (!this.options.effectLoader || effectReferences.length === 0) {
      return registry
    }

    // Which effect tree this mode raises from is the domain's to say, not the loader's: RB3 folds
    // onto the yarg tree, and a mode added later brings its own answer with its descriptor.
    const effectLoaderMode: EffectMode = getCueDomain(mode).effectMode
    let filesForMode = effectFiles.get(effectLoaderMode)
    if (!filesForMode) {
      filesForMode = this.options.effectLoader.readEffectFilesByGroupId(effectLoaderMode)
      effectFiles.set(effectLoaderMode, filesForMode)
    }
    const effectFilesById = await filesForMode

    for (const effectRef of effectReferences) {
      try {
        const effectFile = effectFilesById.get(effectRef.effectFileId)

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
