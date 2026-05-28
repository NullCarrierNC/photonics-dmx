import { AudioCueData, AudioCueType, EventContext, TriggerContext } from '../../types/audioCueTypes'
import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { calculateActionDuration, CompiledAudioCue } from '../compiler/NodeCueCompiler'
import { ActionEffectFactory } from '../compiler/ActionEffectFactory'
import {
  AudioEventNode,
  AudioTriggerNode,
  AudioTriggerSpectralGates,
  LogicNode,
  ValueSource,
  AudioNodeCueDefinition,
} from '../../types/nodeCueTypes'
import { RENDERER_RECEIVE } from '../../../../shared/ipcChannels'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { NodeExecutionEngine } from './NodeExecutionEngine'
import { UninitializedVariableError } from './valueResolver'
import { VariableValue } from './executionTypes'
import { EffectRegistry } from './EffectRegistry'
import { findBestMatchingBandId, getBandEnergy } from '../../../listeners/Audio/bandEnergy'
import { createLogger } from '../../../../shared/logger'
const log = createLogger('BaseAudioNodeCue')

interface AudioEventState {
  previousValue: number
  active: boolean
}

interface EdgeEvaluation {
  mode: 'edge'
  triggered: boolean
  intensity: number
}

interface LevelEvaluation {
  mode: 'level'
  active: boolean
  intensity: number
}

type AudioEventEvaluation = EdgeEvaluation | LevelEvaluation

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

/** Default energy smoothing (0–1) when trigger.smoothing is omitted */
const DEFAULT_EMA_SMOOTHING = 0.45

function checkSpectralGateRange(
  range: { min?: number; max?: number } | undefined,
  value: number,
): boolean {
  if (range === undefined) return true
  if (range.min !== undefined && value < range.min) return false
  if (range.max !== undefined && value > range.max) return false
  return true
}

