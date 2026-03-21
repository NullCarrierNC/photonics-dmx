import { IAudioCue } from '../../interfaces/IAudioCue'
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
import { sendToAllWindows } from '../../../../main/utils/windowUtils'
import { NodeExecutionEngine } from './NodeExecutionEngine'
import { UninitializedVariableError } from './valueResolver'
import { VariableValue } from './executionTypes'
import { EffectRegistry } from './EffectRegistry'
import { findBestMatchingBandId, getBandEnergy } from '../../../listeners/Audio/bandEnergy'
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

export class AudioNodeCue implements IAudioCue {
  public readonly id: string
  public readonly cueType: AudioCueType
  public readonly description: string

  private readonly eventStates = new Map<string, AudioEventState>()
  private readonly triggerPhase = new Map<string, 'idle' | 'active'>()
  /** Timestamp (ms) when trigger entered active phase; used for holdMs */
  private readonly triggerEnterTime = new Map<string, number>()
  private readonly lastTriggerTime = new Map<string, number>()
  private readonly activeLevelEffects = new Map<string, number>()
  private static cueLevelVarStores = new Map<string, Map<string, VariableValue>>()
  private static groupLevelVarStores = new Map<string, Map<string, VariableValue>>()
  private cueLevelVarStore: Map<string, VariableValue>
  private groupLevelVarStore: Map<string, VariableValue>
  private executionEngine?: NodeExecutionEngine
  private effectRegistry: EffectRegistry

