import { EventEmitter } from 'events'
import type { StrobeSpeedSlot } from '../cues/types/cueTypes'

/** Which family of cues put the current strobe on the slot. */
export type StrobeOwner = 'net' | 'audio'

/**
 * Tracks the currently active strobe speed slot so DMX publishing can drive hardware-strobe-channel
 * fixtures. Cue handlers (YARG/Audio/RB3) call {@link setActive} when a strobe cue takes or gives up
 * the strobe slot, and the {@link DmxPublisher} consults {@link getActive} each publish tick. The
 * app's one instance lives on its ChainFanout and is handed to both.
 *
 * The slot remembers who took it. Audio and the net domains can run at once, and each ends its own
 * cues without knowing about the other, so an unqualified release would let one of them stop a
 * strobe the other is still running. Taking the slot is not restricted, since a starting strobe is
 * a deliberate act and the later one wins.
 *
 * Implemented as a small typed event emitter; consumers may subscribe to "change" if they need
 * push semantics, but the default usage is poll-per-frame.
 */
export class StrobeStateManager extends EventEmitter {
  private active: StrobeSpeedSlot | null = null
  private owner: StrobeOwner | null = null

  public setActive(slot: StrobeSpeedSlot | null, owner: StrobeOwner): void {
    if (slot === null && this.owner !== null && this.owner !== owner) {
      return
    }
    this.owner = slot === null ? null : owner
    if (this.active === slot) {
      return
    }
    this.active = slot
    this.emit('change', slot)
  }

  /** Give up the slot whoever holds it. For a teardown that is taking everything down with it. */
  public reset(): void {
    this.owner = null
    if (this.active === null) {
      return
    }
    this.active = null
    this.emit('change', null)
  }

  public getActive(): StrobeSpeedSlot | null {
    return this.active
  }
}
