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
import type { EffectLoader } from './EffectLoader'
import { migrateLegacyBearings } from './migrateLegacyBearings'
import {
  migrateOlderNodeFile,
  type EffectFileRenames,
  type EffectLookup,
  type NodeFileChanges,
} from './migrateOlderNodeFile'
import { buildAudioGroup, buildNetGroup, type CueGroupBuildContext } from './cueGroupBuilders'
import type { EffectReference } from '../../types/nodeCueTypes'
import {
  buildEffectRegistry,
  readEffectFiles,
  type EffectFilesByMode,
} from './effectRegistryBuilder'
import { createLogger } from '../../../../shared/logger'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import {
  BaseNodeFileLoader,
  BaseListSummary,
  BaseLoadResult,
  type GroupIdClaim,
} from './BaseNodeFileLoader'
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
  /** What the load changed in a file an older build wrote, which it then saved. */
  migrations?: string[]
  /** What the load read differently in a file it left as it is on disk, and why it left it. */
  unsaved?: string[]
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
    super(options.baseDir, 'cues', ['yarg', 'audio', 'rb3'], 'cue')
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
    await this.publishChanges()
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
    const { filePath: resolvedPath, mode } = this.resolveExistingCueFilePath(filePath)
    const data = await fs.readFile(resolvedPath, 'utf-8')
    const parsed: unknown = JSON.parse(data)
    await this.migrateOlderFile(parsed, mode)
    migrateLegacyBearings(parsed)
    const validation = validateCueFileForMode(mode, parsed)

    if (!validation.valid) {
      throw new Error(`Invalid node cue file: ${validation.errors.join(', ')}`)
    }

    return validation.data
  }

  /**
   * Rewrite a parsed cue file in place onto what this build reads, renaming its raisers' parameters
   * as the effect files they raise from were renamed and checking its raisers against those effects.
   * The mode is the file's own when the caller gives none. Returns the notes of what changed.
   */
  public async migrateOlderFile(
    parsed: unknown,
    mode?: NodeCueMode,
    effectFiles: EffectFilesByMode = this.effectFilesPass ?? new Map(),
  ): Promise<NodeFileChanges> {
    const { effectLoader } = this.options
    const declared = typeof parsed === 'object' && parsed !== null && 'mode' in parsed
    const fileMode = mode ?? this.getModes().find((m) => declared && parsed.mode === m)
    if (!effectLoader || !fileMode) return migrateOlderNodeFile(parsed)
    const files = await readEffectFiles(effectLoader, fileMode, effectFiles)
    const effects: EffectLookup = (effectFileId, effectId) =>
      files.get(effectFileId)?.effects.find((effect) => effect.id === effectId)
    return migrateOlderNodeFile(parsed, this.effectFileRenames(fileMode), effects)
  }

  /**
   * Resolves a renderer-supplied path to an absolute path inside one of the cue roots, or throws.
   * Use this when an IPC handler needs the rooted path (e.g. for fs.copyFile during export) and must
   * not trust the raw IPC string.
   */
  public resolveCueFilePathForIpc(filePath: string): string {
    return this.resolveExistingCueFilePath(filePath).filePath
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
    const { filePath: resolvedPath } = this.resolveExistingCueFilePath(filePath)
    await fs.rm(resolvedPath, { force: true })
    this.forgetFile(resolvedPath)
    await this.publishChanges()
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

  protected async readAndRegister(
    mode: NodeCueMode,
    filePath: string,
  ): Promise<NodeCueFileSummary> {
    const contents = await fs.readFile(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(contents)
    const effectFiles = this.effectFilesPass ?? new Map()
    const changes = await this.migrateOlderFile(parsed, mode, effectFiles)
    migrateLegacyBearings(parsed)
    const validation = validateCueFileForMode(mode, parsed)

    if (!validation.valid) {
      throw new Error(validation.errors.join(', '))
    }

    const file = validation.data
    const displaced = this.claimGroupId(filePath, mode, file.group.id)
    // Per-cue compile failures go on the file's summary, where the cue editor lists them.
    const compileErrors: string[] = []
    const compileWarnings: string[] = []
    await this.registerFile(filePath, mode, file, {
      compileErrors,
      compileWarnings,
      displaced,
      effectFiles,
    })
    const saved = await this.writeMigratedFile(filePath, parsed, changes)

    const lightingCueCount = file.cues.filter((c) => c.kind === 'lighting').length
    const motionCueCount = file.cues.filter((c) => c.kind === 'motion').length
    const kindCueCounts: Record<string, number> = {}
    for (const strategy of kindStrategies) {
      const count = strategy.countCues?.(file)
      if (count !== undefined) kindCueCounts[strategy.kind] = count
    }

    const warnings = [...validation.warnings, ...compileWarnings]
    for (const warning of warnings) {
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
      warnings: warnings.length > 0 ? warnings : undefined,
      migrations: saved.migrations,
      unsaved: saved.unsaved,
    }

    this.updateSummary(summary)
    return summary
  }

  /**
   * Build and register a file's group. `displaced` is the later-named file the group id is taken
   * from, whose group this one replaces.
   */
  private async registerFile(
    filePath: string,
    mode: NodeCueMode,
    file: NodeCueFile,
    build: {
      compileErrors: string[]
      compileWarnings: string[]
      displaced?: string
      effectFiles: EffectFilesByMode
    },
  ): Promise<void> {
    const { compileErrors, compileWarnings, displaced, effectFiles } = build
    const effectFileIds = effectFileIdsOf(file)
    const strategy = strategyForFile(file)
    if (strategy) {
      this.unregisterFile(filePath)
      if (displaced !== undefined) {
        this.takeGroupFrom(displaced, filePath, { mode, groupId: file.group.id, builtIn: false })
      }
      await strategy.registerFile(file, mode, compileErrors)
      this.fileRegistrations.set(filePath, {
        mode,
        groupId: file.group.id,
        kind: strategy.kind,
        effectFileIds,
      })
      return
    }

    const context = this.buildContext(effectFiles)

    // The group is built while the previous one keeps serving, and swapped in without an await
    // between taking the old group out and putting the new one in, so no cue resolves against a
    // registry that is missing it.
    if (mode === 'audio') {
      // Narrowed once for the whole branch: `mode` decides the file shape, but it is a separate
      // parameter, so nothing else here narrows `file` off the union. The cue loop needs it too,
      // because `cueTypeId` is the audio cue's identifier and the net cues have no such field.
      const audioFile = file as AudioNodeCueFile
      const group = await this.buildOrUnregister(filePath, () =>
        buildAudioGroup(audioFile, compileErrors, context, compileWarnings),
      )
      if (displaced !== undefined) {
        this.takeGroupFrom(displaced, filePath, { mode, groupId: group.id, builtIn: true })
      }
      this.registerAudioGroup(filePath, audioFile, group)
    } else {
      // Both net modes compile through the same path and differ only in which registry instance
      // they load into, which the per-mode map supplies.
      const group = await this.buildOrUnregister(filePath, () =>
        buildNetGroup(file as NetNodeCueFile, compileErrors, context, compileWarnings),
      )
      if (displaced !== undefined) {
        this.takeGroupFrom(displaced, filePath, { mode, groupId: group.id, builtIn: true })
      }
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

  /**
   * Hand a file the group id of the later-named file it takes it from. When both groups are built
   * in, the registration moves to the file, so the file's rebuilt group swaps in where that one
   * served.
   */
  private takeGroupFrom(
    displaced: string,
    filePath: string,
    claim: { mode: NodeCueMode; groupId: string; builtIn: boolean },
  ): void {
    const { mode, groupId } = claim
    const registration = this.fileRegistrations.get(displaced)
    if (!registration) return
    if (claim.builtIn && this.holdsGroup(displaced, mode, groupId)) {
      this.unregisterFile(filePath)
      this.fileRegistrations.delete(displaced)
      this.fileRegistrations.set(filePath, registration)
    } else {
      this.unregisterFile(displaced)
    }
    this.refuseGroupId(displaced, mode, groupId, filePath)
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
    this.releaseGroupId(registration.mode, registration.groupId)
  }

  /** Two files sharing a group id would overwrite each other in the registry (see registerFile). */
  protected heldGroupIds(): Iterable<[string, GroupIdClaim<NodeCueMode>]> {
    return this.fileRegistrations
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

  private resolveExistingCueFilePath(userPath: string): { filePath: string; mode: NodeCueMode } {
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

  /** The renames a load gave the variable names of the effect files a cue of this mode raises. */
  private effectFileRenames(mode: NodeCueMode): EffectFileRenames {
    const effectMode = getCueDomain(mode).effectMode
    return (effectFileId) => this.options.effectLoader?.variableRenamesFor(effectMode, effectFileId)
  }

  /** What the group builders need from this loader, reading effect files through `effectFiles`. */
  private buildContext(effectFiles: EffectFilesByMode): CueGroupBuildContext {
    return {
      runtimeBroadcaster: this.options.runtimeBroadcaster,
      nodeCueDebug: this.nodeCueDebug,
      getNodeRuntimeCallbacks: this.options.getNodeRuntimeCallbacks,
      buildEffectRegistry: (effects, mode) =>
        buildEffectRegistry(this.options.effectLoader, effects, mode, effectFiles),
    }
  }
}