  constructor(
    groupId: string,
    private readonly compiledCue: CompiledAudioCue,
    effectRegistry?: EffectRegistry,
  ) {
    const definition = compiledCue.definition as AudioNodeCueDefinition
    this.id = `${groupId}:${definition.id}`
    this.cueType = definition.cueTypeId
    this.description = definition.description || definition.name || 'Node-based audio cue'
    this.effectRegistry = effectRegistry ?? new EffectRegistry()

    // Initialize cue-level variable store
    const existingCueStore = AudioNodeCue.cueLevelVarStores.get(this.id)
    if (existingCueStore) {
      this.cueLevelVarStore = existingCueStore
    } else {
      this.cueLevelVarStore = new Map()
      AudioNodeCue.cueLevelVarStores.set(this.id, this.cueLevelVarStore)
    }

    // Initialize group-level variable store
    const existingGroupStore = AudioNodeCue.groupLevelVarStores.get(groupId)
    if (existingGroupStore) {
      this.groupLevelVarStore = existingGroupStore
    } else {
      this.groupLevelVarStore = new Map()
      AudioNodeCue.groupLevelVarStores.set(groupId, this.groupLevelVarStore)
    }

    // Initialize variables from registry definitions
    this.initializeVariables()
  }

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): Promise<void> {
    const tasks: Promise<unknown>[] = []

    // Initialize execution engine if not already created
    if (!this.executionEngine) {
      const definition = this.compiledCue.definition as AudioNodeCueDefinition
      const variableDefinitions = definition.variables ?? []

      this.executionEngine = new NodeExecutionEngine(
        this.compiledCue,
        this.id,
        sequencer,
        lightManager,
        this.cueLevelVarStore,
        this.groupLevelVarStore,
        this.effectRegistry,
        variableDefinitions,
      )
    }

    for (const event of this.compiledCue.eventMap.values()) {
      if (event.eventType === 'audio-trigger') {
        this.executeAudioTriggerNode(event as AudioTriggerNode, data)
        continue
      }
      const state = this.getEventState(event.id)
      const evaluation = this.evaluateEvent(event as AudioEventNode, data, state)
      const effectKey = this.effectKey(event.id)

      if (evaluation.mode === 'edge') {
        if (!evaluation.triggered) continue

        const cooldownMs = (event as AudioEventNode).cooldownMs ?? 0
        if (cooldownMs > 0) {
          const now = Date.now()
          const last = this.lastTriggerTime.get(event.id) ?? 0
          if (now - last < cooldownMs) continue
          this.lastTriggerTime.set(event.id, now)
        }

        const eventContext: EventContext = { eventRawValue: evaluation.intensity }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- extended cue payload shape
        const cueData = { ...data, eventContext } as any
        this.executionEngine.startExecution(event, cueData)
      } else {
        // Level-triggered events use continuous state management
        let actionStep: { actionId: string; delay: number } | null = null
        try {
          actionStep = this.findFirstAction(event.id)
        } catch (error) {
          if (error instanceof UninitializedVariableError) {
            sendToAllWindows(
              RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR,
              `${event.id}: ${error.message}`,
            )
          }
          console.error(`Error in findFirstAction for event ${event.id}:`, error)
          continue
        }
        if (!actionStep) {
          continue
        }

        const action = this.compiledCue.actionMap.get(actionStep.actionId)
        if (!action) continue

        // Resolve lights with variable resolver for light-array support
        const lights = ActionEffectFactory.resolveLights(
          lightManager,
          action.target,
          (varName: string) => {
            const cueVar = this.cueLevelVarStore.get(varName)
            const groupVar = this.groupLevelVarStore.get(varName)
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
            tasks.push(sequencer.setEffect(effectKey, effect))
            // Extract layer from ValueSource or use default
            const layer = action.layer?.source === 'literal' ? Number(action.layer.value) : 0
            this.activeLevelEffects.set(effectKey, layer)
          }
        } else if (this.activeLevelEffects.has(effectKey)) {
          // Extract layer from ValueSource or use default
          const layer = action.layer?.source === 'literal' ? Number(action.layer.value) : 0
          sequencer.removeEffect(effectKey, layer)
          this.activeLevelEffects.delete(effectKey)
        }
      }
    }

    if (tasks.length) {
      await Promise.allSettled(tasks)
    }
  }

  onStop(): void {
    if (this.executionEngine) {
      this.executionEngine.cancelAll()
    }

    this.eventStates.clear()
    this.triggerPhase.clear()
    this.triggerEnterTime.clear()
    this.lastTriggerTime.clear()
    this.activeLevelEffects.clear()
    this.cueLevelVarStore.clear()
    AudioNodeCue.cueLevelVarStores.delete(this.id)
  }

  onDestroy(): void {
    if (this.executionEngine) {
      this.executionEngine.cancelAll()
    }

    this.eventStates.clear()
    this.triggerPhase.clear()
    this.triggerEnterTime.clear()
    this.lastTriggerTime.clear()
    this.activeLevelEffects.clear()
    this.cueLevelVarStore.clear()
    AudioNodeCue.cueLevelVarStores.delete(this.id)
  }

  private initializeVariables(): void {
    const definition = this.compiledCue.definition as AudioNodeCueDefinition

    // Initialize cue-level variables
    const cueVariables = definition.variables ?? []
    for (const varDef of cueVariables) {
      if (!this.cueLevelVarStore.has(varDef.name)) {
        this.cueLevelVarStore.set(varDef.name, {
          type: varDef.type,
          value: varDef.initialValue,
        })
      }
    }

    // Initialize group-level variables from compiled cue metadata
    const groupVariables = this.compiledCue.groupVariables ?? []
    for (const varDef of groupVariables) {
      if (!this.groupLevelVarStore.has(varDef.name)) {
        this.groupLevelVarStore.set(varDef.name, {
          type: varDef.type,
          value: varDef.initialValue,
        })
      }
    }
  }

  /**
   * Find peak frequency in Hz within a range from raw FFT data.
   */
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

  private executeAudioTriggerNode(trigger: AudioTriggerNode, data: AudioCueData): void {
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
    const level = bandEnergy
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

    const phase = this.triggerPhase.get(trigger.id) ?? 'idle'
    const now = Date.now()
    const enterTime = this.triggerEnterTime.get(trigger.id) ?? 0

    let energyActive: boolean
    if (phase === 'idle') {
      energyActive = level >= triggerThreshold
    } else if (level >= releaseThreshold) {
      energyActive = true
    } else {
      energyActive = now - enterTime < holdMs
    }

    const shouldBeActive = energyActive && spectralOk && onsetOk

    const triggerContext: TriggerContext = {
      triggerLevel: level,
      triggerFrequencyMin: minHz,
      triggerFrequencyMax: maxHz,
      triggerPeakFrequency: peakFreq,
      triggerBandAmplitude: bandEnergy,
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
        this.triggerPhase.set(trigger.id, 'idle')
        this.triggerEnterTime.delete(trigger.id)
        const cueData: AudioCueData = { ...data, triggerContext }
        this.executionEngine!.startExecutionWithCallback(
          trigger,
          cueData as unknown as import('../../types/cueTypes').CueData,
          undefined,
          { fromPort: 'exit' },
        )
      }
      return
    }

    if (phase === 'idle') {
      this.triggerPhase.set(trigger.id, 'active')
      this.triggerEnterTime.set(trigger.id, now)
      const cueData: AudioCueData = { ...data, triggerContext }
      this.executionEngine!.startExecutionWithCallback(
        trigger,
        cueData as unknown as import('../../types/cueTypes').CueData,
        undefined,
        { fromPort: 'enter' },
      )
    }

    this.triggerPhase.set(trigger.id, 'active')
    const cueDataDuring: AudioCueData = { ...data, triggerContext }
    this.executionEngine!.startExecutionWithCallback(
      trigger,
      cueDataDuring as unknown as import('../../types/cueTypes').CueData,
      undefined,
      { fromPort: 'during' },
    )
  }

  private getEventState(eventId: string): AudioEventState {
    if (!this.eventStates.has(eventId)) {
      this.eventStates.set(eventId, { previousValue: 0, active: false })
    }
    return this.eventStates.get(eventId)!
  }

  private evaluateEvent(
    event: AudioEventNode,
    data: AudioCueData,
    state: AudioEventState,
  ): AudioEventEvaluation {
    const threshold = clamp(event.threshold ?? 0.5, 0, 1)
    const currentValue = clamp(this.getEventValue(event.eventType, data), 0, 1)

    if (event.triggerMode === 'edge') {
      const triggered = state.previousValue < threshold && currentValue >= threshold
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
      case 'audio-beat':
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

  private evaluateLogicNode(logicNode: LogicNode, nodeId: string): string[] {
    const { adjacency } = this.compiledCue
    const edges = adjacency.get(nodeId) ?? []

    switch (logicNode.logicType) {
      case 'variable': {
        if (logicNode.mode !== 'get') {
          // For light-array type, we can't resolve from value source (it comes from config-data)
          if (logicNode.valueType === 'light-array') {
            // Light arrays must come from config-data nodes, not variable nodes
            console.warn(
              'Cannot set light-array variable from variable node, use config-data node instead',
            )
            return edges.map((edge) => edge.to)
          }

          // For cue-type, treat it as a string (it's a string identifier)
          if (logicNode.valueType === 'cue-type') {
            const value = this.resolveValue('string', logicNode.value)
            const varStore = this.getVariableStore(logicNode.varName)

            if (logicNode.mode === 'init') {
              if (!varStore.has(logicNode.varName)) {
                varStore.set(logicNode.varName, { type: logicNode.valueType, value })
              }
            } else {
              varStore.set(logicNode.varName, { type: logicNode.valueType, value })
            }
            return edges.map((edge) => edge.to)
          }

          const value = this.resolveValue(logicNode.valueType, logicNode.value)
          const varStore = this.getVariableStore(logicNode.varName)

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
        const left = Number(this.resolveValue('number', logicNode.left))
        const right = Number(this.resolveValue('number', logicNode.right))
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
          const varStore = this.getVariableStore(logicNode.assignTo)
          varStore.set(logicNode.assignTo, { type: 'number', value: result })
        }
        return edges.map((edge) => edge.to)
      }
      case 'conditional': {
        const left = Number(this.resolveValue('number', logicNode.left))
        const right = Number(this.resolveValue('number', logicNode.right))
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

  private getVariableStore(varName: string): Map<string, VariableValue> {
    const definition = this.compiledCue.definition as AudioNodeCueDefinition
    const cueVariables = definition.variables ?? []
    const isCueLevel = cueVariables.some((v) => v.name === varName)

    return isCueLevel ? this.cueLevelVarStore : this.groupLevelVarStore
  }

  private resolveValue(
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

    // Check cue-level store first, then group-level
    const cueVar = this.cueLevelVarStore.get(source.name)
    const groupVar = this.groupLevelVarStore.get(source.name)
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

  private findFirstAction(eventId: string): { actionId: string; delay: number } | null {
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
        const nextTargets = this.evaluateLogicNode(logicNode, nodeId)
        const nextDelay = delay // logic does not add delay
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
