import { DmxLightManager } from './DmxLightManager'
import { LightStateManager } from './sequencer/LightStateManager'
import { LightTransitionController } from './sequencer/LightTransitionController'
import { Sequencer } from './sequencer/Sequencer'
import { Clock } from './sequencer/Clock'
import { LightingConfiguration } from '../types'
import { YargCueHandler } from '../cueHandlers/YargCueHandler'
import { AudioCueHandler } from '../cueHandlers/AudioCueHandler'
import { Rb3MenuCueHandler } from '../cueHandlers/Rb3MenuCueHandler'
import { YargCueRegistry } from '../cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry'
import { applyMirrorToConfig, RigMirror } from '../helpers/mirrorRig'
import { createLogger } from '../../shared/logger'

const log = createLogger('RigChain')

export interface RigChainOptions {
  rigId: string
  config: LightingConfiguration
  clock: Clock
  /**
   * When multiple chains run the same cue in parallel, only the primary chain's handlers
   * should emit renderer broadcasts (motion-cue change, cue-handled, etc.) so the UI sees
   * one event per logical cue rather than one per rig.
   */
  isPrimary?: boolean
  /**
   * Per-rig mirror flags. When set, the `LightingConfiguration` passed to this chain's
   * `DmxLightManager` is transformed at construction time (positions reversed within each
   * row for `horiz`; front/back swapped for `vert`). See `helpers/mirrorRig.ts` for details.
   */
  mirror?: RigMirror
}

/**
 * Bundles the per-rig pieces of the cue / sequencer / effect pipeline into a single owner:
 * the rig's `DmxLightManager` (group/target resolution against that rig's lights), its own
 * `LightStateManager` + `LightTransitionController` (per-rig effect blending), and a
 * `Sequencer` ticked by an externally-owned shared `Clock`.
 *
 * The clock is passed in rather than created internally so several chains can share one
 * tick source and stay in lockstep when they're all driving the same cue against their own
 * light layouts.
 */
export class RigChain {
  public readonly rigId: string
  public readonly dmxLightManager: DmxLightManager
  public readonly lightStateManager: LightStateManager
  public readonly lightTransitionController: LightTransitionController
  public readonly sequencer: Sequencer
  public readonly isPrimary: boolean

  /**
   * Per-rig cue handler slots. Populated lazily by the listener controllers when each
   * listener enables (YARG / RB3 / audio), cleared on disable. Each handler is bound to
   * this chain's sequencer + light manager so events resolve against this rig's lights.
   */
  public yargCueHandler: YargCueHandler | null = null
  public audioCueHandler: AudioCueHandler | null = null
  public rb3MenuCueHandler: Rb3MenuCueHandler | null = null

  constructor(options: RigChainOptions) {
    this.rigId = options.rigId
    this.isPrimary = options.isPrimary ?? true
    const effectiveConfig = applyMirrorToConfig(options.config, options.mirror ?? {})
    this.dmxLightManager = new DmxLightManager(effectiveConfig)
    this.lightStateManager = new LightStateManager()
    this.lightTransitionController = new LightTransitionController(this.lightStateManager)
    this.sequencer = new Sequencer(this.lightTransitionController, options.clock)
  }

  /**
   * Tear down the chain's own resources. Any cue handlers populated by a listener
   * controller are shut down first so their effect cleanup runs against the sequencer
   * before it's torn down. The `Clock` passed in at construction is **not** stopped — its
   * lifecycle belongs to the caller so multiple chains can share one tick source without
   * one chain's teardown stopping ticks for the others.
   */
  public async dispose(): Promise<void> {
    if (this.yargCueHandler) {
      try {
        this.yargCueHandler.shutdown()
      } catch (err) {
        log.error(`Error shutting down YARG cue handler for rig ${this.rigId}:`, err)
      }
      this.yargCueHandler = null
    }
    if (this.audioCueHandler) {
      try {
        this.audioCueHandler.destroy()
      } catch (err) {
        log.error(`Error shutting down audio cue handler for rig ${this.rigId}:`, err)
      }
      this.audioCueHandler = null
    }
    if (this.rb3MenuCueHandler) {
      try {
        this.rb3MenuCueHandler.shutdown()
      } catch (err) {
        log.error(`Error shutting down RB3 menu cue handler for rig ${this.rigId}:`, err)
      }
      this.rb3MenuCueHandler = null
    }
    // Notify every registered cue that this chain's sequencer is going away so cue impls
    // can drop their per-sequencer runtime state. Without this the cue singletons would
    // hold one stale state entry per disposed chain after every `restartControllers` cycle.
    try {
      YargCueRegistry.getInstance().releaseSequencerFromAllCues(this.sequencer)
    } catch (err) {
      log.error(`Error releasing sequencer from YARG cues for rig ${this.rigId}:`, err)
    }
    try {
      AudioCueRegistry.getInstance().releaseSequencerFromAllCues(this.sequencer)
    } catch (err) {
      log.error(`Error releasing sequencer from audio cues for rig ${this.rigId}:`, err)
    }
    try {
      this.sequencer.shutdown()
    } catch (err) {
      log.error(`Error shutting down sequencer for rig ${this.rigId}:`, err)
    }
    try {
      this.lightStateManager.shutdown()
    } catch (err) {
      log.error(`Error shutting down light state manager for rig ${this.rigId}:`, err)
    }
    try {
      this.dmxLightManager.shutdown()
    } catch (err) {
      log.error(`Error shutting down dmx light manager for rig ${this.rigId}:`, err)
    }
  }
}
