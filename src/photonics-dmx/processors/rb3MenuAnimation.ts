import type { Rb3MenuCueDispatch } from '../cueHandlers/Rb3MenuCueHandler'
import { createLogger } from '../../shared/logger'

const log = createLogger('rb3-menu-animation')

/** Menu-look re-render cadence shared by the RB3 direct and cue processors. */
export const RB3_MENU_ANIMATION_MS = 1000

export interface Rb3MenuFramePumpOptions {
  /** Resolves the menu dispatch at call time so a handler swapped in later is picked up. */
  getDispatch: () => Rb3MenuCueDispatch | null
  /** Gates each frame; a stale timer tick paints nothing once the processor leaves the menu. */
  isActive: () => boolean
  /** Paint a frame immediately on start rather than waiting one interval. */
  immediateFirstFrame: boolean
  /** start() while running restarts the interval (stopping first) instead of keeping it. */
  restartOnStart: boolean
  intervalMs?: number
}

/**
 * Re-renders the RB3 menu look on a fixed cadence through a menu dispatch's `playMenuFrame`.
 * `stop()` clears the interval and, when frames could have painted, clears the menu look.
 * A throwing menu handler is logged and the pump keeps running.
 */
export class Rb3MenuFramePump {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly options: Rb3MenuFramePumpOptions) {}

  start(): void {
    if (this.timer) {
      if (!this.options.restartOnStart) return
      this.stop()
    }
    if (!this.options.getDispatch()) {
      log.warn('Cannot start the menu animation - no menu dispatch available')
      return
    }
    this.timer = setInterval(
      () => this.paintFrame(),
      this.options.intervalMs ?? RB3_MENU_ANIMATION_MS,
    )
    if (this.options.immediateFirstFrame) {
      this.paintFrame()
    }
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    this.options.getDispatch()?.clear()
  }

  isRunning(): boolean {
    return this.timer !== null
  }

  private paintFrame(): void {
    if (!this.options.isActive()) return
    try {
      this.options.getDispatch()?.playMenuFrame()
    } catch (error) {
      log.error('Error in menu cue playMenuFrame:', error)
    }
  }
}
