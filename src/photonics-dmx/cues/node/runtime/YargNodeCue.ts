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

  private static globalVarStores = new Map<string, Map<string, { type: 'number' | 'boolean'; value: number | boolean }>>();
  private variableStore: Map<string, { type: 'number' | 'boolean'; value: number | boolean }>;
  private cueStartedFired = false;

  constructor(groupId: string, private readonly compiledCue: CompiledYargCue) {
    const definition = compiledCue.definition as YargNodeCueDefinition;
    this.cueId = definition.cueType;
    this.id = `${groupId}:${definition.id}`;
    this.description = definition.description;
    this.style = definition.style === 'secondary' ? CueStyle.Secondary : CueStyle.Primary;

    // Persist variables across execute calls for this cue instance
    const existingStore = YargNodeCue.globalVarStores.get(this.id);
    if (existingStore) {
      this.variableStore = existingStore;
    } else {
      this.variableStore = new Map();
      YargNodeCue.globalVarStores.set(this.id, this.variableStore);
    }
  }

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const effects = this.buildEffects(lightManager, parameters);
    for (const { name, effect } of effects) {
      sequencer.addEffect(name, effect);
    }
  }

  onStop(): void {
    this.variableStore.clear();
    YargNodeCue.globalVarStores.delete(this.id);
    this.cueStartedFired = false;
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
      // Fresh run for this cue instance; clear prior variable values
      this.variableStore.clear();
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
          if (logicNode.mode === 'init') {
            if (!this.variableStore.has(logicNode.varName)) {
              this.variableStore.set(logicNode.varName, { type: logicNode.valueType, value });
            }
          } else {
            this.variableStore.set(logicNode.varName, { type: logicNode.valueType, value });
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
          this.variableStore.set(logicNode.assignTo, { type: 'number', value: result });
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

  private resolveValue(expectedType: 'number' | 'boolean', source?: ValueSource): number | boolean {
    if (!source) {
      return expectedType === 'number' ? 0 : false;
    }

    if (source.source === 'literal') {
      if (expectedType === 'number') {
        if (typeof source.value === 'boolean') {
          return source.value ? 1 : 0;
        }
        return typeof source.value === 'number' ? source.value : 0;
      }
      return source.value === true;
    }

    const existing = this.variableStore.get(source.name);
    if (existing) {
      if (expectedType === 'number') {
        return typeof existing.value === 'number' ? existing.value : (existing.value ? 1 : 0);
      }
      return existing.value === true;
    }

    if (expectedType === 'number') {
      if (typeof source.fallback === 'number') return source.fallback;
      if (typeof source.fallback === 'boolean') return source.fallback ? 1 : 0;
      return 0;
    }

    return source.fallback === true;
  }

  private composeEffect(
    steps: { actionId: string; delay: number }[],
    lightManager: DmxLightManager
  ): Effect | null {
    const { actionMap } = this.compiledCue;
    let combinedEffect: Effect | null = null;

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
      } else {
        combinedEffect.transitions.push(...effect.transitions);
      }
    }

    return combinedEffect;
  }
}

