import {
  ActionNode,
  BaseEventNode,
  Connection,
  EventDefinition,
  EventRaiserNode,
  EventListenerNode,
  LogicNode,
} from '../../types/nodeCueTypes'
import { createLogger } from '../../../../shared/logger'
import { validateSharedActionNodePayload } from './sharedActionNodeValidation'
import { CompilationError, CompilationErrorFactory } from './CompilationError'

const log = createLogger('GraphBuilder')

/**
 * Fields common to every compiled node graph. The concrete compiled types
 * (`CompiledNodeCue`, `CompiledEffect`) extend this with their own extras and a
 * more specific `definition`. This is also structurally compatible with the
 * engine's `CompiledGraph` view in `runtime/BaseNodeExecutionEngine.ts`.
 */
export interface CompiledGraphBase<TEvent extends BaseEventNode> {
  definition: { id: string }
  eventMap: Map<string, TEvent>
  actionMap: Map<string, ActionNode>
  logicMap: Map<string, LogicNode>
  eventRaiserMap: Map<string, EventRaiserNode>
  eventListenerMap: Map<string, EventListenerNode>
  eventDefinitions: EventDefinition[]
  adjacency: Map<string, Connection[]>
}

/** The categorised node arrays both cue and effect definitions expose under `definition.nodes`. */
export interface GraphNodeArrays<TEvent extends BaseEventNode> {
  events: TEvent[]
  actions: ActionNode[]
  logic: LogicNode[]
  eventRaisers: EventRaiserNode[]
  eventListeners: EventListenerNode[]
}

/** The maps the shared core builds from the node arrays (the common subset of every compiled graph). */
export interface BuiltGraphCore<TEvent extends BaseEventNode> {
  eventMap: Map<string, TEvent>
  actionMap: Map<string, ActionNode>
  logicMap: Map<string, LogicNode>
  eventRaiserMap: Map<string, EventRaiserNode>
  eventListenerMap: Map<string, EventListenerNode>
  adjacency: Map<string, Connection[]>
}

/**
 * Per-compiler hooks injected into the shared {@link AbstractGraphBuilder.buildCompiledCore}
 * pipeline. They carry the small differences between the cue and effect
 * compilers (extra endpoint maps, reachability entry points, error factory,
 * error wording) so that the rest of the pipeline — map construction, event
 * name-set validation, connection-endpoint validation, adjacency build,
 * reachability traversal, per-action validation, unreachable-action check —
 * can be shared.
 */
export interface GraphBuildHooks {
  /** Build the compiler-specific {@link CompilationError} subclass (pluggable-error pattern). */
  createError: CompilationErrorFactory
  /**
   * Additional node-id maps that connection endpoints may legitimately
   * reference beyond the five common maps (cue: effectRaiserMap; effect:
   * effectListenerMap). Used only by the connection-endpoint validation.
   */
  extraEndpointMaps: Map<string, unknown>[]
  /**
   * Reachability entry points (the ONLY traversal difference). Cue starts from
   * every event + every event listener; effect adds the effect-listener entries
   * before those. Returned in the exact order traversal must visit them.
   */
  reachabilityEntryIds: string[]
  /** Suffix on the unreachable-action error: cue "any event"; effect "any entry point". */
  unreachableSuffix: string
}

/**
 * Shared base for the cue and effect compilers. A subclass runs its
 * compiler-specific pre-checks and builds its extra node maps, then hands the
 * common work to {@link buildCompiledCore}, passing the per-compiler
 * differences as {@link GraphBuildHooks}.
 */
