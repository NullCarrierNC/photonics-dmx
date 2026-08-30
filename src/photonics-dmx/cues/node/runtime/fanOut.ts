/**
 * Shared fan-out driver for the iteration logic nodes (for-each-light, led-changed). Kept engine-agnostic
 * so both the DMX engines (BaseNodeExecutionEngine) and the standalone LaserGraphExecutor drive it the same
 * way, the way graphActionHelpers.runContextBatch is shared. The caller supplies the graph adjacency, the
 * continue/complete/emit callbacks, and a per-node body-set cache it owns; this module owns the loop.
 */

import { Connection } from '../../types/nodeCueTypes'
import { CueData, ledBankNibbleAt, ledColorAt } from '../../types/cueTypes'
import { AudioCueData } from '../../types/audioCueTypes'
import { ExecutionContext } from './ExecutionContext'
import { collectReachableNodes } from './engineUtils'

/** One StageKit LED position whose colour changed since the previous frame. */
export interface LedChange {
  /** 0-based position (0..7). */
  index: number
  /** off->lit ('on'), lit->off ('off'), or stayed lit but the banks changed ('color'). */
  edge: 'on' | 'off' | 'color'
  /** The position's new colour name (ledColorAt), 'transparent' when it turned off. */
  color: string
}

/**
 * The positions whose bank nibble changed between `frame` and its `previousFrame`. The nibble captures both
 * lit-state and colour, so a single inequality catches off->on, on->off, and a same-position colour swap.
 * A non-StageKit frame (audio, no ledBanks) yields an empty list.
 */
export function computeLedChanges(frame: CueData | AudioCueData | undefined): LedChange[] {
  const now: Partial<CueData> = frame && 'ledBanks' in frame ? frame : {}
  const prev: Partial<CueData> | undefined =
    frame && 'ledBanks' in frame ? frame.previousFrame : undefined
  const changed: LedChange[] = []
  for (let i = 0; i < 8; i++) {
    const nowNibble = ledBankNibbleAt(now, i)
    const prevNibble = ledBankNibbleAt(prev, i)
    if (nowNibble === prevNibble) continue
    const edge = prevNibble === 0 ? 'on' : nowNibble === 0 ? 'off' : 'color'
    changed.push({ index: i, edge, color: ledColorAt(now, i) })
  }
  return changed
}

/** The engine-specific pieces the fan-out loop calls back into. */
export interface FanOutHooks {
  adjacency: Map<string, Connection[]>
  /** Body-node set per fan-out node id, owned by the caller so it persists across frames (the compiled
   *  graph is immutable, so the set never changes for a given node). Populated lazily. */
  bodyCache: Map<string, ReadonlySet<string>>
  continueExecution: (targets: string[], context: ExecutionContext) => void
  /** Continue the done branch, or complete the context when there are no done targets. */
  continueOrComplete: (targets: string[], context: ExecutionContext) => void
  emitDeactivated: (nodeId: string) => void
}

/**
 * Run the fan-out node's `each` body `iterationCount` times, calling `seedIteration(i)` before each pass to
 * write that iteration's variables (it returns the index to expose for effect naming: the loop counter for
 * for-each-light, the LED position for led-changed), then continue the `done` branch. The forEachLightState
 * bracket keeps tryComplete from disposing the context mid-loop, and unmarking the body nodes lets each pass
 * re-walk under the strict revisit policy. The try/finally clears the bracket even if a pass throws.
 */
export function runFanOut(
  nodeId: string,
  context: ExecutionContext,
  iterationCount: number,
  seedIteration: (i: number) => number,
  hooks: FanOutHooks,
): void {
  const edges = hooks.adjacency.get(nodeId) ?? []
  const eachTargets = edges.filter((e) => e.fromPort === 'each').map((e) => e.to)
  const doneTargets = edges.filter((e) => e.fromPort === 'done').map((e) => e.to)

  let bodyNodeIds = hooks.bodyCache.get(nodeId)
  if (!bodyNodeIds) {
    bodyNodeIds = collectReachableNodes(hooks.adjacency, eachTargets, nodeId)
    hooks.bodyCache.set(nodeId, bodyNodeIds)
  }

  context.setForEachLightState(nodeId, { index: 0, length: iterationCount })
  try {
    for (let i = 0; i < iterationCount; i++) {
      const iterationIndex = seedIteration(i)
      context.setForEachIterationIndex(iterationIndex)
      for (const bodyId of bodyNodeIds) {
        context.unmarkVisited(bodyId)
      }
      hooks.continueExecution(eachTargets, context)
    }
  } finally {
    // Clear the loop bracket even if an iteration throws, so a leaked forEachLightState entry can't wedge
    // tryComplete off and strand the context alive forever.
    context.clearForEachLightState(nodeId)
    context.setForEachIterationIndex(-1)
  }

  context.markVisited(nodeId)
  hooks.emitDeactivated(nodeId)
  hooks.continueOrComplete(doneTargets, context)
}
