import * as FakeTimers from '@sinonjs/fake-timers'
import type { InstalledClock } from '@sinonjs/fake-timers'
import { performance as nodePerformance } from 'perf_hooks'

/**
 * Coherent virtual clock for headless cue simulation.
 *
 * The lighting runtime reads time from three independent APIs:
 * - `performance.now()` — sequencer frame timing plus all interval/duration math (cue history,
 *   consistency windows, throttles, cooldowns; see `monotonicNowMs`).
 * - `Date.now()` — wall-clock timestamps only (IDs, persisted metadata, renderer event payloads).
 * - `setTimeout` — graph `delay` waits (see {@link BaseNodeExecutionEngine}).
 *
 * To run a cue faster than (and decoupled from) wall-clock time, all three must advance
 * together. `@sinonjs/fake-timers` (the same engine Jest uses) fakes them from a single
 * clock, so advancing it steps `setTimeout`, `Date` and `performance` in lockstep.
 *
 * VirtualTime additionally implements the `Clock` surface the {@link Sequencer} expects
 * (`onTick`/`offTick`/getters), driving one sequencer frame per `frameStepMs` while it
 * advances. Use it both from the CLI and from Jest (it replaces the `jest.spyOn(performance)`
 * approach used by the legacy in-process harness).
 */
export interface VirtualTimeOptions {
  /** Sequencer frame granularity in ms; production `Clock` defaults to 10 ms. */
  frameStepMs?: number
}

export class VirtualTime {
  /**
   * The sinon clock and the `performance.now` patch are process-global, so exactly one VirtualTime
   * owns them at a time. The owner is tracked here so the next install can reclaim them from an
   * instance that never disposed (a Jest test that times out before its `finally` runs), and so a
   * dispose only tears down globals it still owns.
   */
  private static activeInstance: VirtualTime | null = null

  private clock: InstalledClock | null = null
  private readonly subscribers = new Set<(deltaMs: number) => void>()
  private readonly frameStepMs: number
  private tickCount = 0
  private originalPerformanceNow: (() => number) | null = null

  constructor(options: VirtualTimeOptions = {}) {
    this.frameStepMs = Math.max(1, Math.min(100, options.frameStepMs ?? 10))
  }

  /** Install the fake timers. Must run before any runtime module captures a timer reference. */
  public install(): void {
    if (this.clock) {
      throw new Error('VirtualTime is already installed')
    }
    // Reclaim the globals from an instance that never disposed. Running before the capture below
    // keeps `originalPerformanceNow` pointing at the real function.
    VirtualTime.activeInstance?.dispose()
    this.clock = FakeTimers.install({
      now: 0,
      // `performance` is patched directly below rather than via fake-timers: the Sequencer holds
      // a `perf_hooks` reference captured at import, and fake-timers swaps the global instead of
      // patching that object in place, which would leave the sequencer on real wall-clock time.
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    })
    VirtualTime.activeInstance = this
    this.tickCount = 0
    const perf = nodePerformance as unknown as { now: () => number }
    this.originalPerformanceNow = perf.now.bind(perf)
    perf.now = () => (this.clock ? this.clock.now : 0)
  }

  /**
   * Restore the real timers. Safe to call more than once, and safe to call late: the globals are
   * touched only while this instance still owns them, so a superseded instance leaves the current
   * owner's clock and `performance.now` intact.
   */
  public dispose(): void {
    if (VirtualTime.activeInstance === this) {
      if (this.originalPerformanceNow) {
        ;(nodePerformance as unknown as { now: () => number }).now = this.originalPerformanceNow
      }
      this.clock?.uninstall()
      VirtualTime.activeInstance = null
    }
    this.originalPerformanceNow = null
    this.clock = null
    this.subscribers.clear()
  }

  public isInstalled(): boolean {
    return this.clock !== null
  }

  /**
   * Advance virtual time by `totalMs`, firing due `setTimeout`s and driving one sequencer
   * frame per `frameStepMs`. Awaiting lets any promise chains spawned by graph execution
   * (which interleave with `setTimeout`) settle before returning.
   */
  public async advance(totalMs: number): Promise<void> {
    if (!this.clock) {
      throw new Error('VirtualTime.advance called before install()')
    }
    if (totalMs < 0) {
      throw new Error(`VirtualTime.advance requires a non-negative duration (got ${totalMs})`)
    }
    let remaining = totalMs
    while (remaining > 1e-6) {
      const step = Math.min(this.frameStepMs, remaining)
      // Advance Date/performance/setTimeout first so timer callbacks that fire within this
      // step observe end-of-step time, then run the sequencer frame for the same instant.
      await this.clock.tickAsync(step)
      this.tickCount += 1
      for (const cb of Array.from(this.subscribers)) {
        cb(step)
      }
      remaining -= step
    }
  }

  // ---- Clock-compatible surface consumed by Sequencer -----------------------

  public onTick(callback: (deltaMs: number) => void): void {
    this.subscribers.add(callback)
  }

  public offTick(callback: (deltaMs: number) => void): void {
    this.subscribers.delete(callback)
  }

  public start(): void {
    // No-op: frames are driven explicitly by advance().
  }

  public stop(): void {
    // No-op: frames are driven explicitly by advance().
  }

  public isActive(): boolean {
    return true
  }

  public getCurrentTimeMs(): number {
    return this.clock ? this.clock.now : 0
  }

  public getAbsoluteTimeMs(): number {
    return this.clock ? this.clock.now : 0
  }

  public getTickCount(): number {
    return this.tickCount
  }
}
