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
  YargNodeCueDefinition
} from '../../types/nodeCueTypes';

export class NodeCueCompilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeCueCompilationError';
  }
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
  return Math.max(0, timing.waitForTime) +
    Math.max(0, timing.duration) +
    Math.max(0, timing.waitUntilTime);
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
    const actions = definition.nodes.actions;
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
    if (!action.target.groups || action.target.groups.length === 0) {
      throw new NodeCueCompilationError(`Action '${action.label ?? action.id}' must target at least one group.`);
    }

    
  }

}

