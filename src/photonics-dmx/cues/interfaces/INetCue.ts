import { CueData } from '../types/cueTypes'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../controllers/DmxLightManager'

export enum CueStyle {
  Primary = 'primary',
  Secondary = 'secondary',
}

export interface INetCue {
  /**
   * The YARG ID of the cue
   */
  cueId: string

  /**
   * The Photonics ID of the cue instance
   */
  id: string

  /**
   * Description of the cue effect's appearance
   */
  description?: string

  /**
   * Style of the cue based on layer usage:
   * - Primary: A new primary replaces the current primary
   * - Secondary: Overlay effect on higher layers; runs concurrently with the primary and
   *   replaces the current non-strobe secondary overlay
   *
   * Strobes are a handler-level concept identified by cue type rather than a third style value.
   * They run on the highest layers and may coexist with both a primary and a non-strobe secondary.
   */
  style: CueStyle

  /**
   * Execute the cue with the given parameters
   * @param parameters The cue parameters
   * @param sequencer The lighting controller
   * @param lightManager The DMX light manager
   */
  execute(
    parameters: CueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): void | Promise<void>

  /**
   * Called when the cue is stopped or being replaced by another cue
   * Use this to clean up any persistent state (static variables, timers, etc.)
   */
  onStop?(): void

  /**
   * Called when the cue is paused
   */
  onPause?(): void

  /**
   * Called when the cue is completely removed/destroyed
   * Use this for final cleanup of resources
   */
  onDestroy?(): void
}
