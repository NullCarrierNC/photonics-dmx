import { INetCue, CueStyle } from '../../interfaces/INetCue';
import { CueData, CueType, isInstrumentEventTriggered } from '../../types/cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { CompiledYargCue } from '../compiler/NodeCueCompiler';
import { YargNodeCueDefinition, YargEventNode } from '../../types/nodeCueTypes';
import { NodeExecutionEngine } from './NodeExecutionEngine';
import { VariableValue } from './executionTypes';
import { EffectRegistry } from './EffectRegistry';

export class YargNodeCue implements INetCue {
  public readonly cueId: CueType;
  public readonly id: string;
  public readonly description?: string;
  public readonly style: CueStyle;

  private static cueLevelVarStores = new Map<string, Map<string, VariableValue>>();
  private static groupLevelVarStores = new Map<string, Map<string, VariableValue>>();
  private cueLevelVarStore: Map<string, VariableValue>;
  private groupLevelVarStore: Map<string, VariableValue>;
  private cueStartedFired = false;
  private executionEngine?: NodeExecutionEngine;
  private effectRegistry: EffectRegistry;

  constructor(groupId: string, private readonly compiledCue: CompiledYargCue, effectRegistry?: EffectRegistry) {
    const definition = compiledCue.definition as YargNodeCueDefinition;
    this.cueId = definition.cueType;
    this.id = `${groupId}:${definition.id}`;
    this.description = definition.description;
    this.style = definition.style === 'secondary' ? CueStyle.Secondary : CueStyle.Primary;
    this.effectRegistry = effectRegistry ?? new EffectRegistry();

    // Initialize cue-level variable store
    const existingCueStore = YargNodeCue.cueLevelVarStores.get(this.id);
    if (existingCueStore) {
      this.cueLevelVarStore = existingCueStore;
    } else {
      this.cueLevelVarStore = new Map();
      YargNodeCue.cueLevelVarStores.set(this.id, this.cueLevelVarStore);
    }

    // Initialize group-level variable store
    const existingGroupStore = YargNodeCue.groupLevelVarStores.get(groupId);
    if (existingGroupStore) {
      this.groupLevelVarStore = existingGroupStore;
    } else {
      this.groupLevelVarStore = new Map();
      YargNodeCue.groupLevelVarStores.set(groupId, this.groupLevelVarStore);
    }

    // Initialize variables from registry definitions
    this.initializeVariables();
  }

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    // Initialize execution engine if not already created
    if (!this.executionEngine) {
      const definition = this.compiledCue.definition as YargNodeCueDefinition;
      const variableDefinitions = definition.variables ?? [];
      
      this.executionEngine = new NodeExecutionEngine(
        this.compiledCue,
        this.id,
        sequencer,
        lightManager,
        this.cueLevelVarStore,
        this.groupLevelVarStore,
        this.effectRegistry,
        variableDefinitions
      );
    }

    // Get triggered events and start execution for each
    const events = this.getTriggeredEvents(parameters);
    for (const event of events) {
      this.executionEngine.startExecution(event, parameters);
    }
  }

  private getTriggeredEvents(parameters: CueData): YargEventNode[] {
    const events: YargEventNode[] = [];
    const { eventMap } = this.compiledCue;
    
    // Ensure cue-started executes before other events
    const sortedEvents = [
      ...Array.from(eventMap.values()).filter(e => e.eventType === 'cue-started'),
      ...Array.from(eventMap.values()).filter(e => e.eventType !== 'cue-started')
    ];
    
    for (const event of sortedEvents) {
      if (this.isEventTriggered(event.eventType, parameters)) {
        events.push(event);
      }
    }
    
    return events;
  }

  onStop(): void {
    if (this.executionEngine) {
      this.executionEngine.cancelAll();
    }

    this.cueLevelVarStore.clear();
    YargNodeCue.cueLevelVarStores.delete(this.id);
    this.cueStartedFired = false;
  }

  private initializeVariables(): void {
    const definition = this.compiledCue.definition as YargNodeCueDefinition;
    
    // Initialize cue-level variables
    const cueVariables = definition.variables ?? [];
    for (const varDef of cueVariables) {
      if (!this.cueLevelVarStore.has(varDef.name)) {
        this.cueLevelVarStore.set(varDef.name, {
          type: varDef.type,
          value: varDef.initialValue
        });
      }
    }

    // Initialize group-level variables from compiled cue metadata
    const groupVariables = (this.compiledCue as any).groupVariables ?? [];
    for (const varDef of groupVariables) {
      if (!this.groupLevelVarStore.has(varDef.name)) {
        this.groupLevelVarStore.set(varDef.name, {
          type: varDef.type,
          value: varDef.initialValue
        });
      }
    }
  }

  private isEventTriggered(eventType: string, parameters: CueData): boolean {
    if (eventType === 'cue-started') {
      if (this.cueStartedFired) return false;
      this.cueStartedFired = true;
      
      // Reset cue-level variables to their initial values
      this.cueLevelVarStore.clear();
      const definition = this.compiledCue.definition as YargNodeCueDefinition;
      const cueVariables = definition.variables ?? [];
      for (const varDef of cueVariables) {
        this.cueLevelVarStore.set(varDef.name, {
          type: varDef.type,
          value: varDef.initialValue
        });
      }
      return true;
    }
    
    if (eventType === 'measure') {
      return parameters.beat === 'Measure';
    }
    if (eventType === 'beat') {
      return parameters.beat === 'Strong' || parameters.beat === 'Weak' || parameters.beat === 'Measure';
    }
    if (eventType === 'half-beat') {
      return parameters.beat === 'Strong' || parameters.beat === 'Weak';
    }
    if (eventType === 'keyframe') {
      return true; // Keyframe events are always active when present
    }
    
    // Check instrument events using the shared mapping function
    const instrumentResult = isInstrumentEventTriggered(
      eventType,
      parameters.guitarNotes,
      parameters.bassNotes,
      parameters.keysNotes,
      parameters.drumNotes
    );
    if (instrumentResult !== null) {
      return instrumentResult;
    }
    
    return false; // Unknown event type
  }
}

