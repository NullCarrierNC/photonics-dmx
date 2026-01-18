import {
  ActionNode,
  ActionTimingConfig,
  AudioEventNode,
  AudioNodeCueDefinition,
  BaseEventNode,
  Connection,
  createDefaultActionTiming,
  EventDefinition,
  EventRaiserNode,
  EventListenerNode,
  EffectRaiserNode,
  LogicNode,
  YargEventNode,
  YargNodeCueDefinition,
  ValueSource,
  NodeColorSetting,
  NodeActionTarget
} from '../../types/nodeCueTypes';

export class NodeCueCompilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeCueCompilationError';
  }
}

/**
 * Migrate old action nodes (with literal values) to new format (with ValueSource).
 */
function migrateActionNode(action: any): ActionNode {
  const migrateValueSource = (value: any, defaultValue: string | number | boolean): ValueSource => {
    // Already a ValueSource
    if (value && typeof value === 'object' && 'source' in value) {
      return value as ValueSource;
    }
    // Old format - convert to literal ValueSource
    return { source: 'literal', value: value ?? defaultValue };
  };

  const migrateColorSetting = (color: any): NodeColorSetting => {
    if (!color) {
      return {
        name: { source: 'literal', value: 'blue' },
        brightness: { source: 'literal', value: 'medium' },
        blendMode: { source: 'literal', value: 'replace' }
      };
    }
    return {
      name: migrateValueSource(color.name, 'blue'),
      brightness: migrateValueSource(color.brightness, 'medium'),
      blendMode: color.blendMode ? migrateValueSource(color.blendMode, 'replace') : undefined,
      opacity: color.opacity ? migrateValueSource(color.opacity, 1) : undefined
    };
  };

  const migrateTarget = (target: any): NodeActionTarget => {
    if (!target) {
      return {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      };
    }
    // If groups is an array (old format), convert to comma-separated string
    if (Array.isArray(target.groups)) {
      return {
        groups: { source: 'literal', value: target.groups.join(',') },
        filter: migrateValueSource(target.filter, 'all')
      };
    }
    return {
      groups: migrateValueSource(target.groups, 'front'),
      filter: migrateValueSource(target.filter, 'all')
    };
  };

  const migrateTiming = (timing: any): ActionTimingConfig => {
    if (!timing) return createDefaultActionTiming();
    return {
      waitForCondition: timing.waitForCondition ?? 'none',
      waitForTime: migrateValueSource(timing.waitForTime, 0),
      waitForConditionCount: timing.waitForConditionCount ? migrateValueSource(timing.waitForConditionCount, 0) : undefined,
      duration: migrateValueSource(timing.duration, 200),
      waitUntilCondition: timing.waitUntilCondition ?? 'none',
      waitUntilTime: migrateValueSource(timing.waitUntilTime, 0),
      waitUntilConditionCount: timing.waitUntilConditionCount ? migrateValueSource(timing.waitUntilConditionCount, 0) : undefined,
      easing: timing.easing,
      level: timing.level ? migrateValueSource(timing.level, 1) : undefined
    };
  };

  const { secondaryColor, ...rest } = action;
  return {
    ...rest,
    target: migrateTarget(rest.target),
    color: migrateColorSetting(rest.color),
    timing: migrateTiming(rest.timing),
    layer: rest.layer !== undefined ? migrateValueSource(rest.layer, 0) : undefined
  };
}

export interface CompiledNodeCue<TEvent extends BaseEventNode> {
  definition: YargNodeCueDefinition | AudioNodeCueDefinition;
  eventMap: Map<string, TEvent>;
  actionMap: Map<string, ActionNode>;
  logicMap: Map<string, LogicNode>;
  eventRaiserMap: Map<string, EventRaiserNode>;
  eventListenerMap: Map<string, EventListenerNode>;
  effectRaiserMap: Map<string, EffectRaiserNode>;
  eventDefinitions: EventDefinition[];
  adjacency: Map<string, Connection[]>;
}

export type CompiledYargCue = CompiledNodeCue<YargEventNode>;
export type CompiledAudioCue = CompiledNodeCue<AudioEventNode>;

const getActionTiming = (action: ActionNode): ActionTimingConfig => ({
  ...createDefaultActionTiming(),
  ...(action.timing ?? {})
});

/**
 * Calculates the total duration of an action based on its timing settings.
 */
export const calculateActionDuration = (action: ActionNode): number => {
  const timing = getActionTiming(action);
  
  // Extract numeric values from ValueSource (use literal value or fallback to 0)
  const extractNumber = (vs: ValueSource | undefined, defaultValue: number): number => {
    if (!vs) return defaultValue;
    if (vs.source === 'literal') return Number(vs.value) || defaultValue;
    return Number(vs.fallback) || defaultValue;
  };
  
  return Math.max(0, extractNumber(timing.waitForTime, 0)) +
    Math.max(0, extractNumber(timing.duration, 200)) +
    Math.max(0, extractNumber(timing.waitUntilTime, 0));
};

export class NodeCueCompiler {
  public static compileYargCue(definition: YargNodeCueDefinition): CompiledYargCue {
    return this.buildCompiled(definition);
  }

  public static compileAudioCue(definition: AudioNodeCueDefinition): CompiledAudioCue {
    return this.buildCompiled(definition);
  }

