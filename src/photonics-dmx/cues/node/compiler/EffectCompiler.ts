import {
  ActionNode,
  AudioEventNode,
  AudioEffectDefinition,
  BaseEventNode,
  BaseEffectDefinition,
  Connection,
  EffectParameterDefinition,
  EffectEventListenerNode,
  EventDefinition,
  EventRaiserNode,
  EventListenerNode,
  LogicNode,
  YargEventNode,
  YargEffectDefinition
} from '../../types/nodeCueTypes';

export class EffectCompilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EffectCompilationError';
  }
}

export interface CompiledEffect<TEvent extends BaseEventNode> {
  definition: BaseEffectDefinition;
  eventMap: Map<string, TEvent>;
  actionMap: Map<string, ActionNode>;
  logicMap: Map<string, LogicNode>;
  effectListenerMap: Map<string, EffectEventListenerNode>;
  eventRaiserMap: Map<string, EventRaiserNode>;  // Runtime events within effect
  eventListenerMap: Map<string, EventListenerNode>;  // Runtime events within effect
  eventDefinitions: EventDefinition[];
  adjacency: Map<string, Connection[]>;
  parameters: Map<string, EffectParameterDefinition>;
}

export type CompiledYargEffect = CompiledEffect<YargEventNode>;
export type CompiledAudioEffect = CompiledEffect<AudioEventNode>;

export class EffectCompiler {
  public static compileYargEffect(definition: YargEffectDefinition): CompiledYargEffect {
    return this.buildCompiled(definition);
  }

  public static compileAudioEffect(definition: AudioEffectDefinition): CompiledAudioEffect {
    return this.buildCompiled(definition);
  }

  public static compile(effect: YargEffectDefinition | AudioEffectDefinition): CompiledYargEffect | CompiledAudioEffect {
    if (effect.mode === 'yarg') {
      return this.compileYargEffect(effect);
    } else {
      return this.compileAudioEffect(effect);
    }
  }

