import {
  ActionNode,
  ActionTimingConfig,
  AudioEventNode,
  AudioNodeCueDefinition,
  BaseEventNode,
  Connection,
  createDefaultActionTiming,
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

    if (!events.length) {
      throw new NodeCueCompilationError('At least one event node is required.');
    }

    if (!actions.length) {
      throw new NodeCueCompilationError('At least one action node is required.');
    }

    const eventMap = new Map(events.map(event => [event.id, event]));
    const actionMap = new Map(actions.map(action => [action.id, action]));
    const logicMap = new Map(logic.map(node => [node.id, node]));

    // Ensure all connection endpoints exist
    for (const conn of definition.connections) {
      if (!eventMap.has(conn.from) && !actionMap.has(conn.from) && !logicMap.has(conn.from)) {
        throw new NodeCueCompilationError(`Connection 'from' id '${conn.from}' does not exist.`);
      }
      if (!eventMap.has(conn.to) && !actionMap.has(conn.to) && !logicMap.has(conn.to)) {
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

    // Validate actions and reachability
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

    for (const event of events) {
      traverseReachability(event.id);
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
      adjacency
    };
  }

  private static validateAction(action: ActionNode): void {
    if (!action.target.groups || action.target.groups.length === 0) {
      throw new NodeCueCompilationError(`Action '${action.label ?? action.id}' must target at least one group.`);
    }

    
  }

}