  private static buildCompiled<TEvent extends BaseEventNode>(
    definition: YargNodeCueDefinition | AudioNodeCueDefinition
  ): CompiledNodeCue<TEvent> {
    const events = definition.nodes.events as unknown as TEvent[];
    const actions = definition.nodes.actions.map(migrateActionNode); // Migrate old format
    const logic = definition.nodes.logic ?? [];
    const eventRaisers = definition.nodes.eventRaisers ?? [];
    const eventListeners = definition.nodes.eventListeners ?? [];
    const effectRaisers = definition.nodes.effectRaisers ?? [];
    const eventDefinitions = definition.events ?? [];

    if (!events.length) {
      throw new NodeCueCompilationError('At least one event node is required.');
    }

    if (!actions.length && !eventRaisers.length && !eventListeners.length && !effectRaisers.length) {
      throw new NodeCueCompilationError('At least one action, event raiser, event listener, or effect raiser node is required.');
    }

    const eventMap = new Map(events.map(event => [event.id, event]));
    const actionMap = new Map(actions.map(action => [action.id, action]));
    const logicMap = new Map(logic.map(node => [node.id, node]));
    const eventRaiserMap = new Map(eventRaisers.map(raiser => [raiser.id, raiser]));
    const eventListenerMap = new Map(eventListeners.map(listener => [listener.id, listener]));
    const effectRaiserMap = new Map(effectRaisers.map(raiser => [raiser.id, raiser]));
    const eventNameSet = new Set(eventDefinitions.map(e => e.name));

    // Validate that all event raiser/listener nodes reference valid registered events
    for (const raiser of eventRaisers) {
      if (!raiser.eventName) {
        console.warn(`Event raiser '${raiser.label ?? raiser.id}' has no event selected.`);
        continue; // Allow empty during editing, skip validation
      }
      if (!eventNameSet.has(raiser.eventName)) {
        throw new NodeCueCompilationError(`Event raiser '${raiser.label ?? raiser.id}' references undefined event '${raiser.eventName}'.`);
      }
    }

    for (const listener of eventListeners) {
      if (!listener.eventName) {
        console.warn(`Event listener '${listener.label ?? listener.id}' has no event selected.`);
        continue; // Allow empty during editing, skip validation
      }
      if (!eventNameSet.has(listener.eventName)) {
        throw new NodeCueCompilationError(`Event listener '${listener.label ?? listener.id}' references undefined event '${listener.eventName}'.`);
      }
    }

    // Ensure all connection endpoints exist
    for (const conn of definition.connections) {
      if (!eventMap.has(conn.from) && !actionMap.has(conn.from) && !logicMap.has(conn.from) && !eventRaiserMap.has(conn.from) && !eventListenerMap.has(conn.from) && !effectRaiserMap.has(conn.from)) {
        throw new NodeCueCompilationError(`Connection 'from' id '${conn.from}' does not exist.`);
      }
      if (!eventMap.has(conn.to) && !actionMap.has(conn.to) && !logicMap.has(conn.to) && !eventRaiserMap.has(conn.to) && !eventListenerMap.has(conn.to) && !effectRaiserMap.has(conn.to)) {
        throw new NodeCueCompilationError(`Connection 'to' id '${conn.to}' does not exist.`);
      }
    }

    // Build adjacency for all nodes
    const adjacency = new Map<string, Connection[]>();
    for (const conn of definition.connections) {
      const list = adjacency.get(conn.from) ?? [];
      list.push(conn);
      adjacency.set(conn.from, list);
    }

    // Validate actions and reachability (event listeners don't need to be reachable from events)
    const reachableActions = new Set<string>();
    const visited = new Set<string>();

    const traverseReachability = (nodeId: string): void => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      if (actionMap.has(nodeId)) {
        reachableActions.add(nodeId);
      }
      const edges = adjacency.get(nodeId) ?? [];
      for (const edge of edges) {
        traverseReachability(edge.to);
      }
    };

    // Start from system event nodes
    for (const event of events) {
      traverseReachability(event.id);
    }

    // Also start from event listeners (they are triggered by runtime events)
    for (const listener of eventListeners) {
      traverseReachability(listener.id);
    }

    for (const action of actions) {
      this.validateAction(action);
    }

    const unreachableActions = actions.filter(action => !reachableActions.has(action.id));
    if (unreachableActions.length > 0) {
      throw new NodeCueCompilationError(
        `Action node(s) ${unreachableActions.map(node => `'${node.label ?? node.id}'`).join(', ')} are not reachable from any event.`
      );
    }

    return {
      definition,
      eventMap,
      actionMap,
      logicMap,
      eventRaiserMap,
      eventListenerMap,
      effectRaiserMap,
      eventDefinitions,
      adjacency
    };
  }

  private static validateAction(action: ActionNode): void {
    // Check if groups is defined (ValueSource should always have a value)
    if (!action.target.groups) {
      throw new NodeCueCompilationError(`Action '${action.label ?? action.id}' must target at least one group.`);
    }
    // If it's a literal source, check the value isn't empty
    if (action.target.groups.source === 'literal' && !action.target.groups.value) {
      throw new NodeCueCompilationError(`Action '${action.label ?? action.id}' must target at least one group.`);
    }
  }

}

