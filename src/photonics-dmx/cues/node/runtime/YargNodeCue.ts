import { INetCue, CueStyle } from '../../interfaces/INetCue';
import { CueData, CueType, InstrumentNoteType, DrumNoteType } from '../../types/cueTypes';
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
    
    // Guitar events
    if (eventType === 'guitar-open') return parameters.guitarNotes.includes(InstrumentNoteType.Open);
    if (eventType === 'guitar-green') return parameters.guitarNotes.includes(InstrumentNoteType.Green);
    if (eventType === 'guitar-red') return parameters.guitarNotes.includes(InstrumentNoteType.Red);
    if (eventType === 'guitar-yellow') return parameters.guitarNotes.includes(InstrumentNoteType.Yellow);
    if (eventType === 'guitar-blue') return parameters.guitarNotes.includes(InstrumentNoteType.Blue);
    if (eventType === 'guitar-orange') return parameters.guitarNotes.includes(InstrumentNoteType.Orange);
    
    // Bass events
    if (eventType === 'bass-open') return parameters.bassNotes.includes(InstrumentNoteType.Open);
    if (eventType === 'bass-green') return parameters.bassNotes.includes(InstrumentNoteType.Green);
    if (eventType === 'bass-red') return parameters.bassNotes.includes(InstrumentNoteType.Red);
    if (eventType === 'bass-yellow') return parameters.bassNotes.includes(InstrumentNoteType.Yellow);
    if (eventType === 'bass-blue') return parameters.bassNotes.includes(InstrumentNoteType.Blue);
    if (eventType === 'bass-orange') return parameters.bassNotes.includes(InstrumentNoteType.Orange);
    
    // Keys events
    if (eventType === 'keys-open') return parameters.keysNotes.includes(InstrumentNoteType.Open);
    if (eventType === 'keys-green') return parameters.keysNotes.includes(InstrumentNoteType.Green);
    if (eventType === 'keys-red') return parameters.keysNotes.includes(InstrumentNoteType.Red);
    if (eventType === 'keys-yellow') return parameters.keysNotes.includes(InstrumentNoteType.Yellow);
    if (eventType === 'keys-blue') return parameters.keysNotes.includes(InstrumentNoteType.Blue);
    if (eventType === 'keys-orange') return parameters.keysNotes.includes(InstrumentNoteType.Orange);
    
    // Drum events
    if (eventType === 'drum-kick') return parameters.drumNotes.includes(DrumNoteType.Kick);
    if (eventType === 'drum-red') return parameters.drumNotes.includes(DrumNoteType.RedDrum);
    if (eventType === 'drum-yellow') return parameters.drumNotes.includes(DrumNoteType.YellowDrum);
    if (eventType === 'drum-blue') return parameters.drumNotes.includes(DrumNoteType.BlueDrum);
    if (eventType === 'drum-green') return parameters.drumNotes.includes(DrumNoteType.GreenDrum);
    if (eventType === 'drum-yellow-cymbal') return parameters.drumNotes.includes(DrumNoteType.YellowCymbal);
    if (eventType === 'drum-blue-cymbal') return parameters.drumNotes.includes(DrumNoteType.BlueCymbal);
    if (eventType === 'drum-green-cymbal') return parameters.drumNotes.includes(DrumNoteType.GreenCymbal);
    
    return false; // Unknown event type
  }
}

