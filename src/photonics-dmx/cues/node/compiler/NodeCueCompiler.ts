import {
  ActionNode,
  ActionTiming,
  AudioEventNode,
  AudioNodeCueDefinition,
  Connection,
  createDefaultActionTiming,
  YargEventNode,
  YargNodeCueDefinition
} from '../../types/nodeCueTypes';

export class NodeCueCompilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeCueCompilationError';
  }
}

export interface CompiledActionStep<TEvent extends YargEventNode | AudioEventNode> {
  action: ActionNode;
  event: TEvent;
  /** Cumulative delay in milliseconds from when the triggering event fires */
  delayMs: number;
  /** Position in chain: 0 for actions triggered directly by events, 1+ for chained actions */
  chainPosition: number;
}

export interface CompiledActionChain<TEvent extends YargEventNode | AudioEventNode> {
  chainId: string;
  event: TEvent;
  actions: CompiledActionStep<TEvent>[];
}

export interface CompiledYargCue {
  definition: YargNodeCueDefinition;
  chains: CompiledActionChain<YargEventNode>[];
}

export interface CompiledAudioCue {
  definition: AudioNodeCueDefinition;
  chains: CompiledActionChain<AudioEventNode>[];
}

const getActionTiming = (action: ActionNode): ActionTiming => ({
  ...createDefaultActionTiming(),
  ...(action.timing ?? {})
});

/**
 * Calculates the total duration of an action based on its timing settings.
 */
const calculateActionDuration = (action: ActionNode): number => {
  const timing = getActionTiming(action);
  return Math.max(0, timing.fadeIn) +
    Math.max(0, timing.hold) +
    Math.max(0, timing.fadeOut) +
    Math.max(0, timing.postDelay);
};

export class NodeCueCompiler {
  public static compileYargCue(definition: YargNodeCueDefinition): CompiledYargCue {
    const chains = this.expandConnections(
      definition.nodes.events,
      definition.nodes.actions,
      definition.connections
    );

    return {
      definition,
      chains
    };
  }

  public static compileAudioCue(definition: AudioNodeCueDefinition): CompiledAudioCue {
    const chains = this.expandConnections(
      definition.nodes.events,
      definition.nodes.actions,
      definition.connections
    );

    return {
      definition,
      chains
    };
  }

  private static expandConnections<TEvent extends YargEventNode | AudioEventNode>(
    events: TEvent[],
    actions: ActionNode[],
    connections: Connection[]
  ): CompiledActionChain<TEvent>[] {
    if (!events.length) {
      throw new NodeCueCompilationError('At least one event node is required.');
    }

    if (!actions.length) {
      throw new NodeCueCompilationError('At least one action node is required.');
    }

    const eventMap = new Map(events.map(event => [event.id, event]));
    const actionMap = new Map(actions.map(action => [action.id, action]));

    // Build adjacency lists for the connection graph
    const eventToActions = new Map<string, string[]>();
    const actionToActions = new Map<string, string[]>();

    for (const conn of connections) {
      if (eventMap.has(conn.from)) {
        // Event → Action connection
        const list = eventToActions.get(conn.from) ?? [];
        list.push(conn.to);
        eventToActions.set(conn.from, list);
      } else if (actionMap.has(conn.from) && actionMap.has(conn.to)) {
        // Action → Action connection
        const list = actionToActions.get(conn.from) ?? [];
        list.push(conn.to);
        actionToActions.set(conn.from, list);
      }
    }

    const chains: CompiledActionChain<TEvent>[] = [];
    const reachableActions = new Set<string>();

    /**
     * Recursively traverses action chains starting from an event-triggered action.
     * Builds compiled plans with cumulative delays.
     */
    const traverseChain = (
      actionId: string,
      event: TEvent,
      cumulativeDelay: number,
      chainPosition: number,
      visited: Set<string>,
      currentChain: CompiledActionStep<TEvent>[]
    ): void => {
      if (visited.has(actionId)) {
        return; // Prevent infinite loops (cycles should be caught by validation)
      }

      const action = actionMap.get(actionId);
      if (!action) {
        return;
      }

      visited.add(actionId);
      reachableActions.add(actionId);

      this.validateAction(action);

      const step: CompiledActionStep<TEvent> = {
        action,
        event,
        delayMs: cumulativeDelay,
        chainPosition
      };

      const nextChain = [...currentChain, step];

      const actionDuration = calculateActionDuration(action);
      const nextDelay = cumulativeDelay + actionDuration;

      const chainedActions = actionToActions.get(actionId) ?? [];
      if (chainedActions.length === 0) {
        const pathId = nextChain.map(step => step.action.id).join('>');
        chains.push({
          chainId: `${event.id}:${pathId}`,
          event,
          actions: nextChain
        });
      } else {
        for (const nextActionId of chainedActions) {
          traverseChain(
            nextActionId,
            event,
            nextDelay,
            chainPosition + 1,
            new Set(visited),
            nextChain
          );
        }
      }
    };

    // Start traversal from each event node
    for (const event of events) {
      const rootActions = eventToActions.get(event.id) ?? [];
      for (const actionId of rootActions) {
        traverseChain(actionId, event, 0, 0, new Set(), []);
      }
    }

    // Check for orphaned actions (not reachable from any event)
    const unreachableActions = actions.filter(action => !reachableActions.has(action.id));
    if (unreachableActions.length > 0) {
      throw new NodeCueCompilationError(
        `Action node(s) ${unreachableActions.map(node => `'${node.label ?? node.id}'`).join(', ')} are not reachable from any event.`
      );
    }

    return chains;
  }

  private static validateAction(action: ActionNode): void {
    if (!action.target.groups || action.target.groups.length === 0) {
      throw new NodeCueCompilationError(`Action '${action.label ?? action.id}' must target at least one group.`);
    }

    if (action.effectType === 'cross-fade' && !action.secondaryColor) {
      throw new NodeCueCompilationError(
        `Action '${action.label ?? action.id}' requires a secondary colour for the cross-fade effect.`
      );
    }
  }

  /**
   * Calculates the total duration of an action chain starting from an event.
   * Useful for displaying chain duration in the UI.
   */
  public static calculateChainDuration(chains: CompiledActionChain<YargEventNode | AudioEventNode>[]): number {
    if (chains.length === 0) return 0;

    let maxEndTime = 0;
    for (const chain of chains) {
      for (const step of chain.actions) {
        const endTime = step.delayMs + calculateActionDuration(step.action);
        if (endTime > maxEndTime) {
          maxEndTime = endTime;
        }
      }
    }
    return maxEndTime;
  }
}

