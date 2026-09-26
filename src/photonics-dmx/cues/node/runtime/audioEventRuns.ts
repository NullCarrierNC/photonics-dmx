import type { CueData } from '../../types/cueTypes'
import type { AudioCueData } from '../../types/audioCueTypes'
import type { AudioEventExecutionPolicy, BaseEventNode } from '../../types/nodeCueTypes'
import type { NodeExecutionEngine } from './NodeExecutionEngine'

/**
 * Starts the graph runs of an audio cue's events under each event's execution policy.
 *
 * `continuous` starts every run straight away and tracks nothing. The other policies allow one run
 * in flight per event, tracked here by a token its completion callback checks, so a run that was
 * cancelled or superseded never clears the slot of the run that replaced it. A run that never
 * completes holds its event's slot until the cue stops.
 */
export class AudioEventRuns {
  private readonly running = new Map<string, object>()
  /** The newest frame waiting behind a `latest-pending` run, per event id. */
  private readonly pending = new Map<string, CueData | AudioCueData>()

  start(
    engine: NodeExecutionEngine,
    event: BaseEventNode,
    policy: AudioEventExecutionPolicy = 'continuous',
    data: CueData | AudioCueData,
  ): void {
    if (policy === 'continuous') {
      engine.startExecution(event, data)
      return
    }
    if (this.running.has(event.id)) {
      if (policy === 'ignore-while-running') return
      if (policy === 'latest-pending') {
        this.pending.set(event.id, data)
        return
      }
      engine.cancelEventRuns(event.id)
    }
    this.run(engine, event, data)
  }

  /** Forget every tracked run, for a cue whose engine has been cancelled. */
  clear(): void {
    this.running.clear()
    this.pending.clear()
  }

  private run(
    engine: NodeExecutionEngine,
    event: BaseEventNode,
    data: CueData | AudioCueData,
  ): void {
    const token = {}
    this.running.set(event.id, token)
    engine.startExecutionWithCallback(event, data, () => {
      if (this.running.get(event.id) !== token) return
      this.running.delete(event.id)
      const next = this.pending.get(event.id)
      if (next === undefined) return
      this.pending.delete(event.id)
      this.run(engine, event, next)
    })
  }
}
