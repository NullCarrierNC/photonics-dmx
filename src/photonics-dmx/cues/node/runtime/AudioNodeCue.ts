import { IAudioCue } from '../../interfaces/IAudioCue';
import { AudioCueData, AudioCueType } from '../../types/audioCueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { calculateActionDuration, CompiledAudioCue } from '../compiler/NodeCueCompiler';
import { ActionEffectFactory } from '../compiler/ActionEffectFactory';
import { AudioEventNode, LogicNode, ValueSource, AudioNodeCueDefinition } from '../../types/nodeCueTypes';
import { Effect } from '../../../types';

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
  private static cueLevelVarStores = new Map<string, Map<string, { type: 'number' | 'boolean' | 'string'; value: number | boolean | string }>>();
  private static groupLevelVarStores = new Map<string, Map<string, { type: 'number' | 'boolean' | 'string'; value: number | boolean | string }>>();
  private cueLevelVarStore: Map<string, { type: 'number' | 'boolean' | 'string'; value: number | boolean | string }>;
  private groupLevelVarStore: Map<string, { type: 'number' | 'boolean' | 'string'; value: number | boolean | string }>;

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

    for (const event of this.compiledCue.eventMap.values()) {
      const state = this.getEventState(event.id);
      const evaluation = this.evaluateEvent(event, data, state);
      const effectKey = this.effectKey(event.id);

      if (evaluation.mode === 'edge') {
        if (!evaluation.triggered) continue;
        const effects = this.buildEdgeEffects(event.id, evaluation.intensity, lightManager);
        for (const { name, effect } of effects) {
          sequencer.addEffect(`${name}:${Date.now()}`, effect);
        }
      } else {
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
    this.eventStates.clear();
    this.activeLevelEffects.clear();
    this.cueLevelVarStore.clear();
    AudioNodeCue.cueLevelVarStores.delete(this.id);
  }

  onDestroy(): void {
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

    // Initialize group-level variables
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

  private buildEdgeEffects(eventId: string, intensity: number, lightManager: DmxLightManager): { name: string; effect: Effect }[] {
    const results: { name: string; effect: Effect }[] = [];
    const outgoing = this.compiledCue.adjacency.get(eventId) ?? [];

    for (const conn of outgoing) {
      const steps: { actionId: string; delay: number }[] = [];
      this.traverse(conn.to, 0, new Set(), steps, intensity);
      if (!steps.length) continue;

      const effect = this.composeEffect(steps, lightManager, intensity);
      if (effect) {
        const chainId = steps.map(step => step.actionId).join('>');
        results.push({ name: `${this.id}:${eventId}:${chainId}`, effect });
      }
    }

    return results;
  }

  private traverse(
    nodeId: string,
    delayMs: number,
    visited: Set<string>,
    steps: { actionId: string; delay: number }[],
    intensityScale: number
  ): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const { actionMap, logicMap, adjacency } = this.compiledCue;

    if (actionMap.has(nodeId)) {
      steps.push({ actionId: nodeId, delay: delayMs });
      const nextDelay = delayMs + calculateActionDuration(actionMap.get(nodeId)!);
      const edges = adjacency.get(nodeId) ?? [];
      for (const edge of edges) {
        this.traverse(edge.to, nextDelay, new Set(visited), steps, intensityScale);
      }
      return;
    }

    const logicNode = logicMap.get(nodeId);
    if (logicNode) {
      const nextNodes = this.evaluateLogicNode(logicNode, nodeId);
      for (const targetId of nextNodes) {
        this.traverse(targetId, delayMs, new Set(visited), steps, intensityScale);
      }
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

  private getVariableStore(varName: string): Map<string, { type: 'number' | 'boolean' | 'string'; value: number | boolean | string }> {
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

  private composeEffect(
    steps: { actionId: string; delay: number }[],
    lightManager: DmxLightManager,
    intensityScale: number
  ): Effect | null {
    const { actionMap } = this.compiledCue;
    let combinedEffect: Effect | null = null;
    let lastScheduledDelay = 0;
    const seenLightIds = new Set<string>();

    for (const step of steps) {
      const action = actionMap.get(step.actionId);
      if (!action) continue;
      const lights = ActionEffectFactory.resolveLights(lightManager, action.target);
      if (!lights.length) continue;

      const isFirstEffect = combinedEffect === null;
      const waitCondition = isFirstEffect ? 'none' : 'delay';
      const waitTime = isFirstEffect ? step.delay : Math.max(0, step.delay - lastScheduledDelay);

      const effect = ActionEffectFactory.buildEffect({
        action,
        lights,
        waitCondition,
        waitTime,
        intensityScale
      });

      if (!effect) continue;

      if (!combinedEffect) {
        combinedEffect = {
          ...effect,
          transitions: [...effect.transitions]
        };
        // Track which lights were in the first action
        lights.forEach(light => seenLightIds.add(light.id));
      } else {
        // For subsequent actions, we need to adjust waitForTime for lights that
        // were already targeted by previous actions, but keep the absolute wait
        // time for lights that are NEW in this action.
        const adjustedTransitions = effect.transitions.map(t => {
          const lightId = t.lights[0]?.id;
          if (lightId && seenLightIds.has(lightId)) {
            // This light was in a previous action, so reset wait time to make
            // this transition start immediately after the previous one completes
            return {
              ...t,
              waitForCondition: 'none' as const,
              waitForTime: 0
            };
          } else {
            // This is a new light not seen before, keep its absolute wait time
            if (lightId) seenLightIds.add(lightId);
            return t;
          }
        });
        combinedEffect.transitions.push(...adjustedTransitions);
      }

      lastScheduledDelay = step.delay;
    }

    return combinedEffect;
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

