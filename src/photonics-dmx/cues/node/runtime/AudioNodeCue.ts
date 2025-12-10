import { IAudioCue } from '../../interfaces/IAudioCue';
import { AudioCueData, AudioCueType } from '../../types/audioCueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { calculateActionDuration, CompiledAudioCue } from '../compiler/NodeCueCompiler';
import { ActionEffectFactory } from '../compiler/ActionEffectFactory';
import { AudioEventNode, LogicNode, ValueSource, AudioNodeCueDefinition } from '../../types/nodeCueTypes';
import { NodeExecutionEngine } from './NodeExecutionEngine';
import { VariableValue } from './executionTypes';
import { EffectRegistry } from './EffectRegistry';

interface AudioEventState {
  previousValue: number;
  active: boolean;
}

interface EdgeEvaluation {
  mode: 'edge';
  triggered: boolean;
  intensity: number;
}

interface LevelEvaluation {
  mode: 'level';
  active: boolean;
  intensity: number;
}

type AudioEventEvaluation = EdgeEvaluation | LevelEvaluation;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export class AudioNodeCue implements IAudioCue {
  public readonly id: string;
  public readonly cueType: AudioCueType;
  public readonly description: string;

  private readonly eventStates = new Map<string, AudioEventState>();
  private readonly activeLevelEffects = new Map<string, number>();
  private static cueLevelVarStores = new Map<string, Map<string, VariableValue>>();
  private static groupLevelVarStores = new Map<string, Map<string, VariableValue>>();
  private cueLevelVarStore: Map<string, VariableValue>;
  private groupLevelVarStore: Map<string, VariableValue>;
  private executionEngine?: NodeExecutionEngine;

  constructor(groupId: string, private readonly compiledCue: CompiledAudioCue) {
    const definition = compiledCue.definition as AudioNodeCueDefinition;
    this.id = `${groupId}:${definition.id}`;
    this.cueType = definition.cueTypeId;
    this.description = definition.description || definition.name || 'Node-based audio cue';

    // Initialize cue-level variable store
    const existingCueStore = AudioNodeCue.cueLevelVarStores.get(this.id);
    if (existingCueStore) {
      this.cueLevelVarStore = existingCueStore;
    } else {
      this.cueLevelVarStore = new Map();
      AudioNodeCue.cueLevelVarStores.set(this.id, this.cueLevelVarStore);
    }

    // Initialize group-level variable store
    const existingGroupStore = AudioNodeCue.groupLevelVarStores.get(groupId);
    if (existingGroupStore) {
      this.groupLevelVarStore = existingGroupStore;
    } else {
      this.groupLevelVarStore = new Map();
      AudioNodeCue.groupLevelVarStores.set(groupId, this.groupLevelVarStore);
    }

    // Initialize variables from registry definitions
    this.initializeVariables();
  }

  async execute(data: AudioCueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    // Initialize execution engine if not already created
    if (!this.executionEngine) {
      const definition = this.compiledCue.definition as AudioNodeCueDefinition;
      const variableDefinitions = definition.variables ?? [];
      
      // TODO: Load effect registry based on cue's effect references
      // For now, use empty registry - effects will be gracefully skipped
      const effectRegistry = new EffectRegistry();
      
      this.executionEngine = new NodeExecutionEngine(
        this.compiledCue,
        this.id,
        sequencer,
        lightManager,
        this.cueLevelVarStore,
        this.groupLevelVarStore,
        effectRegistry,
        variableDefinitions
      );
    }

    for (const event of this.compiledCue.eventMap.values()) {
      const state = this.getEventState(event.id);
      const evaluation = this.evaluateEvent(event, data, state);
      const effectKey = this.effectKey(event.id);

      if (evaluation.mode === 'edge') {
        if (!evaluation.triggered) continue;
        
        // Use execution engine for edge-triggered events
        const cueData = { ...data } as any;
        this.executionEngine.startExecution(event, cueData);
      } else {
        // Level-triggered events use continuous state management
        const actionStep = this.findFirstAction(event.id);
        if (!actionStep) {
          continue;
        }

        const action = this.compiledCue.actionMap.get(actionStep.actionId);
        if (!action) continue;
        const lights = ActionEffectFactory.resolveLights(lightManager, action.target);
        if (!lights.length) continue;

        if (evaluation.active) {
          const effect = ActionEffectFactory.buildEffect({
            action,
            lights,
            waitCondition: 'none',
            intensityScale: evaluation.intensity
          });

          if (effect) {
            tasks.push(sequencer.setEffect(effectKey, effect));
            this.activeLevelEffects.set(effectKey, action.layer ?? 0);
          }
        } else if (this.activeLevelEffects.has(effectKey)) {
          sequencer.removeEffect(effectKey, action.layer ?? 0);
          this.activeLevelEffects.delete(effectKey);
        }
      }
    }

    if (tasks.length) {
      await Promise.allSettled(tasks);
    }
  }

  onStop(): void {
    if (this.executionEngine) {
      this.executionEngine.cancelAll();
    }

    this.eventStates.clear();
    this.activeLevelEffects.clear();
    this.cueLevelVarStore.clear();
    AudioNodeCue.cueLevelVarStores.delete(this.id);
  }

  onDestroy(): void {
    if (this.executionEngine) {
      this.executionEngine.cancelAll();
    }

    this.eventStates.clear();
    this.activeLevelEffects.clear();
    this.cueLevelVarStore.clear();
    AudioNodeCue.cueLevelVarStores.delete(this.id);
  }

  private initializeVariables(): void {
    const definition = this.compiledCue.definition as AudioNodeCueDefinition;
    
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

  private getEventState(eventId: string): AudioEventState {
    if (!this.eventStates.has(eventId)) {
      this.eventStates.set(eventId, { previousValue: 0, active: false });
    }
    return this.eventStates.get(eventId)!;
  }

  private evaluateEvent(event: AudioEventNode, data: AudioCueData, state: AudioEventState): AudioEventEvaluation {
    const threshold = clamp(event.threshold ?? 0.5, 0, 1);
    const currentValue = clamp(this.getEventValue(event.eventType, data), 0, 1);

    if (event.triggerMode === 'edge') {
      const triggered = state.previousValue < threshold && currentValue >= threshold;
      state.previousValue = currentValue;
      state.active = triggered;
      return {
        mode: 'edge',
        triggered,
        intensity: currentValue
      };
    }

    const isActive = currentValue >= threshold;
    const normalizedRange = threshold >= 1 ? 1 : (currentValue - threshold) / (1 - threshold);
    const intensity = isActive ? clamp(normalizedRange, 0.05, 1) : 0;
    state.previousValue = currentValue;
    state.active = isActive;

    return {
      mode: 'level',
      active: isActive,
      intensity
    };
  }

  private getEventValue(eventType: AudioEventNode['eventType'], data: AudioCueData): number {
    const { audioData } = data;
    switch (eventType) {
      case 'audio-beat':
        return audioData.beatDetected ? 1 : 0;
      case 'audio-energy':
        return clamp(audioData.energy ?? 0, 0, 1);
      case 'audio-range1':
        return clamp(audioData.frequencyBands.range1 ?? 0, 0, 1);
      case 'audio-range2':
        return clamp(audioData.frequencyBands.range2 ?? 0, 0, 1);
      case 'audio-range3':
        return clamp(audioData.frequencyBands.range3 ?? 0, 0, 1);
      case 'audio-range4':
        return clamp(audioData.frequencyBands.range4 ?? 0, 0, 1);
      case 'audio-range5':
        return clamp(audioData.frequencyBands.range5 ?? 0, 0, 1);
      default:
        return 0;
    }
  }

  private evaluateLogicNode(logicNode: LogicNode, nodeId: string): string[] {
    const { adjacency } = this.compiledCue;
    const edges = adjacency.get(nodeId) ?? [];

    switch (logicNode.logicType) {
      case 'variable': {
        if (logicNode.mode !== 'get') {
          const value = this.resolveValue(logicNode.valueType, logicNode.value);
          const varStore = this.getVariableStore(logicNode.varName);
          
          if (logicNode.mode === 'init') {
            if (!varStore.has(logicNode.varName)) {
              varStore.set(logicNode.varName, { type: logicNode.valueType, value });
            }
          } else {
            varStore.set(logicNode.varName, { type: logicNode.valueType, value });
          }
        }
        return edges.map(edge => edge.to);
      }
      case 'math': {
        const left = Number(this.resolveValue('number', logicNode.left));
        const right = Number(this.resolveValue('number', logicNode.right));
        let result = 0;
        switch (logicNode.operator) {
          case 'add':
            result = left + right;
            break;
          case 'subtract':
            result = left - right;
            break;
          case 'multiply':
            result = left * right;
            break;
          case 'divide':
            result = right === 0 ? 0 : left / right;
            break;
          case 'modulus':
            result = right === 0 ? 0 : left % right;
            break;
        }
        if (logicNode.assignTo) {
          const varStore = this.getVariableStore(logicNode.assignTo);
          varStore.set(logicNode.assignTo, { type: 'number', value: result });
        }
        return edges.map(edge => edge.to);
      }
      case 'conditional': {
        const left = Number(this.resolveValue('number', logicNode.left));
        const right = Number(this.resolveValue('number', logicNode.right));
        let outcome = false;
        switch (logicNode.comparator) {
          case '>':
            outcome = left > right;
            break;
          case '>=':
            outcome = left >= right;
            break;
          case '<':
            outcome = left < right;
            break;
          case '<=':
            outcome = left <= right;
            break;
          case '==':
            outcome = left === right;
            break;
          case '!=':
            outcome = left !== right;
            break;
        }
        const branch = outcome ? 'true' : 'false';
        const targeted = edges.filter(edge => edge.fromPort === branch);
        if (targeted.length > 0) {
          return targeted.map(edge => edge.to);
        }
        return edges.map(edge => edge.to);
      }
    }

    return edges.map(edge => edge.to);
  }

  private getVariableStore(varName: string): Map<string, VariableValue> {
    const definition = this.compiledCue.definition as AudioNodeCueDefinition;
    const cueVariables = definition.variables ?? [];
    const isCueLevel = cueVariables.some(v => v.name === varName);
    
    return isCueLevel ? this.cueLevelVarStore : this.groupLevelVarStore;
  }

  private resolveValue(expectedType: 'number' | 'boolean' | 'string', source?: ValueSource): number | boolean | string {
    if (!source) {
      return expectedType === 'number' ? 0 : expectedType === 'boolean' ? false : '';
    }

    if (source.source === 'literal') {
      if (expectedType === 'string') {
        return String(source.value);
      }
      if (expectedType === 'number') {
        if (typeof source.value === 'boolean') {
          return source.value ? 1 : 0;
        }
        if (typeof source.value === 'string') {
          const parsed = parseFloat(source.value);
          return isNaN(parsed) ? 0 : parsed;
        }
        return typeof source.value === 'number' ? source.value : 0;
      }
      return source.value === true || source.value === 'true';
    }

    // Check cue-level store first, then group-level
    const cueVar = this.cueLevelVarStore.get(source.name);
    const groupVar = this.groupLevelVarStore.get(source.name);
    const existing = cueVar ?? groupVar;
    
    if (existing) {
      if (expectedType === 'string') {
        return String(existing.value);
      }
      if (expectedType === 'number') {
        if (typeof existing.value === 'string') {
          const parsed = parseFloat(existing.value);
          return isNaN(parsed) ? 0 : parsed;
        }
        return typeof existing.value === 'number' ? existing.value : (existing.value ? 1 : 0);
      }
      return existing.value === true || existing.value === 'true';
    }

    // Use fallback
    if (expectedType === 'string') {
      return source.fallback !== undefined ? String(source.fallback) : '';
    }
    if (expectedType === 'number') {
      if (typeof source.fallback === 'number') return source.fallback;
      if (typeof source.fallback === 'boolean') return source.fallback ? 1 : 0;
      if (typeof source.fallback === 'string') {
        const parsed = parseFloat(source.fallback);
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    }

    return source.fallback === true || source.fallback === 'true';
  }

  private findFirstAction(eventId: string): { actionId: string; delay: number } | null {
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; delay: number }> = [];
    const outgoing = this.compiledCue.adjacency.get(eventId) ?? [];
    outgoing.forEach(conn => queue.push({ nodeId: conn.to, delay: 0 }));

    while (queue.length) {
      const { nodeId, delay } = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      if (this.compiledCue.actionMap.has(nodeId)) {
        return { actionId: nodeId, delay };
      }

      const logicNode = this.compiledCue.logicMap.get(nodeId);
      if (logicNode) {
        const nextTargets = this.evaluateLogicNode(logicNode, nodeId);
        const nextDelay = delay; // logic does not add delay
        nextTargets.forEach(nextId => queue.push({ nodeId: nextId, delay: nextDelay }));
        continue;
      }

      const nextEdges = this.compiledCue.adjacency.get(nodeId) ?? [];
      nextEdges.forEach(edge => queue.push({
        nodeId: edge.to,
        delay: delay + (this.compiledCue.actionMap.has(nodeId) ? calculateActionDuration(this.compiledCue.actionMap.get(nodeId)!) : 0)
      }));
    }

    return null;
  }

  private effectKey(eventId: string): string {
    return `${this.id}:${eventId}`;
  }
}

