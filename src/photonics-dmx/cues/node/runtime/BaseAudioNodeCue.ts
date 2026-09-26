import { AudioCueData, AudioCueType, EventContext } from '../../types/audioCueTypes'
import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CompiledAudioCue } from '../compiler/NodeCueCompiler'
import {
  ActionEffectFactory,
  type ResolvedActionTiming,
  type ResolvedColorSetting,
} from '../compiler/ActionEffectFactory'
import {
  AudioEventNode,
  AudioTriggerNode,
  BaseEventNode,
  AudioNodeCueDefinition,
} from '../../types/nodeCueTypes'
import { RENDERER_RECEIVE } from '../../../../shared/ipcChannels'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { NodeExecutionEngine } from './NodeExecutionEngine'
import { ExecutionContext } from './ExecutionContext'
import { resolveActionColor, resolveActionLayer, resolveActionTiming } from './actionResolver'
import { UnknownValueWarnings } from './valueResolver'
import { evaluateLogicNode, LogicNodeEvaluatorContext } from './logicNodeEvaluator'
import { createExecutionStateMachineLifecycle } from './executionStateMachineLifecycle'
import { VariableValue, variableValue, type NodeCueDebugSwitch } from './executionTypes'
import { EffectRegistry } from './EffectRegistry'
import { evaluateAudioEvent, type AudioEventState } from './audioEventEvaluator'
import { AudioEventRuns } from './audioEventRuns'
import { evaluateBandTrigger } from '../../audio/bandReactivity'
import { createLogger } from '../../../../shared/logger'
import { monotonicNowMs } from '../../../../shared/time'
import { dropGroupStore } from '../../registries/cueRegistrySupport'
import type { RGBIO, TrackedLight } from '../../../types'
const log = createLogger('BaseAudioNodeCue')

/** A level-mode effect on the sequencer, as {@link BaseAudioNodeCue} submitted it. */
interface LevelEffect {
  layer: number
  lights: TrackedLight[]
}

/** What a level look on the base layer leaves its lights at once it ends. */
const LEVEL_BASE_OFF: RGBIO = {
  red: 0,
  green: 0,
  blue: 0,
  intensity: 0,
  opacity: 1,
  blendMode: 'replace',
}

/**
 * Take a level effect off the sequencer. The sequencer keeps a light's layer-0 state once the
 * effect there ends, so a look on the base layer also sets its lights to black, unless a blackout
 * running now is already taking them there.
 */
function endLevelEffect(
  sequencer: ILightingController,
  effectKey: string,
  { layer, lights }: LevelEffect,
): void {
  sequencer.removeEffect(effectKey, layer)
  if (layer === 0 && !sequencer.isBlackoutActive()) {
    sequencer.setState(lights, LEVEL_BASE_OFF, 0)
  }
}

/**
 * Per-rig (per-sequencer) runtime state for an audio node cue. Each rig running the same cue
 * keeps its own event-edge detector state, trigger phase, smoothed band energy, execution
 * engine, and variable stores — sharing them across rigs would mean rig A's events advance
 * state that rig B then reads, missing its own events.
 */
interface AudioCueRunState {
  eventStates: Map<string, AudioEventState>
  triggerPhase: Map<string, 'idle' | 'active'>
  triggerEnterTime: Map<string, number>
  lastTriggerTime: Map<string, number>
  /** Each running level-mode effect by key, with the layer and lights it was submitted on. */
  activeLevelEffects: Map<string, LevelEffect>
  smoothedBandEnergy: Map<string, number>
  /** Wall-clock ms of the last band-energy smoothing update per trigger, for frame-rate-independent attack/release. */
  bandSmoothTime: Map<string, number>
  cueLevelVarStore: Map<string, VariableValue>
  groupLevelVarStore: Map<string, VariableValue>
  executionEngine: NodeExecutionEngine | null
  /** The run each cue-called or edge event has in flight, under its execution policy. */
  eventRuns: AudioEventRuns
  /** Per-context ExecutionStateMachine tracking for the engine-driven event paths. */
  esmLifecycle: ReturnType<typeof createExecutionStateMachineLifecycle>
  cueStartedFired: boolean
  /** Shared ref handed to the execution engine; when `.use` is true, the next effect submission
   *  uses setEffect (clearing the sequencer) before adding. The engine sets `.use = false`
   *  after consuming it. */
  firstSubmissionUsesSetEffectRef: { use: boolean }
}

