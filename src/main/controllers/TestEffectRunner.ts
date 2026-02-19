import { CueData, StrobeState, getCueTypeFromId } from '../../photonics-dmx/cues/types/cueTypes'
import { YargCueHandler } from '../../photonics-dmx/cueHandlers/YargCueHandler'
import { sendToAllWindows } from '../utils/windowUtils'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import type { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'

export interface TestEffectRunnerContext {
  getConfig: () => { getPreference: (key: string) => number }
  getCueHandler: () => YargCueHandler | null
  getEffectsController: () => ILightingController | null
  getDmxLightManager: () => DmxLightManager | null
  ensureInitialized: () => Promise<void>
  createCueHandler: (
    dmxLightManager: DmxLightManager,
    effectsController: ILightingController,
    debouncePeriod: number,
  ) => YargCueHandler
  setCueHandler: (handler: YargCueHandler | null) => void
}

/**
 * Runs test effects (interval-driven cue firing for UI preview)
 */
export class TestEffectRunner {
  private testEffectInterval: NodeJS.Timeout | null = null
  private testVenueSize: 'NoVenue' | 'Small' | 'Large' = 'Large'
  private testBpm = 120
  private effectId: string | null = null

  constructor(private readonly ctx: TestEffectRunnerContext) {}

  public startTestEffect(
    effectId: string,
    venueSize?: 'NoVenue' | 'Small' | 'Large',
    bpm?: number,
  ): void {
    console.log(
      `TestEffectRunner.startTestEffect effectId: ${effectId}, venueSize: ${venueSize}, BPM: ${bpm}`,
    )

    if (this.testEffectInterval) {
      clearInterval(this.testEffectInterval)
      this.testEffectInterval = null
    }

    this.testVenueSize = venueSize ?? 'Large'
    this.testBpm = bpm ?? 120
    this.effectId = effectId
    console.log(`Set testVenueSize to: ${this.testVenueSize}, testBpm to: ${this.testBpm}`)

    this.ctx
      .ensureInitialized()
      .then(() => {
        this.startInternal()
      })
      .catch((error: unknown) => {
        console.error('Error during initialization:', error)
      })
  }

  public async stopTestEffect(): Promise<void> {
    if (this.testEffectInterval) {
      clearInterval(this.testEffectInterval)
      this.testEffectInterval = null
    }
    this.effectId = null

    const cueHandler = this.ctx.getCueHandler()
    if (cueHandler instanceof YargCueHandler) {
      cueHandler.stopActiveCue()
    }

    const effectsController = this.ctx.getEffectsController()
    if (effectsController) {
      await effectsController.blackout(0)
    }
  }

  private startInternal(): void {
    const effectsController = this.ctx.getEffectsController()
    const dmxLightManager = this.ctx.getDmxLightManager()
    if (!effectsController || !dmxLightManager) {
      console.error('Cannot test effect: lighting system not initialized')
      return
    }

    let cueHandler = this.ctx.getCueHandler()
    if (!cueHandler) {
      console.log('Creating temporary YARG cue handler for testing')
      const debouncePeriod = this.ctx.getConfig().getPreference('effectDebounce')
      cueHandler = this.ctx.createCueHandler(dmxLightManager, effectsController, debouncePeriod)
      this.ctx.setCueHandler(cueHandler)
    }

    const effectId = this.effectId
    if (!effectId) return

    this.testEffectInterval = setInterval(() => {
      this.testCue(effectId)
    }, 16)
  }

  private testCue(cueId: string): void {
    const cueHandler = this.ctx.getCueHandler()
    if (!cueHandler) {
      console.error('No cue handler available. Make sure YARG or RB3 is enabled.')
      return
    }

    const cue = getCueTypeFromId(cueId)
    let strobe: StrobeState = 'Strobe_Off' as StrobeState
    if (cueId.indexOf('Strobe') > -1) {
      strobe = cueId as StrobeState
    }

    const data: CueData = {
      datagramVersion: 0,
      platform: 'Windows',
      currentScene: 'Gameplay',
      pauseState: 'Unpaused',
      venueSize: this.testVenueSize,
      beatsPerMinute: this.testBpm,
      songSection: 'Verse',
      guitarNotes: [],
      bassNotes: [],
      drumNotes: [],
      keysNotes: [],
      vocalNote: 0,
      harmony0Note: 0,
      harmony1Note: 0,
      harmony2Note: 0,
      lightingCue: cueId,
      postProcessing: 'Default',
      fogState: false,
      strobeState: strobe,
      performer: 0,
      trackMode: 'simulated',
      beat: 'Off',
      keyframe: 'Off',
      bonusEffect: false,
      ledColor: '',
    }

    if (cue !== undefined) {
      try {
        cueHandler.handleCue(cue, data)
        sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, data)
      } catch (error) {
        console.error('Error handling cue:', error)
      }
    } else {
      console.error('\n Test Cue Error: no cue for ID ', cueId)
    }
  }
}