export abstract class AbstractGraphBuilder {
  /**
   * Runs the compilation steps common to every node graph, in order:
   *  1. map construction from the categorised node arrays,
   *  2. event-name-set validation for event raisers/listeners,
   *  3. connection-endpoint existence validation,
   *  4. adjacency build,
   *  5. reachability traversal from the hook-provided entry ids,
   *  6. per-action payload validation via `validateSharedActionNodePayload`,
   *  7. the unreachable-action check.
   *
   * On any failure throws the compiler-specific `CompilationError` built by
   * `hooks.createError`, so callers can tell cue and effect failures apart.
   */
  protected static buildCompiledCore<TEvent extends BaseEventNode>(
    nodes: GraphNodeArrays<TEvent>,
    connections: Connection[],
    eventDefinitions: EventDefinition[],
    hooks: GraphBuildHooks,
  ): BuiltGraphCore<TEvent> {
    const { events, actions, logic, eventRaisers, eventListeners } = nodes
    const { createError } = hooks

    const eventMap = new Map(events.map((event) => [event.id, event]))
    const actionMap = new Map(actions.map((action) => [action.id, action]))
    const logicMap = new Map(logic.map((node) => [node.id, node]))
    const eventRaiserMap = new Map(eventRaisers.map((raiser) => [raiser.id, raiser]))
    const eventListenerMap = new Map(eventListeners.map((listener) => [listener.id, listener]))
    const eventNameSet = new Set(eventDefinitions.map((e) => e.name))

    // Validate that all event raiser/listener nodes reference valid registered events.
    for (const raiser of eventRaisers) {
      if (!raiser.eventName) {
        log.warn(`Event raiser '${raiser.label ?? raiser.id}' has no event selected.`)
        continue // Allow empty during editing, skip validation
      }
      if (!eventNameSet.has(raiser.eventName)) {
        throw createError(
          `Event raiser '${raiser.label ?? raiser.id}' references undefined event '${raiser.eventName}'.`,
        )
      }
    }

    for (const listener of eventListeners) {
      if (!listener.eventName) {
        log.warn(`Event listener '${listener.label ?? listener.id}' has no event selected.`)
        continue // Allow empty during editing, skip validation
      }
      if (!eventNameSet.has(listener.eventName)) {
        throw createError(
          `Event listener '${listener.label ?? listener.id}' references undefined event '${listener.eventName}'.`,
        )
      }
    }

    // Ensure all connection endpoints exist (in a common map or a compiler-specific extra map).
    const endpointMaps: Map<string, unknown>[] = [
      eventMap,
      actionMap,
      logicMap,
      eventRaiserMap,
      eventListenerMap,
      ...hooks.extraEndpointMaps,
    ]
    const endpointExists = (id: string): boolean => endpointMaps.some((m) => m.has(id))

    for (const conn of connections) {
      if (!endpointExists(conn.from)) {
        throw createError(`Connection 'from' id '${conn.from}' does not exist.`)
      }
      if (!endpointExists(conn.to)) {
        throw createError(`Connection 'to' id '${conn.to}' does not exist.`)
      }
    }

    // Build adjacency for all nodes.
    const adjacency = new Map<string, Connection[]>()
    for (const conn of connections) {
      const list = adjacency.get(conn.from) ?? []
      list.push(conn)
      adjacency.set(conn.from, list)
    }

    // Validate actions and reachability from the entry points.
    const reachableActions = new Set<string>()
    const visited = new Set<string>()

    const traverseReachability = (nodeId: string): void => {
      if (visited.has(nodeId)) return
      visited.add(nodeId)
      if (actionMap.has(nodeId)) {
        reachableActions.add(nodeId)
      }
      const edges = adjacency.get(nodeId) ?? []
      for (const edge of edges) {
        traverseReachability(edge.to)
      }
    }

    for (const entryId of hooks.reachabilityEntryIds) {
      traverseReachability(entryId)
    }

    for (const action of actions) {
      validateSharedActionNodePayload(action, createError)
    }

    const unreachableActions = actions.filter((action) => !reachableActions.has(action.id))
    if (unreachableActions.length > 0) {
      throw createError(
        `Action node(s) ${unreachableActions
          .map((node) => `'${node.label ?? node.id}'`)
          .join(', ')} are not reachable from ${hooks.unreachableSuffix}.`,
      )
    }

    return {
      eventMap,
      actionMap,
      logicMap,
      eventRaiserMap,
      eventListenerMap,
      adjacency,
    }
  }
}

export { CompilationError, type CompilationErrorFactory }