/**
 * Shared audio node-graph runtime for lighting (`AudioNodeCue`) and motion (`AudioMotionNodeCue`).
 * Subclasses control primary-slot clearing and cue-data transforms (e.g. BPM cap for motion safety).
 *
 * Per-rig state is keyed by sequencer reference: when multiple rigs run the same cue
 * concurrently, each rig's execute call sees its own state map and engine. `onStop()` clears
 * every rig's entry for this cue so a stop can't leak state into the next activation.
 */
export abstract class BaseAudioNodeCue {
  public readonly id: string
  public readonly cueType: AudioCueType
  public readonly description: string
  public readonly name: string

  /**
   * Persisted group-level variable stores keyed by (sequencer, groupId). Per-sequencer so
   * each rig accumulates its own group-level state — rigs running the same cue in lockstep
   * see the same counter values rather than each one's mutations leaking into the others.
   * Per-groupId so different cues in the same group still share state for a given rig
   * (which is the group-var semantic cue authors expect).
   */
  private static groupLevelVarStores = new Map<
    ILightingController,
    Map<string, Map<string, VariableValue>>
  >()
  protected readonly groupId: string
  private readonly effectRegistry: EffectRegistry
  private readonly states = new Map<ILightingController, AudioCueRunState>()
  private readonly unknownValues: UnknownValueWarnings

  constructor(
    groupId: string,
    protected readonly compiledCue: CompiledAudioCue,
    effectRegistry: EffectRegistry | undefined,
    private readonly runtimeBroadcaster: RuntimeBroadcaster,
    cueType: AudioCueType,
    private readonly debug?: NodeCueDebugSwitch,
  ) {
    const definition = compiledCue.definition as AudioNodeCueDefinition
    this.id = `${groupId}:${definition.id}`
    this.cueType = cueType
    this.name = definition.name || definition.id
    this.description = definition.description || definition.name || 'Node-based audio cue'
    this.effectRegistry = effectRegistry ?? new EffectRegistry()
    this.groupId = groupId
    this.unknownValues = new UnknownValueWarnings(this.id)
  }

  private getGroupVarStore(sequencer: ILightingController): Map<string, VariableValue> {
    let perSeq = BaseAudioNodeCue.groupLevelVarStores.get(sequencer)
    if (!perSeq) {
      perSeq = new Map()
      BaseAudioNodeCue.groupLevelVarStores.set(sequencer, perSeq)
    }
    let store = perSeq.get(this.groupId)
    if (!store) {
      store = new Map()
      perSeq.set(this.groupId, store)
    }
    return store
  }

  private getOrCreateState(sequencer: ILightingController): AudioCueRunState {
    const existing = this.states.get(sequencer)
    if (existing) {
      this.initializeVariables(existing)
      return existing
    }
    const state: AudioCueRunState = {
      eventStates: new Map(),
      triggerPhase: new Map(),
      triggerEnterTime: new Map(),
      lastTriggerTime: new Map(),
      activeLevelEffects: new Map(),
      smoothedBandEnergy: new Map(),
      bandSmoothTime: new Map(),
      cueLevelVarStore: new Map(),
      // Group-level variables are per-rig (per-sequencer): when several chains run the same
      // cue group in lockstep each chain accumulates its own counters/state, so they stay in
      // sync even when cue logic mutates group state during execute().
      groupLevelVarStore: this.getGroupVarStore(sequencer),
      executionEngine: null,
      eventRuns: new AudioEventRuns(),
      esmLifecycle: createExecutionStateMachineLifecycle(),
      cueStartedFired: false,
      firstSubmissionUsesSetEffectRef: { use: false },
    }
    this.initializeVariables(state)
    this.states.set(sequencer, state)
    return state
  }

  /** Optional transform before graph execution (e.g. cap BPM for motion hardware safety). */
  protected transformCueDataForExecution(data: AudioCueData): AudioCueData {
    return data
  }

  /** When true, arm setEffect on first frame (primary lighting slot only). */
  protected abstract shouldArmPrimarySetEffectOnFirstFrame(): boolean