  private static buildCompiled<TEvent extends BaseEventNode>(
    definition: YargEffectDefinition | AudioEffectDefinition
  ): CompiledEffect<TEvent> {
    const events = definition.nodes.events as unknown as TEvent[];
    const actions = definition.nodes.actions;
    const logic = definition.nodes.logic ?? [];
    const eventRaisers = definition.nodes.eventRaisers ?? [];
    const eventListeners = definition.nodes.eventListeners ?? [];
    const effectListeners = definition.nodes.effectListeners ?? [];
    const eventDefinitions = definition.events ?? [];
    const parameters = definition.parameters ?? [];

    // Effects must have at least one effect listener (entry point)
    if (effectListeners.length === 0) {
      throw new EffectCompilationError('At least one Effect Listener node is required (entry point).');
    }

    // Effects can't invoke other effects
    const effectRaisers = definition.nodes.effectRaisers ?? [];
    if (effectRaisers.length > 0) {
      throw new EffectCompilationError('Effects cannot contain Effect Raiser nodes (effects cannot invoke other effects).');
    }

    // Must have at least one action or runtime event mechanism
    if (!actions.length && !eventRaisers.length && !eventListeners.length) {
      throw new EffectCompilationError('Effect must contain at least one action or runtime event node.');
    }

    const eventMap = new Map(events.map(event => [event.id, event]));
    const actionMap = new Map(actions.map(action => [action.id, action]));
    const logicMap = new Map(logic.map(node => [node.id, node]));
    const effectListenerMap = new Map(effectListeners.map(listener => [listener.id, listener]));
    const eventRaiserMap = new Map(eventRaisers.map(raiser => [raiser.id, raiser]));
    const eventListenerMap = new Map(eventListeners.map(listener => [listener.id, listener]));
    const parameterMap = new Map(parameters.map(param => [param.name, param]));
    const eventNameSet = new Set(eventDefinitions.map(e => e.name));

    // Validate runtime event raiser/listener nodes reference valid registered events
    for (const raiser of eventRaisers) {
      if (!raiser.eventName) {
        console.warn(`Event raiser '${raiser.label ?? raiser.id}' has no event selected.`);
        continue;
      }
      if (!eventNameSet.has(raiser.eventName)) {
        throw new EffectCompilationError(`Event raiser '${raiser.label ?? raiser.id}' references undefined event '${raiser.eventName}'.`);
      }
    }

    for (const listener of eventListeners) {
      if (!listener.eventName) {
        console.warn(`Event listener '${listener.label ?? listener.id}' has no event selected.`);
        continue;
      }
      if (!eventNameSet.has(listener.eventName)) {
        throw new EffectCompilationError(`Event listener '${listener.label ?? listener.id}' references undefined event '${listener.eventName}'.`);
      }
    }

    // Validate parameter mappings in effect listeners
    const variableNames = new Set(definition.variables?.map(v => v.name) ?? []);
    for (const effectListener of effectListeners) {
      if (effectListener.parameterMappings) {
        for (const mapping of effectListener.parameterMappings) {
          // Check parameter exists
          if (!parameterMap.has(mapping.parameterName)) {
            throw new EffectCompilationError(
              `Effect Listener '${effectListener.label ?? effectListener.id}' maps undefined parameter '${mapping.parameterName}'.`
            );
          }
          // Check target variable exists
          if (!variableNames.has(mapping.targetVariable)) {
            throw new EffectCompilationError(
              `Effect Listener '${effectListener.label ?? effectListener.id}' maps to undefined variable '${mapping.targetVariable}'.`
            );
          }
        }
      }
    }

    // Ensure all connection endpoints exist
    for (const conn of definition.connections) {
      const fromExists = eventMap.has(conn.from) || 
                        actionMap.has(conn.from) || 
                        logicMap.has(conn.from) || 
                        eventRaiserMap.has(conn.from) || 
                        eventListenerMap.has(conn.from) ||
                        effectListenerMap.has(conn.from);
      
      if (!fromExists) {
        throw new EffectCompilationError(`Connection 'from' id '${conn.from}' does not exist.`);
      }

      const toExists = eventMap.has(conn.to) || 
                      actionMap.has(conn.to) || 
                      logicMap.has(conn.to) || 
                      eventRaiserMap.has(conn.to) || 
                      eventListenerMap.has(conn.to) ||
                      effectListenerMap.has(conn.to);
      
      if (!toExists) {
        throw new EffectCompilationError(`Connection 'to' id '${conn.to}' does not exist.`);
      }
    }

    // Build adjacency for all nodes
    const adjacency = new Map<string, Connection[]>();
    for (const conn of definition.connections) {
      const list = adjacency.get(conn.from) ?? [];
      list.push(conn);
      adjacency.set(conn.from, list);
    }

    // Validate actions and reachability from effect listeners
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

    // Start from effect listener nodes (entry points)
    for (const effectListener of effectListeners) {
      traverseReachability(effectListener.id);
    }

    // Also start from system event nodes (if any)
    for (const event of events) {
      traverseReachability(event.id);
    }

    // Also start from runtime event listeners
    for (const listener of eventListeners) {
      traverseReachability(listener.id);
    }

    for (const action of actions) {
      this.validateAction(action);
    }

    const unreachableActions = actions.filter(action => !reachableActions.has(action.id));
    if (unreachableActions.length > 0) {
      throw new EffectCompilationError(
        `Action node(s) ${unreachableActions.map(node => `'${node.label ?? node.id}'`).join(', ')} are not reachable from any entry point.`
      );
    }

    return {
      definition,
      eventMap,
      actionMap,
      logicMap,
      effectListenerMap,
      eventRaiserMap,
      eventListenerMap,
      eventDefinitions,
      adjacency,
      parameters: parameterMap
    };
  }

  private static validateAction(action: ActionNode): void {
    if (!action.target.groups || action.target.groups.length === 0) {
      throw new EffectCompilationError(`Action '${action.label ?? action.id}' must target at least one group.`);
    }
  }
}
