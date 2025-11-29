import {
  ActionNode,
  AudioEventNode,
  AudioNodeCueDefinition,
  Connection,
  YargEventNode,
  YargNodeCueDefinition
} from '../../types/nodeCueTypes';

export class NodeCueCompilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeCueCompilationError';
  }
}

export interface CompiledActionPlan<TEvent extends YargEventNode | AudioEventNode> {
  action: ActionNode;
  event: TEvent;
}

export interface CompiledYargCue {
  definition: YargNodeCueDefinition;
  actions: CompiledActionPlan<YargEventNode>[];
}

export interface CompiledAudioCue {
  definition: AudioNodeCueDefinition;
  actions: CompiledActionPlan<AudioEventNode>[];
}

export class NodeCueCompiler {
  public static compileYargCue(definition: YargNodeCueDefinition): CompiledYargCue {
    const actions = this.expandConnections(
      definition.nodes.events,
      definition.nodes.actions,
      definition.connections
    );

    return {
      definition,
      actions
    };
  }

  public static compileAudioCue(definition: AudioNodeCueDefinition): CompiledAudioCue {
    const actions = this.expandConnections(
      definition.nodes.events,
      definition.nodes.actions,
      definition.connections
    );

    return {
      definition,
      actions
    };
  }

  private static expandConnections<TEvent extends YargEventNode | AudioEventNode>(
    events: TEvent[],
    actions: ActionNode[],
    connections: Connection[]
  ): CompiledActionPlan<TEvent>[] {
    if (!events.length) {
      throw new NodeCueCompilationError('At least one event node is required.');
    }

    if (!actions.length) {
      throw new NodeCueCompilationError('At least one action node is required.');
    }

    const eventMap = new Map(events.map(event => [event.id, event]));
    const actionMap = new Map(actions.map(action => [action.id, action]));
    const actionConnections = new Map<string, number>();
    const plans: CompiledActionPlan<TEvent>[] = [];

    connections.forEach(connection => {
      const event = eventMap.get(connection.from);
      if (!event) {
        throw new NodeCueCompilationError(`Connection references unknown event node '${connection.from}'.`);
      }

      const action = actionMap.get(connection.to);
      if (!action) {
        throw new NodeCueCompilationError(`Connection references unknown action node '${connection.to}'.`);
      }

      this.validateAction(action);

      plans.push({
        action,
        event
      });

      actionConnections.set(action.id, (actionConnections.get(action.id) || 0) + 1);
    });

    const unconnectedActions = actions.filter(action => !actionConnections.has(action.id));
    if (unconnectedActions.length > 0) {
      throw new NodeCueCompilationError(
        `Action node(s) ${unconnectedActions.map(node => `'${node.label ?? node.id}'`).join(', ')} are not connected to any events.`
      );
    }

    return plans;
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
}

