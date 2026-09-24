import { DelayedDispatchQueue } from './DelayedDispatchQueue'
import type { WireSendResult, WireSink } from './wireSlotGovernor'
import type { WireSenderId } from '../types/rigs'

/** Time and timers, so the publisher's injected fakes drive the hold in tests. */
export interface WireOutputDelayTiming {
  now(): number
  setTimer(cb: () => void, ms: number): ReturnType<typeof setTimeout>
  clearTimer(handle: ReturnType<typeof setTimeout>): void
}

/** A frame waiting out the delay, with the resolver its caller's promise settles through. */
interface HeldSend {
  wireId: WireSenderId
  buffer: Record<number, number>
  settle: (result: WireSendResult) => void
}

/**
 * Holds wire output for the lag compensation delay, leaving the IPC preview alone.
 *
 * Wire and preview come from one computed frame, and only the fixtures are immediate: a preview is
 * already late by its display's latency. Holding upstream would move both and correct neither.
 *
 * Sits below the output-rate governor, so the governor's dirty-skip and trailing timers stay on
 * real time. The buffer is copied on the way in because the governor reuses one per slot, and the
 * sender's promise is passed back so a failed send still reaches it. Every send settles: a held
 * frame that is dropped resolves `'dropped'`.
 */
export class WireOutputDelay implements WireSink {
  private readonly queue: DelayedDispatchQueue<HeldSend>
  private passThrough = false

  constructor(
    private readonly sender: WireSink,
    timing: WireOutputDelayTiming,
    private readonly getDelayMs: () => number,
  ) {
    this.queue = new DelayedDispatchQueue<HeldSend>(
      (held) => {
        this.sender.send(held.wireId, held.buffer).then(held.settle, () => held.settle(false))
      },
      this.getDelayMs,
      {
        now: () => timing.now(),
        setTimer: (cb, ms) => timing.setTimer(cb, ms),
        clearTimer: (handle) => timing.clearTimer(handle),
      },
    )
  }

  public send(wireId: WireSenderId, buffer: Record<number, number>): Promise<WireSendResult> {
    // A frame goes straight out only with nothing held, so frames still waiting after the delay
    // drops to 0 leave ahead of it.
    if (this.passThrough || (this.getDelayMs() <= 0 && this.queue.pending === 0)) {
      return this.sender.send(wireId, buffer)
    }
    return new Promise<WireSendResult>((settle) => {
      this.queue.enqueue({ wireId, buffer: { ...buffer }, settle })
    })
  }

  /**
   * Runs an emission without the hold, for a control the operator expects to act now: blackout,
   * master dimmer, the strobe gate. Frames queued before the change are stale the moment it lands,
   * so they are dropped rather than allowed to arrive after it.
   */
  public emitNow(emit: () => void): void {
    this.clear()
    this.passThrough = true
    try {
      emit()
    } finally {
      this.passThrough = false
    }
  }

  /** Drops what is held. Synchronous, so a caller can clear before blacking out. */
  public clear(): void {
    for (const held of this.queue.clear()) {
      held.settle('dropped')
    }
  }
}
