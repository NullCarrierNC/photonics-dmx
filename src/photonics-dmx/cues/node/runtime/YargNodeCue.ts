import { INetCue, CueStyle } from '../../interfaces/INetCue'
import { CueData, CueType, isInstrumentEventTriggered } from '../../types/cueTypes'
import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CompiledYargCue } from '../compiler/NodeCueCompiler'
import { YargNodeCueDefinition, YargEventNode } from '../../types/nodeCueTypes'
import { NodeExecutionEngine } from './NodeExecutionEngine'
import { VariableValue } from './executionTypes'
import { EffectRegistry } from './EffectRegistry'

export class YargNodeCue implements INetCue {
  public readonly cueId: CueType
  public readonly id: string
  public readonly description?: string
  public readonly style: CueStyle

  private static cueLevelVarStores = new Map<string, Map<string, VariableValue>>()
  private static groupLevelVarStores = new Map<string, Map<string, VariableValue>>()
  private readonly groupId: string
  private cueLevelVarStore: Map<string, VariableValue>
  private groupLevelVarStore: Map<string, VariableValue>
  private cueStartedFired = false
  private executionEngine?: NodeExecutionEngine
  private effectRegistry: EffectRegistry

  // Cue queuing state
  private isExecutingCueStarted = false
  private queuedParameters: CueData[] = []

  // First run of Primary cue: first effect submission uses setEffect to clear state
  private firstSubmissionUsesSetEffectRef = { use: false }
  private clearedForThisActivation = false

  constructor(
    groupId: string,
    private readonly compiledCue: CompiledYargCue,
    effectRegistry?: EffectRegistry,
  ) {
    this.groupId = groupId
    const definition = compiledCue.definition as YargNodeCueDefinition
    this.cueId = definition.cueType
    this.id = `${groupId}:${definition.id}`
    this.description = definition.description
    this.style = definition.style === 'secondary' ? CueStyle.Secondary : CueStyle.Primary
    this.effectRegistry = effectRegistry ?? new EffectRegistry()

    // Initialize cue-level variable store
    const existingCueStore = YargNodeCue.cueLevelVarStores.get(this.id)
    if (existingCueStore) {
      this.cueLevelVarStore = existingCueStore
    } else {
      this.cueLevelVarStore = new Map()
      YargNodeCue.cueLevelVarStores.set(this.id, this.cueLevelVarStore)
    }

    // Initialize group-level variable store
    const existingGroupStore = YargNodeCue.groupLevelVarStores.get(groupId)
    if (existingGroupStore) {
      this.groupLevelVarStore = existingGroupStore
    } else {
      this.groupLevelVarStore = new Map()
      YargNodeCue.groupLevelVarStores.set(groupId, this.groupLevelVarStore)
    }

    // Initialize variables from registry definitions
    this.initializeVariables()
  }

  async execute(
    parameters: CueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): Promise<void> {
    // Initialize execution engine if not already created
    if (!this.executionEngine) {
      const definition = this.compiledCue.definition as YargNodeCueDefinition
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
        this.firstSubmissionUsesSetEffectRef,
      )
    }

    // Get triggered events and start execution for each
    const events = this.getTriggeredEvents(parameters)

    // Check if we have cue-started or cue-called events (queued events)
    const hasCueEvent = events.some(
      (e) => e.eventType === 'cue-started' || e.eventType === 'cue-called',
    )

    if (hasCueEvent && this.isExecutingCueStarted) {
      // Queue this call if a cue-started/cue-called execution is already in progress
      this.queuedParameters.push(parameters)
      return
    }

    // Mark as executing if we have cue events
    if (hasCueEvent) {
      this.isExecutingCueStarted = true
    }

    // Split events by type so we can guarantee initialization ordering.
    // Important: cue-started must complete BEFORE cue-called runs, otherwise cue-called may
    // read uninitialized variables (e.g., targetLight) and actions will silently target no lights.
    const cueStartedEvents = events.filter((e) => e.eventType === 'cue-started')
    const cueCalledEvents = events.filter((e) => e.eventType === 'cue-called')
    const otherEvents = events.filter(
      (e) => e.eventType !== 'cue-started' && e.eventType !== 'cue-called',
    )

    // Fire non-cue events immediately; they don't participate in the cue lifecycle queue.
    for (const event of otherEvents) {
      this.executionEngine.startExecution(event, parameters)
    }

    // Primary cue: first run of this activation uses setEffect (clear then add) for layer 0.
    if (hasCueEvent && this.style === CueStyle.Primary && !this.clearedForThisActivation) {
      this.firstSubmissionUsesSetEffectRef.use = true
      this.clearedForThisActivation = true
    }

