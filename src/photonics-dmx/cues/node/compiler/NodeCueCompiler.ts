import {
  ActionNode,
  ActionTimingConfig,
  AudioEventNodeUnion,
  AudioNodeCueDefinition,
  BaseEventNode,
  createDefaultActionTiming,
  EffectRaiserNode,
  VariableDefinition,
  YargEventNode,
  YargNodeCueDefinition,
  ValueSource,
} from '../../types/nodeCueTypes'
import { AbstractGraphBuilder, CompiledGraphBase } from './AbstractGraphBuilder'
import { CompilationError } from './CompilationError'

/**
 * Error thrown by {@link NodeCueCompiler} when a cue graph is invalid. A
 * {@link CompilationError} subclass so callers can distinguish cue-compile
 * failures from effect-compile failures via `instanceof` / `error.name`.
 */
export class NodeCueCompilationError extends CompilationError {
  constructor(message: string) {
    super(message)
    this.name = 'NodeCueCompilationError'
  }
}

export interface CompiledNodeCue<TEvent extends BaseEventNode> extends CompiledGraphBase<TEvent> {
  definition: YargNodeCueDefinition | AudioNodeCueDefinition
  effectRaiserMap: Map<string, EffectRaiserNode>
  /** Group-level variable definitions; set by loader from file.group.variables */
  groupVariables?: VariableDefinition[]
}

export type CompiledYargCue = CompiledNodeCue<YargEventNode>
export type CompiledAudioCue = CompiledNodeCue<AudioEventNodeUnion>

const getActionTiming = (action: ActionNode): ActionTimingConfig => ({
  ...createDefaultActionTiming(),
  ...(action.timing ?? {}),
})

/**
 * Calculates the total duration of an action based on its timing settings.
 */
export const calculateActionDuration = (action: ActionNode): number => {
  const timing = getActionTiming(action)

  // Extract numeric values from ValueSource (use literal value; variable source uses default at compile time)
  const extractNumber = (vs: ValueSource | undefined, defaultValue: number): number => {
    if (!vs) return defaultValue
    if (vs.source === 'literal') return Number(vs.value) || defaultValue
    return defaultValue
  }

  return (
    Math.max(0, extractNumber(timing.waitForTime, 0)) +
    Math.max(0, extractNumber(timing.duration, 200)) +
    Math.max(0, extractNumber(timing.waitUntilTime, 0))
  )
}

export class NodeCueCompiler extends AbstractGraphBuilder {
  public static compileYargCue(definition: YargNodeCueDefinition): CompiledYargCue {
    return this.buildCompiled(definition)
  }

  public static compileAudioCue(definition: AudioNodeCueDefinition): CompiledAudioCue {
    return this.buildCompiled(definition)
  }

  private static buildCompiled<TEvent extends BaseEventNode>(
    definition: YargNodeCueDefinition | AudioNodeCueDefinition,
  ): CompiledNodeCue<TEvent> {
    const events = definition.nodes.events as unknown as TEvent[]
    const actions = (definition.nodes.actions ?? []) as ActionNode[]
    const logic = definition.nodes.logic ?? []
    const eventRaisers = definition.nodes.eventRaisers ?? []
    const eventListeners = definition.nodes.eventListeners ?? []
    const effectRaisers = definition.nodes.effectRaisers ?? []
    const eventDefinitions = definition.events ?? []

    // Cue-specific policy: at least one event node is required.
    if (!events.length) {
      throw new NodeCueCompilationError('At least one event node is required.')
    }

    // Cue-specific policy: at least one action/raiser/listener node is required.
    if (
      !actions.length &&
      !eventRaisers.length &&
      !eventListeners.length &&
      !effectRaisers.length
    ) {
      const cueId =
        definition.kind === 'lighting'
          ? 'cueType' in definition
            ? definition.cueType
            : definition.cueTypeId
          : definition.id
      throw new NodeCueCompilationError(
        `At least one action, event raiser, event listener, or effect raiser node is required. Cue '${definition.name}' (${cueId}) has none.`,
      )
    }

    // Cue-specific extra map: effect-raiser nodes (also valid connection endpoints).
    const effectRaiserMap = new Map(effectRaisers.map((raiser) => [raiser.id, raiser]))

    const core = this.buildCompiledCore<TEvent>(
      { events, actions, logic, eventRaisers, eventListeners },
      definition.connections,
      eventDefinitions,
      {
        createError: (message) => new NodeCueCompilationError(message),
        extraEndpointMaps: [effectRaiserMap],
        // Reachability starts from every event then every event listener
        // (listeners are triggered by runtime events).
        reachabilityEntryIds: [
          ...events.map((event) => event.id),
          ...eventListeners.map((listener) => listener.id),
        ],
        unreachableSuffix: 'any event',
      },
    )

    return {
      definition,
      eventMap: core.eventMap,
      actionMap: core.actionMap,
      logicMap: core.logicMap,
      eventRaiserMap: core.eventRaiserMap,
      eventListenerMap: core.eventListenerMap,
      effectRaiserMap,
      eventDefinitions,
      adjacency: core.adjacency,
    }
  }
}
