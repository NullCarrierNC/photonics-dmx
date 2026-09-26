/**
 * Turning a validated cue file into the group a registry holds.
 *
 * Each cue is compiled on its own and a failure is collected rather than thrown, so one bad cue
 * costs its own row and not the whole file. A duplicate key is fatal, since the file cannot say
 * which of the two it means.
 */
import type {
  AudioEventNodeUnion,
  AudioNodeCueFile,
  EffectRaiserNode,
  EffectReference,
  NetEventNode,
  NetNodeCueFile,
  NodeCueMode,
  VariableDefinition,
} from '../../types/nodeCueTypes'
import { raiserParameterIssue } from '../cueValueRules'
import { NodeCueCompilationError, NodeCueCompiler } from '../compiler/NodeCueCompiler'
import type { AudioCueGroup } from '../../registries/AudioCueRegistry'
import type { ICueGroup } from '../../interfaces/INetCueGroup'
import type { INetCue } from '../../interfaces/INetCue'
import type { IAudioCue } from '../../interfaces/IAudioCue'
import { LightingNodeCue } from '../runtime/LightingNodeCue'
import { MotionNodeCue } from '../runtime/MotionNodeCue'
import { AudioNodeCue } from '../runtime/AudioNodeCue'
import { AudioMotionNodeCue } from '../runtime/AudioMotionNodeCue'
import type { CueType } from '../../types/cueTypes'
import type { AudioCueType } from '../../types/audioCueTypes'
import type { EffectRegistry } from '../runtime/EffectRegistry'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { createLogger } from '../../../../shared/logger'

const log = createLogger('cueGroupBuilders')

/** Optional host callbacks for node cue debug/error emission; used when the host provides them. */
type NodeRuntimeCallbacks = import('../runtime/executionTypes').NodeRuntimeCallbacks
type NodeCueDebugSwitch = import('../runtime/executionTypes').NodeCueDebugSwitch

/** What the builders need from the loader that owns them. */
export interface CueGroupBuildContext {
  runtimeBroadcaster: RuntimeBroadcaster
  /** Handed to every cue's engines, so debug logging can be turned on while they run. */
  nodeCueDebug?: NodeCueDebugSwitch
  getNodeRuntimeCallbacks?: () => NodeRuntimeCallbacks | undefined
  buildEffectRegistry: (
    effectReferences: EffectReference[],
    mode: NodeCueMode,
  ) => Promise<EffectRegistry>
}

/**
 * Compile one cue into the map, keeping a compile failure to the cue it came from.
 * @throws NodeCueCompilationError when the key is already taken
 */
