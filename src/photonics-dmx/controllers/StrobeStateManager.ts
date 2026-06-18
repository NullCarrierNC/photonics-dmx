import { EventEmitter } from 'events'
import type { StrobeSpeedSlot } from '../cues/types/cueTypes'

/**
 * Tracks the currently active strobe speed slot so DMX publishing can drive hardware-strobe-channel
 * fixtures. Cue handlers (YARG/Audio/RB3) call {@link setActive} when a strobe cue takes/relinquishes
 * the strobe slot; the {@link DmxPublisher} consults {@link getActive} each publish tick.
 *
 * Implemented as a small typed event emitter; consumers may subscribe to "change" if they need
 * push semantics, but the default usage is poll-per-frame.
 */
export class StrobeStateManager extends EventEmitter {
  private active: StrobeSpeedSlot | null = null

  public setActive(slot: StrobeSpeedSlot | null): void {
    if (this.active === slot) {
      return
    }
    this.active = slot
    this.emit('change', slot)
  }

  public getActive(): StrobeSpeedSlot | null {
    return this.active
  }
}

let _instance: StrobeStateManager | null = null

/** Returns the process-wide {@link StrobeStateManager}. Lazily created on first call. */
export function getStrobeStateManager(): StrobeStateManager {
  if (!_instance) {
    _instance = new StrobeStateManager()
  }
  return _instance
}

/** Test-only: drops the singleton so the next call creates a fresh instance. */
export function __resetStrobeStateManagerForTests(): void {
  _instance = null
}