function spectralGatesPass(
  gates: AudioTriggerSpectralGates,
  flatness: number,
  zcr: number,
  hfc: number,
  crest: number,
): boolean {
  if (!checkSpectralGateRange(gates.flatness, flatness)) return false
  if (!checkSpectralGateRange(gates.zeroCrossingRate, zcr)) return false
  if (!checkSpectralGateRange(gates.hfcOnset, hfc)) return false
  if (!checkSpectralGateRange(gates.crest, crest)) return false
  return true
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
  activeLevelEffects: Map<string, number>
  smoothedBandEnergy: Map<string, number>
  cueLevelVarStore: Map<string, VariableValue>
  groupLevelVarStore: Map<string, VariableValue>
  executionEngine: NodeExecutionEngine | null
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

  constructor(
    groupId: string,
    protected readonly compiledCue: CompiledAudioCue,
    effectRegistry: EffectRegistry | undefined,
    private readonly runtimeBroadcaster: RuntimeBroadcaster,
    cueType: AudioCueType,
  ) {
    const definition = compiledCue.definition as AudioNodeCueDefinition
    this.id = `${groupId}:${definition.id}`
    this.cueType = cueType
    this.name = definition.name || definition.id
    this.description = definition.description || definition.name || 'Node-based audio cue'
    this.effectRegistry = effectRegistry ?? new EffectRegistry()
    this.groupId = groupId
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
      cueLevelVarStore: new Map(),
      // Group-level variables are per-rig (per-sequencer): when several chains run the same
      // cue group in lockstep each chain accumulates its own counters/state, so they stay in
      // sync even when cue logic mutates group state during execute().
      groupLevelVarStore: this.getGroupVarStore(sequencer),
      executionEngine: null,
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
        state.firstSubmissionUsesSetEffectRef,
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
        state.executionEngine.startExecution(
          event,
          cueData as unknown as import('../../types/cueTypes').CueData,
        )
      }
      state.cueStartedFired = true
    }

    for (const event of this.compiledCue.eventMap.values()) {
      if (event.eventType === 'cue-started') {
        continue
      }
      if (event.eventType === 'cue-called') {
        const eventContext: EventContext = { eventRawValue: 1 }
        const cueData: AudioCueData & { eventContext: EventContext } = {
          ...safeData,
          eventContext,
        }
        state.executionEngine.startExecution(
          event,
          cueData as unknown as import('../../types/cueTypes').CueData,
        )
        continue
      }
      if (event.eventType === 'audio-trigger') {
        this.executeAudioTriggerNode(state, event as AudioTriggerNode, safeData)
        continue
      }
      const eventState = this.getEventState(state, event.id)
      const evaluation = this.evaluateEvent(event as AudioEventNode, safeData, eventState)
      const effectKey = this.effectKey(event.id)

      if (evaluation.mode === 'edge') {
        if (!evaluation.triggered) continue

        const cooldownMs = (event as AudioEventNode).cooldownMs ?? 0
        if (cooldownMs > 0) {
          const now = Date.now()
          const last = state.lastTriggerTime.get(event.id) ?? 0
          if (now - last < cooldownMs) continue
          state.lastTriggerTime.set(event.id, now)
        }

        const eventContext: EventContext = { eventRawValue: evaluation.intensity }
        const cueData: AudioCueData & { eventContext: EventContext } = {
          ...safeData,
          eventContext,
        }
        state.executionEngine.startExecution(
          event,
          cueData as unknown as import('../../types/cueTypes').CueData,
        )
      } else {
        let actionStep: { actionId: string; delay: number } | null = null
        try {
          actionStep = this.findFirstAction(state, event.id)
        } catch (error) {
          if (error instanceof UninitializedVariableError) {
            this.runtimeBroadcaster.emit(
              RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR,
              `${event.id}: ${error.message}`,
            )
          }
          log.error(`Error in findFirstAction for event ${event.id}:`, error)
          continue
        }
        if (!actionStep) {
          continue
        }

        const action = this.compiledCue.actionMap.get(actionStep.actionId)
        if (!action) continue

        const lights = ActionEffectFactory.resolveLights(
          lightManager,
          action.target,
          (varName: string) => {
            const cueVar = state.cueLevelVarStore.get(varName)
            const groupVar = state.groupLevelVarStore.get(varName)
            return cueVar ?? groupVar
          },
        )
        if (!lights.length) continue

        if (evaluation.active) {
          const effect = ActionEffectFactory.buildEffect({
            action,
            lights,
            waitCondition: 'none',
            intensityScale: evaluation.intensity,
          })

          if (effect) {
            const layer = action.layer?.source === 'literal' ? Number(action.layer.value) : 0
            if (state.firstSubmissionUsesSetEffectRef.use) {
              state.firstSubmissionUsesSetEffectRef.use = false
              sequencer.removeAllEffects()
            } else {
              sequencer.removeEffect(effectKey, layer)
            }
            sequencer.addEffect(effectKey, effect)
            state.activeLevelEffects.set(effectKey, layer)
          }
        } else if (state.activeLevelEffects.has(effectKey)) {
          const layer = action.layer?.source === 'literal' ? Number(action.layer.value) : 0
          sequencer.removeEffect(effectKey, layer)
          state.activeLevelEffects.delete(effectKey)
        }
      }
    }

    if (tasks.length) {
      await Promise.allSettled(tasks)
    }
  }

  onStop(): void {
    const skipEffectRemoval = this.skipEffectRemovalOnStop()
    for (const state of this.states.values()) {
      if (state.executionEngine) {
        state.executionEngine.cancelAll(skipEffectRemoval)
      }
      state.executionEngine = null
      state.cueStartedFired = false
      state.eventStates.clear()
      state.triggerPhase.clear()
      state.triggerEnterTime.clear()
      state.lastTriggerTime.clear()
      state.activeLevelEffects.clear()
      state.smoothedBandEnergy.clear()
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
  releaseSequencer(sequencer: ILightingController): void {
    const state = this.states.get(sequencer)
    if (state) {
      if (state.executionEngine) {
        state.executionEngine.cancelAll(this.skipEffectRemovalOnStop())
      }
      this.states.delete(sequencer)
    }
    // Different cues in the same group share the per-sequencer group-var inner Map, so we
    // only need to drop the outer entry on the first cue's release. Subsequent releases
    // for the same sequencer find no entry and no-op.
    BaseAudioNodeCue.groupLevelVarStores.delete(sequencer)
  }

  private initializeVariables(state: AudioCueRunState): void {
    const definition = this.compiledCue.definition as AudioNodeCueDefinition

    const cueVariables = definition.variables ?? []
    for (const varDef of cueVariables) {
      if (!state.cueLevelVarStore.has(varDef.name)) {
        state.cueLevelVarStore.set(varDef.name, {
          type: varDef.type,
          value: varDef.initialValue,
        })
      }
    }

    const groupVariables = this.compiledCue.groupVariables ?? []
    for (const varDef of groupVariables) {
      if (!state.groupLevelVarStore.has(varDef.name)) {
        state.groupLevelVarStore.set(varDef.name, {
          type: varDef.type,
          value: varDef.initialValue,
        })
      }
    }
  }

  private getPeakFrequencyInRange(
    rawData: number[],
    sampleRate: number,
    fftSize: number,
    minHz: number,
    maxHz: number,
  ): number {
    if (!rawData.length || sampleRate <= 0 || fftSize <= 0) return 0
    const binSize = sampleRate / fftSize
    const startBin = Math.floor(minHz / binSize)
    const endBin = Math.min(Math.ceil(maxHz / binSize), rawData.length)
    let peakBin = startBin
    let maxVal = 0
    for (let i = startBin; i < endBin; i++) {
      if (rawData[i] > maxVal) {
        maxVal = rawData[i]
        peakBin = i
      }
    }
    return peakBin * binSize
  }

  private executeAudioTriggerNode(
    state: AudioCueRunState,
    trigger: AudioTriggerNode,
    data: AudioCueData,
  ): void {
    const audioData = data.audioData
    const { rawFrequencyData, sampleRate, fftSize } = audioData
    if (!rawFrequencyData?.length || sampleRate == null || fftSize == null) return

    const { frequencyRange, threshold } = trigger
    const minHz = clamp(frequencyRange.minHz, 20, 20000)
    const maxHz = clamp(frequencyRange.maxHz, 20, 20000)
    const triggerThreshold = clamp(threshold, 0, 1)
    const hysteresis = clamp(trigger.hysteresis ?? 0, 0, 1)
    const holdMs = Math.max(0, trigger.holdMs ?? 0)
    const releaseThreshold = Math.max(0, triggerThreshold - hysteresis)

    const bandEnergy = getBandEnergy(rawFrequencyData, sampleRate, fftSize, minHz, maxHz)
    const smoothing = clamp(trigger.smoothing ?? DEFAULT_EMA_SMOOTHING, 0, 1)
    const alpha = 1 - smoothing
    const prevSmoothed = state.smoothedBandEnergy.get(trigger.id) ?? bandEnergy
    const smoothedEnergy = alpha * bandEnergy + (1 - alpha) * prevSmoothed
    state.smoothedBandEnergy.set(trigger.id, smoothedEnergy)
    const peakFreq = this.getPeakFrequencyInRange(
      rawFrequencyData,
      sampleRate,
      fftSize,
      minHz,
      maxHz,
    )

    const matchedBandId = findBestMatchingBandId(data.config.bands, minHz, maxHz)
    const bandFeat =
      matchedBandId != null ? audioData.bandSpectralFeatures?.[matchedBandId] : undefined
    const flatnessForGate = bandFeat?.flatness ?? audioData.spectralFlatness ?? 0
    const crestForGate = bandFeat?.crest ?? audioData.spectralCrest ?? 0
    const zcrGlobal = audioData.zeroCrossingRate ?? 0
    const hfcGlobal = audioData.hfcOnset ?? 0

    const gates = trigger.spectralGates
    const spectralOk =
      gates == null
        ? true
        : spectralGatesPass(gates, flatnessForGate, zcrGlobal, hfcGlobal, crestForGate)

    const onsetThreshold = clamp(trigger.onsetThreshold ?? 0.3, 0, 1)
    let onsetOk = true
    if (trigger.useOnsetGating) {
      if (matchedBandId != null && audioData.bandOnsets) {
        const o = audioData.bandOnsets[matchedBandId] ?? 0
        onsetOk = o >= onsetThreshold
      }
    }

    const phase = state.triggerPhase.get(trigger.id) ?? 'idle'
    const now = Date.now()
    const enterTime = state.triggerEnterTime.get(trigger.id) ?? 0

    let energyActive: boolean
    if (phase === 'idle') {
      energyActive = bandEnergy >= triggerThreshold
    } else if (bandEnergy >= releaseThreshold) {
      energyActive = true
    } else {
      energyActive = now - enterTime < holdMs
    }

    const shouldBeActive = energyActive && spectralOk && onsetOk

    const triggerContext: TriggerContext = {
      triggerLevel: smoothedEnergy,
      triggerFrequencyMin: minHz,
      triggerFrequencyMax: maxHz,
      triggerPeakFrequency: peakFreq,
      triggerBandAmplitude: smoothedEnergy,
    }
    if (matchedBandId != null) {
      triggerContext.triggerMatchedBandId = matchedBandId
    }
    if (bandFeat) {
      triggerContext.triggerBandFlatness = bandFeat.flatness
      triggerContext.triggerBandCrest = bandFeat.crest
      triggerContext.triggerBandCentroid = bandFeat.centroid
    }
    if (matchedBandId != null && audioData.bandOnsets) {
      triggerContext.triggerBandOnset = audioData.bandOnsets[matchedBandId] ?? 0
    }

    if (!shouldBeActive) {
      if (phase === 'active') {
        state.triggerPhase.set(trigger.id, 'idle')
        state.triggerEnterTime.delete(trigger.id)
        const cueData: AudioCueData = { ...data, triggerContext }
        state.executionEngine!.startExecutionWithCallback(
          trigger,
          cueData as unknown as import('../../types/cueTypes').CueData,
          undefined,
          { fromPort: 'exit' },
        )
      }
      return
    }

    if (phase === 'idle') {
      state.triggerPhase.set(trigger.id, 'active')
      state.triggerEnterTime.set(trigger.id, now)
      const cueData: AudioCueData = { ...data, triggerContext }
      state.executionEngine!.startExecutionWithCallback(
        trigger,
        cueData as unknown as import('../../types/cueTypes').CueData,
        undefined,
        { fromPort: 'enter' },
      )
    }

    state.triggerPhase.set(trigger.id, 'active')
    const cueDataDuring: AudioCueData = { ...data, triggerContext }
    state.executionEngine!.startExecutionWithCallback(
      trigger,
      cueDataDuring as unknown as import('../../types/cueTypes').CueData,
      undefined,
      { fromPort: 'during' },
    )
  }

  private getEventState(state: AudioCueRunState, eventId: string): AudioEventState {
    if (!state.eventStates.has(eventId)) {
      state.eventStates.set(eventId, { previousValue: 0, active: false })
    }
    return state.eventStates.get(eventId)!
  }

  private evaluateEvent(
    event: AudioEventNode,
    data: AudioCueData,
    state: AudioEventState,
  ): AudioEventEvaluation {
    const threshold = clamp(event.threshold ?? 0.5, 0, 1)
    const currentValue = clamp(this.getEventValue(event.eventType, data), 0, 1)

    if (event.triggerMode === 'edge') {
      let triggered = state.previousValue < threshold && currentValue >= threshold
      if (triggered && event.useOnsetGating) {
        const bandOnsets = data.audioData.bandOnsets
        const onsetThreshold = clamp(event.onsetThreshold ?? 0.3, 0, 1)
        let maxOnset = 0
        if (bandOnsets && Object.keys(bandOnsets).length > 0) {
          maxOnset = Math.max(...Object.values(bandOnsets))
        }
        if (maxOnset < onsetThreshold) {
          triggered = false
        }
      }
      state.previousValue = currentValue
      state.active = triggered
      return {
        mode: 'edge',
        triggered,
        intensity: currentValue,
      }
    }

    const isActive = currentValue >= threshold
    const normalizedRange = threshold >= 1 ? 1 : (currentValue - threshold) / (1 - threshold)
    const intensity = isActive ? clamp(normalizedRange, 0.05, 1) : 0
    state.previousValue = currentValue
    state.active = isActive

    return {
      mode: 'level',
      active: isActive,
      intensity,
    }
  }

  private getEventValue(eventType: AudioEventNode['eventType'], data: AudioCueData): number {
    const { audioData } = data
    switch (eventType) {
      case 'cue-started':
        return 0
      case 'cue-called':
        return 0
      case 'beat':
        return audioData.beatDetected ? 1 : 0
      case 'audio-energy':
        return clamp(audioData.energy ?? 0, 0, 1)
      case 'audio-trigger':
        return 0
      case 'audio-centroid':
        return clamp(audioData.spectralCentroid ?? 0, 0, 1)
      case 'audio-flatness':
        return clamp(audioData.spectralFlatness ?? 0, 0, 1)
      case 'audio-hfc':
        return clamp(audioData.hfcOnset ?? 0, 0, 1)
      default:
        return 0
    }
  }

  private evaluateLogicNode(
    runState: AudioCueRunState,
    logicNode: LogicNode,
    nodeId: string,
  ): string[] {
    const { adjacency } = this.compiledCue
    const edges = adjacency.get(nodeId) ?? []

    switch (logicNode.logicType) {
      case 'variable': {
        if (logicNode.mode !== 'get') {
          if (logicNode.valueType === 'light-array') {
            log.warn(
              'Cannot set light-array variable from variable node, use config-data node instead',
            )
            return edges.map((edge) => edge.to)
          }

          if (logicNode.valueType === 'cue-type') {
            const value = this.resolveValue(runState, 'string', logicNode.value)
            const varStore = this.getVariableStore(runState, logicNode.varName)

            if (logicNode.mode === 'init') {
              if (!varStore.has(logicNode.varName)) {
                varStore.set(logicNode.varName, { type: logicNode.valueType, value })
              }
            } else {
              varStore.set(logicNode.varName, { type: logicNode.valueType, value })
            }
            return edges.map((edge) => edge.to)
          }

          const value = this.resolveValue(runState, logicNode.valueType, logicNode.value)
          const varStore = this.getVariableStore(runState, logicNode.varName)

          if (logicNode.mode === 'init') {
            if (!varStore.has(logicNode.varName)) {
              varStore.set(logicNode.varName, { type: logicNode.valueType, value })
            }
          } else {
            varStore.set(logicNode.varName, { type: logicNode.valueType, value })
          }
        }
        return edges.map((edge) => edge.to)
      }
      case 'math': {
        const left = Number(this.resolveValue(runState, 'number', logicNode.left))
        const right = Number(this.resolveValue(runState, 'number', logicNode.right))
        let result = 0
        switch (logicNode.operator) {
          case 'add':
            result = left + right
            break
          case 'subtract':
            result = left - right
            break
          case 'multiply':
            result = left * right
            break
          case 'divide':
            result = right === 0 ? 0 : left / right
            break
          case 'modulus':
            result = right === 0 ? 0 : left % right
            break
        }
        if (logicNode.assignTo) {
          const varStore = this.getVariableStore(runState, logicNode.assignTo)
          varStore.set(logicNode.assignTo, { type: 'number', value: result })
        }
        return edges.map((edge) => edge.to)
      }
      case 'conditional': {
        const left = Number(this.resolveValue(runState, 'number', logicNode.left))
        const right = Number(this.resolveValue(runState, 'number', logicNode.right))
        let outcome = false
        switch (logicNode.comparator) {
          case '>':
            outcome = left > right
            break
          case '>=':
            outcome = left >= right
            break
          case '<':
            outcome = left < right
            break
          case '<=':
            outcome = left <= right
            break
          case '==':
            outcome = left === right
            break
          case '!=':
            outcome = left !== right
            break
        }
        const branch = outcome ? 'true' : 'false'
        const targeted = edges.filter((edge) => edge.fromPort === branch)
        return targeted.map((edge) => edge.to)
      }
    }

    return edges.map((edge) => edge.to)
  }

  private getVariableStore(
    runState: AudioCueRunState,
    varName: string,
  ): Map<string, VariableValue> {
    const definition = this.compiledCue.definition as AudioNodeCueDefinition
    const cueVariables = definition.variables ?? []
    const isCueLevel = cueVariables.some((v) => v.name === varName)

    return isCueLevel ? runState.cueLevelVarStore : runState.groupLevelVarStore
  }

  private resolveValue(
    runState: AudioCueRunState,
    expectedType: 'number' | 'boolean' | 'string' | 'color' | 'event',
    source?: ValueSource,
  ): number | boolean | string {
    if (!source) {
      return expectedType === 'number' ? 0 : expectedType === 'boolean' ? false : ''
    }

    if (source.source === 'literal') {
      if (expectedType === 'string' || expectedType === 'color' || expectedType === 'event') {
        return String(source.value)
      }
      if (expectedType === 'number') {
        if (typeof source.value === 'boolean') {
          return source.value ? 1 : 0
        }
        if (typeof source.value === 'string') {
          const parsed = parseFloat(source.value)
          return isNaN(parsed) ? 0 : parsed
        }
        return typeof source.value === 'number' ? source.value : 0
      }
      return source.value === true || source.value === 'true'
    }

    const cueVar = runState.cueLevelVarStore.get(source.name)
    const groupVar = runState.groupLevelVarStore.get(source.name)
    const existing = cueVar ?? groupVar

    if (existing) {
      if (expectedType === 'string' || expectedType === 'color' || expectedType === 'event') {
        return String(existing.value)
      }
      if (expectedType === 'number') {
        if (typeof existing.value === 'string') {
          const parsed = parseFloat(existing.value)
          return isNaN(parsed) ? 0 : parsed
        }
        return typeof existing.value === 'number' ? existing.value : existing.value ? 1 : 0
      }
      return existing.value === true || existing.value === 'true'
    }

    throw new UninitializedVariableError(source.name)
  }

  private findFirstAction(
    runState: AudioCueRunState,
    eventId: string,
  ): { actionId: string; delay: number } | null {
    const visited = new Set<string>()
    const queue: Array<{ nodeId: string; delay: number }> = []
    const outgoing = this.compiledCue.adjacency.get(eventId) ?? []
    outgoing.forEach((conn) => queue.push({ nodeId: conn.to, delay: 0 }))

    while (queue.length) {
      const { nodeId, delay } = queue.shift()!
      if (visited.has(nodeId)) continue
      visited.add(nodeId)

      if (this.compiledCue.actionMap.has(nodeId)) {
        return { actionId: nodeId, delay }
      }

      const logicNode = this.compiledCue.logicMap.get(nodeId)
      if (logicNode) {
        const nextTargets = this.evaluateLogicNode(runState, logicNode, nodeId)
        const nextDelay = delay
        nextTargets.forEach((nextId) => queue.push({ nodeId: nextId, delay: nextDelay }))
        continue
      }

      const nextEdges = this.compiledCue.adjacency.get(nodeId) ?? []
      nextEdges.forEach((edge) =>
        queue.push({
          nodeId: edge.to,
          delay:
            delay +
            (this.compiledCue.actionMap.has(nodeId)
              ? calculateActionDuration(this.compiledCue.actionMap.get(nodeId)!)
              : 0),
        }),
      )
    }

    return null
  }

  private effectKey(eventId: string): string {
    return `${this.id}:${eventId}`
  }
}