async function addCue<K, V>(args: {
  key: K
  into: Map<K, V>
  /** Names the cue in the collected compile error. */
  label: string
  /** Names the key in the duplicate error, matching what validation says about the same file. */
  keyLabel: string
  groupName: string
  compileErrors: string[]
  build: () => Promise<V>
}): Promise<void> {
  const { key, into, label, keyLabel, groupName, compileErrors, build } = args
  if (into.has(key)) {
    throw new NodeCueCompilationError(`Duplicate ${keyLabel} in group '${groupName}'.`)
  }
  try {
    into.set(key, await build())
  } catch (err) {
    log.warn(`Skipping ${label}:`, err)
    compileErrors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * The group a file must produce, or the file is not usable. When every cue failed to compile, the
 * first cue's failure is the reason given.
 */
function assertHasCues(
  lighting: number,
  motion: number,
  what: string,
  compileErrors: readonly string[],
): void {
  if (lighting > 0 || motion > 0) return
  const [firstCause] = compileErrors
  throw new NodeCueCompilationError(
    firstCause !== undefined
      ? `No ${what} in the group compiled. ${firstCause}`
      : `Group must contain at least one lighting or motion ${what} definition.`,
  )
}

/**
 * What the cue value rules warn about in the parameters each effect raiser passes, checked against
 * the parameters the raised effect declares and the action fields each one feeds.
 */
function raiserWarnings(
  label: string,
  raisers: readonly EffectRaiserNode[],
  effects: EffectRegistry,
  variables: readonly VariableDefinition[],
  mode: NodeCueMode,
): string[] {
  return raisers.flatMap((raiser) => {
    const effect = effects.getEffect(raiser.effectId)
    if (!effect) return []
    const effectActions = effect.definition.nodes.actions ?? []
    return [...effect.parameters.values()].flatMap((parameter) => {
      const issue = raiserParameterIssue(parameter, raiser.parameterValues?.[parameter.name], {
        effectActions,
        variables,
        mode,
      })
      return issue
        ? [
            `${label}: effect raiser '${raiser.label ?? raiser.id}' parameter '${parameter.name}': ${issue.message}.`,
          ]
        : []
    })
  })
}

/** Build the YARG or RB3 group a net cue file describes. */
export async function buildNetGroup(
  file: NetNodeCueFile,
  compileErrors: string[],
  ctx: CueGroupBuildContext,
  compileWarnings: string[] = [],
): Promise<ICueGroup> {
  const cues = new Map<CueType, INetCue>()
  const motionCues = new Map<string, INetCue>()

  for (const cue of file.cues) {
    const compile = async (): Promise<{
      compiled: ReturnType<typeof NodeCueCompiler.compileCue<NetEventNode>>
      effects: EffectRegistry
    }> => {
      const compiled = NodeCueCompiler.compileCue<NetEventNode>(cue, file.mode)
      compiled.groupVariables = file.group.variables ?? []
      const effects = await ctx.buildEffectRegistry(cue.effects ?? [], file.mode)
      compileWarnings.push(
        ...raiserWarnings(
          `cue '${cue.kind === 'lighting' ? cue.cueType : cue.id}'`,
          cue.nodes.effectRaisers ?? [],
          effects,
          [...compiled.groupVariables, ...(cue.variables ?? [])],
          file.mode,
        ),
      )
      return { compiled, effects }
    }

    if (cue.kind === 'lighting') {
      await addCue({
        key: cue.cueType,
        into: cues,
        label: `cue '${cue.cueType}'`,
        keyLabel: `cueType '${cue.cueType}'`,
        groupName: file.group.name,
        compileErrors,
        build: async () => {
          const { compiled, effects } = await compile()
          return new LightingNodeCue(
            file.group.id,
            compiled,
            effects,
            ctx.getNodeRuntimeCallbacks?.(),
            ctx.runtimeBroadcaster,
            ctx.nodeCueDebug,
          )
        },
      })
    } else {
      await addCue({
        key: cue.id,
        into: motionCues,
        label: `motion cue '${cue.id}'`,
        keyLabel: `motion cue id '${cue.id}'`,
        groupName: file.group.name,
        compileErrors,
        build: async () => {
          const { compiled, effects } = await compile()
          return new MotionNodeCue(
            file.group.id,
            compiled,
            effects,
            ctx.getNodeRuntimeCallbacks?.(),
            ctx.runtimeBroadcaster,
            ctx.nodeCueDebug,
          )
        },
      })
    }
  }

  assertHasCues(cues.size, motionCues.size, 'cue', compileErrors)

  const result: ICueGroup = {
    id: file.group.id,
    name: file.group.name,
    description: file.group.description,
    cues,
  }
  if (motionCues.size > 0) {
    result.motionCues = motionCues
  }
  return result
}

/** Build the audio group an audio cue file describes. */
export async function buildAudioGroup(
  file: AudioNodeCueFile,
  compileErrors: string[],
  ctx: CueGroupBuildContext,
  compileWarnings: string[] = [],
): Promise<AudioCueGroup> {
  const cues = new Map<AudioCueType, IAudioCue>()
  const motionCues = new Map<string, IAudioCue>()

  for (const cue of file.cues) {
    const compile = async (): Promise<{
      compiled: ReturnType<typeof NodeCueCompiler.compileCue<AudioEventNodeUnion>>
      effects: EffectRegistry
    }> => {
      const compiled = NodeCueCompiler.compileCue<AudioEventNodeUnion>(cue, 'audio')
      compiled.groupVariables = file.group.variables ?? []
      const effects = await ctx.buildEffectRegistry(cue.effects ?? [], 'audio')
      compileWarnings.push(
        ...raiserWarnings(
          `audio cue '${cue.kind === 'lighting' ? cue.cueTypeId : cue.id}'`,
          cue.nodes.effectRaisers ?? [],
          effects,
          [...compiled.groupVariables, ...(cue.variables ?? [])],
          'audio',
        ),
      )
      return { compiled, effects }
    }

    if (cue.kind === 'lighting') {
      await addCue({
        key: cue.cueTypeId,
        into: cues,
        label: `audio cue '${cue.cueTypeId}'`,
        keyLabel: `audio cue id '${cue.cueTypeId}'`,
        groupName: file.group.name,
        compileErrors,
        build: async () => {
          const { compiled, effects } = await compile()
          return new AudioNodeCue(
            file.group.id,
            compiled,
            effects,
            ctx.runtimeBroadcaster,
            ctx.nodeCueDebug,
          )
        },
      })
    } else {
      await addCue({
        key: cue.id,
        into: motionCues,
        label: `audio motion cue '${cue.id}'`,
        keyLabel: `audio motion cue id '${cue.id}'`,
        groupName: file.group.name,
        compileErrors,
        build: async () => {
          const { compiled, effects } = await compile()
          return new AudioMotionNodeCue(
            file.group.id,
            compiled,
            effects,
            ctx.runtimeBroadcaster,
            ctx.nodeCueDebug,
          )
        },
      })
    }
  }

  assertHasCues(cues.size, motionCues.size, 'audio cue', compileErrors)

  const result: AudioCueGroup = {
    id: file.group.id,
    name: file.group.name,
    description: file.group.description ?? 'Node-based audio cues',
    cues,
  }
  if (motionCues.size > 0) {
    result.motionCues = motionCues
  }
  return result
}
