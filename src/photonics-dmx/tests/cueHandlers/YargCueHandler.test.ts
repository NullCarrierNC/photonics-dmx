/**
 * Regression: re-enabling YARG mid-song must replay the current cue.
 *
 * `YargNodeCue` instances are singletons in `YargCueRegistry`, so their
 * `CueSession` (which gates `cue-started`) survives a YARG disable. The handler's
 * shutdown must call `onStop()` on each tracked slot so the next activation can
 * fire `cue-started` from a clean state.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('../../../main/utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

import { YargCueHandler } from '../../cueHandlers/YargCueHandler'
import { YargCueRegistry } from '../../cues/registries/YargCueRegistry'
import { CueStyle, INetCue } from '../../cues/interfaces/INetCue'
import { CueData, CueType, defaultCueData } from '../../cues/types/cueTypes'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../controllers/DmxLightManager'

type CueLifecycleMocks = {
  execute: jest.Mock
  onStop: jest.Mock
}

function makeFakeCue(style: CueStyle, id: string): INetCue & CueLifecycleMocks {
  return {
    cueId: id,
    id,
    style,
    execute: jest.fn(),
    onStop: jest.fn(),
  } as unknown as INetCue & CueLifecycleMocks
}

function makeSequencer(): ILightingController {
  return {
    schedulePanTiltClear: jest.fn(),
    cancelPanTiltClear: jest.fn(),
    blackout: jest.fn(),
    onBeat: jest.fn(),
    onMeasure: jest.fn(),
    onKeyframe: jest.fn(),
    onKeyframeFirst: jest.fn(),
    onKeyframeNext: jest.fn(),
    onKeyframePrevious: jest.fn(),
    onDrumNote: jest.fn(),
    onGuitarNote: jest.fn(),
    onBassNote: jest.fn(),
    onKeysNote: jest.fn(),
  } as unknown as ILightingController
}

function makeLightManager(): DmxLightManager {
  return {} as unknown as DmxLightManager
}

function gameplayCueData(overrides?: Partial<CueData>): CueData {
  return {
    ...defaultCueData,
    currentScene: 'Gameplay',
    trackMode: 'tracked',
    ...overrides,
  }
}

describe('YargCueHandler shutdown lifecycle', () => {
  let registry: YargCueRegistry

  beforeEach(() => {
    registry = YargCueRegistry.getInstance()
    jest.restoreAllMocks()
  })

  it('shutdown stops a primary cue that was activated via handleCue (regression: mid-song re-enable replays cue-started)', async () => {
    const primary = makeFakeCue(CueStyle.Primary, 'primary:Frenzy')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(primary)
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)

    const handler = new YargCueHandler(makeLightManager(), makeSequencer())
    handler.setMotionEnabled(false)

    await handler.handleCue(CueType.Frenzy, gameplayCueData({ lightingCue: CueType.Frenzy }))
    expect(primary.execute).toHaveBeenCalledTimes(1)

    handler.shutdown()

    expect(primary.onStop).toHaveBeenCalledTimes(1)
  })

  it('shutdown stops every tracked cue slot (primary, secondary, strobe, motion)', () => {
    const handler = new YargCueHandler(makeLightManager(), makeSequencer())

    const primary = makeFakeCue(CueStyle.Primary, 'primary')
    const secondary = makeFakeCue(CueStyle.Secondary, 'secondary')
    const strobe = makeFakeCue(CueStyle.Primary, 'strobe')
    const motion = makeFakeCue(CueStyle.Primary, 'motion')

    const internals = handler as unknown as {
      currentPrimaryCue: INetCue | null
      currentSecondaryCue: INetCue | null
      currentStrobeCue: INetCue | null
      currentMotionCue: INetCue | null
      currentMotionCueStartTime: number | null
    }
    internals.currentPrimaryCue = primary
    internals.currentSecondaryCue = secondary
    internals.currentStrobeCue = strobe
    internals.currentMotionCue = motion
    internals.currentMotionCueStartTime = Date.now()

    handler.shutdown()

    expect(primary.onStop).toHaveBeenCalledTimes(1)
    expect(secondary.onStop).toHaveBeenCalledTimes(1)
    expect(strobe.onStop).toHaveBeenCalledTimes(1)
    expect(motion.onStop).toHaveBeenCalledTimes(1)

    expect(internals.currentPrimaryCue).toBeNull()
    expect(internals.currentSecondaryCue).toBeNull()
    expect(internals.currentStrobeCue).toBeNull()
    expect(internals.currentMotionCue).toBeNull()
    expect(internals.currentMotionCueStartTime).toBeNull()
  })
})
