import type { ActionNode, NodeCueFile, ValueSource } from '../../types/nodeCueTypes'

const waits = (condition: ValueSource | undefined): boolean =>
  condition?.source === 'literal' && condition.value !== 'none'

/** An action whose completion the nodes after it wait for. */
const blocks = (action: ActionNode): boolean =>
  action.effectType === 'blackout' ||
  waits(action.timing.waitForCondition) ||
  waits(action.timing.waitUntilCondition)

/**
 * Warn about an audio cue-called event on the continuous policy whose graph reaches a step that
 * waits: a blocking action, or an effect raiser holding its context for the nodes after it.
 * Cue-called fires on every audio frame, so each frame parks another run behind that step.
 */
export function checkContinuousCueCalledWaits(
  file: NodeCueFile,
  _errors: string[],
  warnings: string[],
): void {
  if (file.mode !== 'audio') return
  for (const cue of file.cues) {
    const next = new Map<string, string[]>()
    for (const { from, to } of cue.connections) {
      next.set(from, [...(next.get(from) ?? []), to])
    }
    const waitingNodes = new Set<string>([
      ...cue.nodes.actions.filter(blocks).map((action) => action.id),
      ...(cue.nodes.effectRaisers ?? [])
        .filter((raiser) => (next.get(raiser.id) ?? []).length > 0)
        .map((raiser) => raiser.id),
    ])
    for (const event of cue.nodes.events ?? []) {
      if (!('eventType' in event) || event.eventType !== 'cue-called') continue
      const policy = 'executionPolicy' in event ? event.executionPolicy : undefined
      if ((policy ?? 'continuous') !== 'continuous') continue
      const seen = new Set<string>()
      const queue = [...(next.get(event.id) ?? [])]
      let waiting: string | undefined
      while (queue.length > 0 && !waiting) {
        const id = queue.shift()!
        if (seen.has(id)) continue
        seen.add(id)
        if (waitingNodes.has(id)) waiting = id
        queue.push(...(next.get(id) ?? []))
      }
      if (waiting) {
        warnings.push(
          `cue '${cue.name}': the cue-called event starts a run on every audio frame and '${waiting}' waits, so runs pile up. Use the Ignore while running or Latest pending policy.`,
        )
      }
    }
  }
}
