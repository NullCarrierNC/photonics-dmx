import type { SenderManager } from './SenderManager'
import type { WireSenderId } from '../types/rigs'

export type TimerHandle = ReturnType<typeof setTimeout>

/** Clock and timer seam, so the governor is deterministic under test. */
export interface GovernorTiming {
  now(): number
  setTimer(cb: () => void, ms: number): TimerHandle
  clearTimer(handle: TimerHandle): void
}

/**
 * Per-wire-sender working state. One instance per active wire-sender slot. The publisher merges
 * routed rig channels into `buffer` each frame, then the governor runs the dirty-skip / leading /
 * trailing rules against that slot's own history. Slots are created lazily as senders become
 * enabled and discarded when senders are disabled.
 */
export interface SenderSlotState {
  /** Per-frame working buffer, rebuilt each frame and reused to limit GC. */
  buffer: Record<number, number>
  /** Wall time of the last actual send. 0 = none yet (leading edge fires immediately). */
  lastSendTimeMs: number
  /** Last buffer actually handed to the sender, used for dirty-skip. */
  lastSentBuffer: Record<number, number>
  hasLastSent: boolean
  /** Snapshot of the most recent rate-limited frame, flushed by the trailing timer. */
  pendingBuffer: Record<number, number>
  hasPending: boolean
  trailingTimer: TimerHandle | null
  /**
   * Channels this slot wrote on the previous frame. A channel that stops being addressed is
   * written as 0 rather than dropped, so a fixture whose rig was deactivated goes dark instead of
   * holding its last value. It also makes the wire senders agree: the sACN library zero-fills
   * channels absent from a frame while the Art-Net one merges them against a retained universe.
   */
  lastWrittenChannels: Set<number>
}

function makeSlotState(): SenderSlotState {
  return {
    buffer: {},
    lastSendTimeMs: 0,
    lastSentBuffer: {},
    hasLastSent: false,
    pendingBuffer: {},
    hasPending: false,
    trailingTimer: null,
    lastWrittenChannels: new Set(),
  }
}

/** Copy `src` into the persistent `dest` object (clear-then-fill) to keep allocations down. */
function snapshotInto(dest: Record<number, number>, src: Record<number, number>): void {
  for (const key of Object.keys(dest)) {
    delete dest[Number(key)]
  }
  for (const [k, v] of Object.entries(src)) {
    dest[Number(k)] = v
  }
}

function buffersEqual(a: Record<number, number>, b: Record<number, number>): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) {
    return false
  }
  for (const k of aKeys) {
    if (a[Number(k)] !== b[Number(k)]) {
      return false
    }
  }
  return true
}

/**
 * Output governor for the wire senders.
 *
 * The publisher runs every frame, because the strobe peak-hold state machine depends on seeing
 * every blended frame, but the actual send is governed here so weak adapters are not fed at the
 * render tick rate. Each slot keeps its own timing and dirty-skip cache, so traffic on one sender
 * does not suppress traffic on another, while the interval itself is a global preference.
 */
export class WireSlotGovernor {
  private readonly slots: Map<WireSenderId, SenderSlotState> = new Map()

  constructor(
    private readonly sender: SenderManager,
    private readonly timing: GovernorTiming,
    private minIntervalMs: number,
  ) {}

  /** Min ms between sends. 0 disables the gate, sending every frame with no dirty-skip. */
  setMinIntervalMs(ms: number): void {
    this.minIntervalMs = ms
  }

  slotFor(wireId: WireSenderId): SenderSlotState {
    let slot = this.slots.get(wireId)
    if (!slot) {
      slot = makeSlotState()
      this.slots.set(wireId, slot)
    }
    return slot
  }

  /**
   * Drops state for slots that are no longer enabled, cancelling any in-flight trailing timer.
   * A stale timer that already fired hits a disabled sender, which silently no-ops.
   */
  reconcile(activeIds: Set<WireSenderId>): void {
    for (const [wireId, slot] of this.slots) {
      if (!activeIds.has(wireId)) {
        this.cancelTrailing(slot)
        this.slots.delete(wireId)
      }
    }
  }

