import {
  AudioEventNodeUnion,
  AudioEffectDefinition,
  BaseEventNode,
  BaseEffectDefinition,
  EffectEventListenerNode,
  YargEventNode,
  YargEffectDefinition,
  VariableDefinition,
} from '../../types/nodeCueTypes'
import { AbstractGraphBuilder, CompiledGraphBase } from './AbstractGraphBuilder'
import { CompilationError } from './CompilationError'

/**
 * Error thrown by {@link EffectCompiler} when an effect graph is invalid. A
 * {@link CompilationError} subclass so callers can distinguish effect-compile
 * failures from cue-compile failures via `instanceof` / `error.name`.
 */
export class EffectCompilationError extends CompilationError {
  constructor(message: string) {
    super(message)
    this.name = 'EffectCompilationError'
  }
}

export interface CompiledEffect<TEvent extends BaseEventNode> extends CompiledGraphBase<TEvent> {
  definition: BaseEffectDefinition
  effectListenerMap: Map<string, EffectEventListenerNode>
  parameters: Map<string, VariableDefinition>
}

export type CompiledYargEffect = CompiledEffect<YargEventNode>
export type CompiledAudioEffect = CompiledEffect<AudioEventNodeUnion>

export class EffectCompiler extends AbstractGraphBuilder {
  public static compileYargEffect(definition: YargEffectDefinition): CompiledYargEffect {
    return this.buildCompiled(definition)
  }

  public static compileAudioEffect(definition: AudioEffectDefinition): CompiledAudioEffect {
    return this.buildCompiled(definition)
  }

  public static compile(
    effect: YargEffectDefinition | AudioEffectDefinition,
  ): CompiledYargEffect | CompiledAudioEffect {
    if (effect.mode === 'yarg') {
      return this.compileYargEffect(effect)
    } else {
      return this.compileAudioEffect(effect)
    }
  }

  private static buildCompiled<TEvent extends BaseEventNode>(
    definition: YargEffectDefinition | AudioEffectDefinition,
  ): CompiledEffect<TEvent> {
    const events = definition.nodes.events as unknown as TEvent[]
    const actions = definition.nodes.actions
    const logic = definition.nodes.logic ?? []
    const eventRaisers = definition.nodes.eventRaisers ?? []
    const eventListeners = definition.nodes.eventListeners ?? []
    const effectListeners = definition.nodes.effectListeners ?? []
    const eventDefinitions = definition.events ?? []
    // Derive parameters from variables with isParameter: true
    const parameters = definition.variables?.filter((v) => v.isParameter) ?? []

    // Effect-specific policy: at least one effect listener (entry point) is required.
    if (effectListeners.length === 0) {
      throw new EffectCompilationError(
        'At least one Effect Listener node is required (entry point).',
      )
    }

    // Effect-specific policy: effects can't invoke other effects.
    const effectRaisers = definition.nodes.effectRaisers ?? []
    if (effectRaisers.length > 0) {
      throw new EffectCompilationError(
        'Effects cannot contain Effect Raiser nodes (effects cannot invoke other effects).',
      )
    }

    // Effect-specific policy: duplicate effect listener IDs are not allowed.
    const effectListenerIds = effectListeners.map((l) => l.id)
    const duplicateIds = effectListenerIds.filter((id, i) => effectListenerIds.indexOf(id) !== i)
    if (duplicateIds.length > 0) {
      const uniqueDuplicates = [...new Set(duplicateIds)]
      throw new EffectCompilationError(
        `Duplicate Effect Listener node id(s): ${uniqueDuplicates.join(', ')}.`,
      )
    }

    // Effect-specific policy: must have at least one action or runtime event mechanism.
    if (!actions.length && !eventRaisers.length && !eventListeners.length) {
      throw new EffectCompilationError(
        'Effect must contain at least one action or runtime event node.',
      )
    }

    // Effect-specific extra maps: effect-listener entries and the parameter map.
    const effectListenerMap = new Map(effectListeners.map((listener) => [listener.id, listener]))
    const parameterMap = new Map(parameters.map((variable) => [variable.name, variable]))

    const core = this.buildCompiledCore<TEvent>(
      { events, actions, logic, eventRaisers, eventListeners },
      definition.connections,
      eventDefinitions,
      {
        createError: (message) => new EffectCompilationError(message),
        extraEndpointMaps: [effectListenerMap],
        // Reachability starts from the effect-listener entry points, then system
        // events, then runtime event listeners.
        reachabilityEntryIds: [
          ...effectListeners.map((listener) => listener.id),
          ...events.map((event) => event.id),
          ...eventListeners.map((listener) => listener.id),
        ],
        unreachableSuffix: 'any entry point',
      },
    )

    return {
      definition,
      eventMap: core.eventMap,
      actionMap: core.actionMap,
      logicMap: core.logicMap,
      effectListenerMap,
      eventRaiserMap: core.eventRaiserMap,
      eventListenerMap: core.eventListenerMap,
      eventDefinitions,
      adjacency: core.adjacency,
      parameters: parameterMap,
    }
  }
}