    // If cue-started is present on this call, run it first, then run cue-called after it completes.
    if (cueStartedEvents.length > 0) {
      // There should typically be only one cue-started event node, but support multiple defensively.
      // Run them sequentially (in order) before cue-called.
      const runCueStartedAtIndex = (idx: number) => {
        const ev = cueStartedEvents[idx]
        this.executionEngine!.startExecutionWithCallback(ev, parameters, () => {
          const nextIdx = idx + 1
          if (nextIdx < cueStartedEvents.length) {
            runCueStartedAtIndex(nextIdx)
            return
          }

          // Now that initialization has completed, run cue-called events.
          if (cueCalledEvents.length > 0) {
            // Run cue-called events; when the LAST one completes, advance the queued cue call.
            let remaining = cueCalledEvents.length
            for (const calledEv of cueCalledEvents) {
              this.executionEngine!.startExecutionWithCallback(calledEv, parameters, () => {
                remaining -= 1
                if (remaining === 0) {
                  this.onCueEventComplete(sequencer, lightManager)
                }
              })
            }
          } else {
            // No cue-called events; initialization completion ends this lifecycle execution.
            this.onCueEventComplete(sequencer, lightManager)
          }
        })
      }

      runCueStartedAtIndex(0)
      return
    }

    // No cue-started on this call; run cue-called events immediately.
    if (cueCalledEvents.length > 0) {
      let remaining = cueCalledEvents.length
      for (const calledEv of cueCalledEvents) {
        this.executionEngine.startExecutionWithCallback(calledEv, parameters, () => {
          remaining -= 1
          if (remaining === 0) {
            this.onCueEventComplete(sequencer, lightManager)
          }
        })
      }
      return
    }

    // If we got here, there were no cue lifecycle events. Clear executing state.
    this.isExecutingCueStarted = false
  }

  /**
   * Called when a cue-started or cue-called execution completes.
   * Processes the next item in the queue if any.
   */
  private onCueEventComplete(sequencer: ILightingController, lightManager: DmxLightManager): void {
    if (this.queuedParameters.length > 0) {
      const nextParams = this.queuedParameters.shift()!
      // We are no longer executing the previous cue lifecycle run, so allow the dequeued call
      // to actually start. If we don't clear this flag here, execute() will immediately re-queue
      // the dequeued call and we will never progress beyond the first iteration.
      this.isExecutingCueStarted = false
      // Re-execute with queued parameters (will get cue-called event since cue-started already fired)
      this.execute(nextParams, sequencer, lightManager)
    } else {
      this.isExecutingCueStarted = false
    }
  }

  private getTriggeredEvents(parameters: CueData): YargEventNode[] {
    const events: YargEventNode[] = []
    const { eventMap } = this.compiledCue

    // Ensure cue-started executes before other events
    const sortedEvents = [
      ...Array.from(eventMap.values()).filter((e) => e.eventType === 'cue-started'),
      ...Array.from(eventMap.values()).filter((e) => e.eventType !== 'cue-started'),
    ]

    for (const event of sortedEvents) {
      if (this.isEventTriggered(event.eventType, parameters)) {
        events.push(event)
      }
    }

    return events
  }

  onStop(): void {
    if (this.executionEngine) {
      // Primary cues: leave effects on the sequencer so the next cue's setEffect can
      // transition from them instead of from black. Secondary cues: remove effects
      // immediately since no subsequent setEffect will clean them up.
      const skipEffectRemoval = this.style === CueStyle.Primary
      this.executionEngine.cancelAll(skipEffectRemoval)
      this.executionEngine = undefined
    }

    this.cueLevelVarStore.clear()
    YargNodeCue.cueLevelVarStores.delete(this.id)
    YargNodeCue.groupLevelVarStores.delete(this.groupId)
    this.cueStartedFired = false

    // Reset queuing state
    this.isExecutingCueStarted = false
    this.queuedParameters = []

    // Next time this cue runs (Primary), first submission will use setEffect again
    this.firstSubmissionUsesSetEffectRef.use = false
    this.clearedForThisActivation = false
  }

  private initializeVariables(): void {
    const definition = this.compiledCue.definition as YargNodeCueDefinition

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

  private isEventTriggered(eventType: string, parameters: CueData): boolean {
    if (eventType === 'cue-started') {
      if (this.cueStartedFired) return false
      this.cueStartedFired = true

      // Reset cue-level variables to their initial values
      this.cueLevelVarStore.clear()
      const definition = this.compiledCue.definition as YargNodeCueDefinition
      const cueVariables = definition.variables ?? []
      for (const varDef of cueVariables) {
        this.cueLevelVarStore.set(varDef.name, {
          type: varDef.type,
          value: varDef.initialValue,
        })
      }
      return true
    }

    // cue-called fires every YARG call (for repeated work)
    if (eventType === 'cue-called') {
      return true
    }

    if (eventType === 'measure') {
      return parameters.beat === 'Measure'
    }
    if (eventType === 'beat') {
      return (
        parameters.beat === 'Strong' || parameters.beat === 'Weak' || parameters.beat === 'Measure'
      )
    }
    if (eventType === 'half-beat') {
      return parameters.beat === 'Strong' || parameters.beat === 'Weak'
    }
    if (eventType === 'keyframe') {
      return (
        parameters.keyframe === 'First' ||
        parameters.keyframe === 'Next' ||
        parameters.keyframe === 'Previous'
      )
    }

    // Check instrument events using the shared mapping function
    const instrumentResult = isInstrumentEventTriggered(
      eventType,
      parameters.guitarNotes,
      parameters.bassNotes,
      parameters.keysNotes,
      parameters.drumNotes,
    )
    if (instrumentResult !== null) {
      return instrumentResult
    }

    return false // Unknown event type
  }
}
