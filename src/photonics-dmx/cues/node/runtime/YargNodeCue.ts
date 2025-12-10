import { INetCue, CueStyle } from '../../interfaces/INetCue';
import { CueData, CueType } from '../../types/cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { calculateActionDuration, CompiledYargCue } from '../compiler/NodeCueCompiler';
import { ActionEffectFactory } from '../compiler/ActionEffectFactory';
import { LogicNode, ValueSource, YargNodeCueDefinition } from '../../types/nodeCueTypes';
import { Effect } from '../../../types';

export class YargNodeCue implements INetCue {
  public readonly cueId: CueType;
  public readonly id: string;
  public readonly description?: string;
  public readonly style: CueStyle;

  private static cueLevelVarStores = new Map<string, Map<string, { type: 'number' | 'boolean' | 'string'; value: number | boolean | string }>>();
  private static groupLevelVarStores = new Map<string, Map<string, { type: 'number' | 'boolean' | 'string'; value: number | boolean | string }>>();
  private cueLevelVarStore: Map<string, { type: 'number' | 'boolean' | 'string'; value: number | boolean | string }>;
  private groupLevelVarStore: Map<string, { type: 'number' | 'boolean' | 'string'; value: number | boolean | string }>;
  private cueStartedFired = false;

  constructor(groupId: string, private readonly compiledCue: CompiledYargCue) {
    const definition = compiledCue.definition as YargNodeCueDefinition;
    this.cueId = definition.cueType;
    this.id = `${groupId}:${definition.id}`;
    this.description = definition.description;
    this.style = definition.style === 'secondary' ? CueStyle.Secondary : CueStyle.Primary;

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
    const effects = this.buildEffects(lightManager, parameters);
    for (const { name, effect } of effects) {
      sequencer.addEffect(name, effect);
    }
  }

  onStop(): void {
    this.cueLevelVarStore.clear();
    YargNodeCue.cueLevelVarStores.delete(this.id);
    
    // Clear group-level store when switching to a different group
    // (Note: In practice, this will be called when switching cues, 
    // so group variables persist within the same group)
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

    // Initialize group-level variables from the compiled cue's group metadata
    // (This will be set during compilation)
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

  private buildEffects(lightManager: DmxLightManager, parameters: CueData): { name: string; effect: Effect }[] {
    const results: { name: string; effect: Effect }[] = [];
    const { eventMap, adjacency } = this.compiledCue;
    const events = Array.from(eventMap.values());

    // Ensure cue-started executes before other events in the same execute call
    const sortedEvents = [
      ...events.filter(e => e.eventType === 'cue-started'),
      ...events.filter(e => e.eventType !== 'cue-started')
    ];

    for (const event of sortedEvents) {
      if (!this.isEventTriggered(event.eventType, parameters)) {
        continue;
      }
      const outgoing = adjacency.get(event.id) ?? [];
      for (const conn of outgoing) {
        const steps: { actionId: string; delay: number }[] = [];
        this.traverse(conn.to, 0, new Set(), steps);

        if (!steps.length) continue;

        const effect = this.composeEffect(steps, lightManager);
        if (effect) {
          const chainId = steps.map(step => step.actionId).join('>');
          results.push({ name: `${this.id}:${event.id}:${chainId}`, effect });
        }
      }
    }

    return results;
  }

  private isEventTriggered(eventType: string, parameters: CueData): boolean {
    if (eventType === 'cue-started') {
      if (this.cueStartedFired) return false;
      this.cueStartedFired = true;
      // Fresh run for this cue instance; clear cue-level variables
      this.cueLevelVarStore.clear();
      // Re-initialize cue-level variables
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
    // For other wait conditions, default to triggered so existing behavior remains
    return true;
  }

  private traverse(
    nodeId: string,
    delayMs: number,
    visited: Set<string>,
    steps: { actionId: string; delay: number }[]
  ): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const { actionMap, logicMap, adjacency } = this.compiledCue;

    if (actionMap.has(nodeId)) {
      steps.push({ actionId: nodeId, delay: delayMs });
      const nextDelay = delayMs + calculateActionDuration(actionMap.get(nodeId)!);
      const edges = adjacency.get(nodeId) ?? [];
      for (const edge of edges) {
        this.traverse(edge.to, nextDelay, new Set(visited), steps);
      }
      return;
    }

    const logicNode = logicMap.get(nodeId);
    if (logicNode) {
      const nextNodes = this.evaluateLogicNode(logicNode, nodeId);
      for (const targetId of nextNodes) {
        this.traverse(targetId, delayMs, new Set(visited), steps);
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
          // Determine which store to use based on variable definition
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
    // Check if variable is defined in cue-level registry
    const definition = this.compiledCue.definition as YargNodeCueDefinition;
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
    lightManager: DmxLightManager
  ): Effect | null {
    const { actionMap } = this.compiledCue;
    let combinedEffect: Effect | null = null;
    const seenLightIds = new Set<string>();

    for (const step of steps) {
      const action = actionMap.get(step.actionId);
      if (!action) continue;
      const lights = ActionEffectFactory.resolveLights(lightManager, action.target);
      if (!lights.length) continue;

      const effect = ActionEffectFactory.buildEffect({
        action,
        lights,
        waitCondition: undefined,
        waitTime: step.delay
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
    }

    return combinedEffect;
  }
}