  /**
   * Writes an explicit 0 for every channel this slot addressed last frame but not this one, then
   * records what it is writing now, so a fixture that drops out of the frame goes dark.
   */
  releaseUnwrittenChannels(slot: SenderSlotState): void {
    for (const channel of slot.lastWrittenChannels) {
      if (slot.buffer[channel] === undefined) {
        slot.buffer[channel] = 0
      }
    }
    slot.lastWrittenChannels.clear()
    for (const key of Object.keys(slot.buffer)) {
      slot.lastWrittenChannels.add(Number(key))
    }
  }

  /** Run this frame's buffer for one slot through the gate. */
  dispatch(wireId: WireSenderId, slot: SenderSlotState): void {
    if (this.minIntervalMs <= 0) {
      this.sendNow(wireId, slot, slot.buffer)
      return
    }

    if (slot.hasLastSent && buffersEqual(slot.buffer, slot.lastSentBuffer)) {
      // Latest intent already matches the wire, and any earlier deferred frame is superseded.
      this.cancelTrailing(slot)
      return
    }

    const now = this.timing.now()
    const elapsed = now - slot.lastSendTimeMs
    if (!slot.hasLastSent || elapsed >= this.minIntervalMs) {
      this.cancelTrailing(slot)
      slot.lastSendTimeMs = now
      this.sendNow(wireId, slot, slot.buffer)
      return
    }

    // Within the rate window: keep the latest frame and arm a trailing flush if not already.
    snapshotInto(slot.pendingBuffer, slot.buffer)
    slot.hasPending = true
    if (slot.trailingTimer === null) {
      const delay = this.minIntervalMs - elapsed
      slot.trailingTimer = this.timing.setTimer(() => this.flushTrailing(wireId, slot), delay)
    }
  }

  /** Reset every slot so output resumes on a leading edge. */
  resetAll(): void {
    for (const slot of this.slots.values()) {
      this.cancelTrailing(slot)
      slot.lastSendTimeMs = 0
      slot.hasLastSent = false
      for (const key of Object.keys(slot.lastSentBuffer)) {
        delete slot.lastSentBuffer[Number(key)]
      }
    }
  }

  /** Cancel every timer and forget every slot. */
  dispose(): void {
    for (const slot of this.slots.values()) {
      this.cancelTrailing(slot)
    }
    this.slots.clear()
  }

  /** Trailing-timer callback: emit the most recent rate-limited frame for this slot. */
  private flushTrailing(wireId: WireSenderId, slot: SenderSlotState): void {
    slot.trailingTimer = null
    if (!slot.hasPending) {
      return
    }
    slot.hasPending = false
    if (slot.hasLastSent && buffersEqual(slot.pendingBuffer, slot.lastSentBuffer)) {
      return
    }
    slot.lastSendTimeMs = this.timing.now()
    this.sendNow(wireId, slot, slot.pendingBuffer)
  }

  private sendNow(
    wireId: WireSenderId,
    slot: SenderSlotState,
    buffer: Record<number, number>,
  ): void {
    const delivered = this.sender.send(wireId, buffer)
    if (this.minIntervalMs <= 0) {
      return
    }
    snapshotInto(slot.lastSentBuffer, buffer)
    slot.hasLastSent = true
    // Senders report failure asynchronously, so the dirty-skip cache is provisional: drop it when
    // the send turns out to have failed, so a static scene sends its frame again.
    void delivered.then((ok) => {
      if (!ok) {
        slot.hasLastSent = false
      }
    })
  }

  private cancelTrailing(slot: SenderSlotState): void {
    if (slot.trailingTimer !== null) {
      this.timing.clearTimer(slot.trailingTimer)
      slot.trailingTimer = null
    }
    slot.hasPending = false
  }
}