  /**
   * When true, `cancelAll` leaves submitted effects on the sequencer for cross-cue transitions.
   * Primary lighting uses true; motion uses false so patterns are removed on stop.
   */
  protected abstract skipEffectRemovalOnStop(): boolean

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): Promise<void> {
    const tasks: Promise<unknown>[] = []
    const safeData = this.transformCueDataForExecution(data)

    const state = this.getOrCreateState(sequencer)

    if (!state.executionEngine) {
      const definition = this.compiledCue.definition as AudioNodeCueDefinition
      const variableDefinitions = definition.variables ?? []

      state.executionEngine = new NodeExecutionEngine(
        this.compiledCue,
        this.id,
        sequencer,
        lightManager,
        this.runtimeBroadcaster,
        state.cueLevelVarStore,
        state.groupLevelVarStore,
        this.effectRegistry,
        variableDefinitions,
        {
          firstSubmissionUsesSetEffectRef: state.firstSubmissionUsesSetEffectRef,
          onContextLifecycle: state.esmLifecycle.onContextLifecycle,
          debug: this.debug,
          unknownValues: this.unknownValues,
        },
      )
    }

    if (!state.cueStartedFired) {
      if (this.shouldArmPrimarySetEffectOnFirstFrame()) {
        state.firstSubmissionUsesSetEffectRef.use = true
      }
      for (const event of this.compiledCue.eventMap.values()) {
        if (event.eventType !== 'cue-started') continue
        const eventContext: EventContext = { eventRawValue: 1 }
        const cueData: AudioCueData & { eventContext: EventContext } = {
          ...safeData,
          eventContext,
        }
        state.executionEngine.startExecution(event, cueData)
      }
      state.cueStartedFired = true
    }

    for (const event of this.compiledCue.eventMap.values()) {
      if (event.eventType === 'cue-started') {
        continue
      }
      if (event.eventType === 'cue-called') {
        this.startEventRun(state, event, safeData, 1)
        continue
      }
      if (event.eventType === 'audio-trigger') {
        this.executeAudioTriggerNode(state, event as AudioTriggerNode, safeData)
        continue
      }
      const eventState = this.getEventState(state, event.id)
      const evaluation = evaluateAudioEvent(event as AudioEventNode, safeData, eventState)
      const effectKey = this.effectKey(event.id)

      if (evaluation.mode === 'edge') {
        if (!evaluation.triggered) continue

        const cooldownMs = (event as AudioEventNode).cooldownMs ?? 0
        if (cooldownMs > 0) {
          const now = monotonicNowMs()
          const last = state.lastTriggerTime.get(event.id) ?? 0
          if (now - last < cooldownMs) continue
          state.lastTriggerTime.set(event.id, now)
        }

        this.startEventRun(state, event, safeData, evaluation.intensity)
      } else {
        const eventContext: EventContext = { eventRawValue: evaluation.intensity }
        const cueData: AudioCueData & { eventContext: EventContext } = {
          ...safeData,
          eventContext,
        }
        const execContext = new ExecutionContext(
          event,
          cueData,
          state.cueLevelVarStore,
          state.groupLevelVarStore,
          this.unknownValues,
        )
        let actionId: string | null = null
        try {
          actionId = this.findFirstAction(state, event, execContext, lightManager)
        } catch (error) {
          this.reportLevelError(event.id, 'findFirstAction', error)
          continue
        }
        if (!actionId) {
          continue
        }

        const action = this.compiledCue.actionMap.get(actionId)
        if (!action) continue

        const lights = ActionEffectFactory.resolveLights(
          lightManager,
          action.target,
          this.unknownValues,
          (varName: string) => {
            const cueVar = state.cueLevelVarStore.get(varName)
            const groupVar = state.groupLevelVarStore.get(varName)
            return cueVar ?? groupVar
          },
        )
        if (!lights.length) continue

        if (evaluation.active) {
          let resolvedColor: ResolvedColorSetting | undefined
          let resolvedTiming: ResolvedActionTiming
          let layer: number
          try {
            resolvedColor = action.color ? resolveActionColor(action.color, execContext) : undefined
            resolvedTiming = resolveActionTiming(action.timing, execContext)
            layer = resolveActionLayer(action.layer, execContext)
          } catch (error) {
            this.reportLevelError(event.id, 'resolving action', error)
            continue
          }
          const effect = ActionEffectFactory.buildEffect({
            action,
            lights,
            waitCondition: 'none',
            intensityScale: evaluation.intensity,
            resolvedColor,
            resolvedTiming,
            resolvedLayer: layer,
          })

          if (effect) {
            if (state.firstSubmissionUsesSetEffectRef.use) {
              // The first submission replaces the look like the engine's, leaving motion running.
              state.firstSubmissionUsesSetEffectRef.use = false
              sequencer.setEffect(effectKey, effect)
            } else {
              sequencer.removeEffect(effectKey, layer)
              sequencer.addEffect(effectKey, effect)
            }
            state.activeLevelEffects.set(effectKey, { layer, lights })
          }
        } else {
          const running = state.activeLevelEffects.get(effectKey)
          if (running) {
            endLevelEffect(sequencer, effectKey, running)
            state.activeLevelEffects.delete(effectKey)
          }
        }
      }
    }

    if (tasks.length) {
      await Promise.allSettled(tasks)
    }
  }

  /** Start a cue-called or edge event's graph under the event's execution policy. */
  private startEventRun(
    state: AudioCueRunState,
    event: AudioEventNode,
    data: AudioCueData,
    eventRawValue: number,
  ): void {
    const cueData: AudioCueData & { eventContext: EventContext } = {
      ...data,
      eventContext: { eventRawValue },
    }
    state.eventRuns.start(state.executionEngine!, event, event.executionPolicy, cueData)
  }

  onStop(): void {
    this.stopEveryState(this.skipEffectRemovalOnStop())
  }

  /**
   * Stop and take every effect off the sequencer regardless of style. A primary cue normally leaves
   * its effects up so the next cue can take over from the running look, which is wrong when the
   * audio look is ending rather than changing.
   */
  stopAndClearEffects(): void {
    this.stopEveryState(false)
  }

  private stopEveryState(skipEffectRemoval: boolean): void {
    for (const [sequencer, state] of this.states) {
      if (state.executionEngine) {
        state.executionEngine.cancelAll(skipEffectRemoval)
      }
      state.esmLifecycle.cancelAll()
      state.eventRuns.clear()
      state.executionEngine = null
      state.cueStartedFired = false
      state.eventStates.clear()
      state.triggerPhase.clear()
      state.triggerEnterTime.clear()
      state.lastTriggerTime.clear()
      // Level-mode effects are submitted straight to the sequencer rather than through the engine,
      // so cancelAll never sees them. Take them off by the layer each was recorded against before
      // dropping the tracking, or they stay lit with nothing left holding a reference to them.
      if (!skipEffectRemoval) {
        for (const [effectKey, running] of state.activeLevelEffects) {
          endLevelEffect(sequencer, effectKey, running)
        }
      }
      state.activeLevelEffects.clear()
      state.smoothedBandEnergy.clear()
      state.bandSmoothTime.clear()
      state.cueLevelVarStore.clear()
      state.firstSubmissionUsesSetEffectRef.use = false
    }
  }

  /**
   * Drops the per-sequencer state entry (and the per-sequencer group var store) so a
   * disposed chain's sequencer can be garbage collected. Without this hook the cue
   * instance (a registry singleton) would accumulate one stale entry per
   * `restartControllers` cycle, plus stale group var stores in the static map.
   */
  releaseGroup(): void {
    dropGroupStore(BaseAudioNodeCue.groupLevelVarStores, this.groupId)
  }

  releaseSequencer(sequencer: ILightingController): void {
    const state = this.states.get(sequencer)
    if (state) {
      if (state.executionEngine) {
        state.executionEngine.cancelAll(this.skipEffectRemovalOnStop())
      }
      state.esmLifecycle.cancelAll()
      this.states.delete(sequencer)
    }
    // Different cues in the same group share the per-sequencer group-var inner Map, so we
    // only need to drop the outer entry on the first cue's release. Subsequent releases
    // for the same sequencer find no entry and no-op.
    BaseAudioNodeCue.groupLevelVarStores.delete(sequencer)
  }

  private initializeVariables(state: AudioCueRunState): void {
    const definition = this.compiledCue.definition as AudioNodeCueDefinition

    // A cue variable lives in the store its scope names, where every read looks for it.
    const cueVariables = definition.variables ?? []
    for (const varDef of cueVariables) {
      const store = varDef.scope === 'cue' ? state.cueLevelVarStore : state.groupLevelVarStore
      if (!store.has(varDef.name)) {
        store.set(varDef.name, variableValue(varDef.type, varDef.initialValue))
      }
    }

    const groupVariables = this.compiledCue.groupVariables ?? []
    for (const varDef of groupVariables) {
      if (!state.groupLevelVarStore.has(varDef.name)) {
        state.groupLevelVarStore.set(varDef.name, variableValue(varDef.type, varDef.initialValue))
      }
    }
  }

  private executeAudioTriggerNode(
    state: AudioCueRunState,
    trigger: AudioTriggerNode,
    data: AudioCueData,
  ): void {
    // Shared signal evaluation (smoothing, spectral gates, onset, phase machine) lives in
    // bandReactivity so the laser runtime can reuse it. Here we just fire the graph on each port.
    const result = evaluateBandTrigger(
      trigger,
      data.audioData,
      data.config.bands,
      state,
      monotonicNowMs(),
    )
    if (result === null) return

    for (const port of result.fire) {
      const cueData: AudioCueData = { ...data, triggerContext: result.context }
      state.executionEngine!.startExecutionWithCallback(trigger, cueData, undefined, {
        fromPort: port,
      })
    }
  }

  private getEventState(state: AudioCueRunState, eventId: string): AudioEventState {
    if (!state.eventStates.has(eventId)) {
      state.eventStates.set(eventId, { previousValue: 0, active: false })
    }
    return state.eventStates.get(eventId)!
  }

  /**
   * Walk from a level-mode event to the first action node, evaluating logic nodes through the
   * shared evaluator so light-deriving logic (config-data, lights-from-index, random, etc.)
   * populates the variable stores the action's target then resolves against. Returns the action
   * node id, or null when the chain reaches no action.
   */
  private findFirstAction(
    runState: AudioCueRunState,
    event: BaseEventNode,
    execContext: ExecutionContext,
    lightManager: DmxLightManager,
  ): string | null {
    const definition = this.compiledCue.definition as AudioNodeCueDefinition
    const evaluatorContext: LogicNodeEvaluatorContext = {
      cueId: this.id,
      // Audio cues are always the audio family; they never route through the net extractor.
      mode: 'audio',
      lightManager,
      cueLevelVarStore: runState.cueLevelVarStore,
      groupLevelVarStore: runState.groupLevelVarStore,
      variableDefinitions: definition.variables ?? [],
      // Level mode walks the graph itself, so the evaluator never needs to dispatch a node.
      executeNode: () => {},
      debugOutput: (channel, payload) => this.runtimeBroadcaster.emit(channel, payload),
    }

    const visited = new Set<string>()
    const queue: string[] = []
    const outgoing = this.compiledCue.adjacency.get(event.id) ?? []
    outgoing.forEach((conn) => queue.push(conn.to))

    while (queue.length) {
      const nodeId = queue.shift()!
      if (visited.has(nodeId)) continue
      visited.add(nodeId)

      if (this.compiledCue.actionMap.has(nodeId)) {
        return nodeId
      }

      const logicNode = this.compiledCue.logicMap.get(nodeId)
      if (logicNode) {
        const edges = this.compiledCue.adjacency.get(nodeId) ?? []
        const nextTargets = evaluateLogicNode(
          logicNode,
          nodeId,
          edges,
          execContext,
          evaluatorContext,
        )
        nextTargets.forEach((nextId) => queue.push(nextId))
        continue
      }

      const nextEdges = this.compiledCue.adjacency.get(nodeId) ?? []
      nextEdges.forEach((edge) => queue.push(edge.to))
    }

    return null
  }

  /** Send a level-mode evaluation error to the renderer and the log. */
  private reportLevelError(eventId: string, stage: string, error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error)
    this.runtimeBroadcaster.emit(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, {
      graphId: this.id,
      nodeId: eventId,
      message: msg,
    })
    log.error(`Error in ${stage} for event ${eventId}:`, error)
  }

  private effectKey(eventId: string): string {
    return `${this.id}:${eventId}`
  }
}
