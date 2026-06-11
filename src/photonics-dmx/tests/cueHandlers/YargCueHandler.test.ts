/**
 * Regression: re-enabling YARG mid-song must replay the current cue.
 *
 * `YargNodeCue` instances are singletons in `YargCueRegistry`, so their
 * `CueSession` (which gates `cue-started`) survives a YARG disable. The handler's
 * shutdown must call `onStop()` on each tracked slot so the next activation can
 * fire `cue-started` from a clean state.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import { YargCueHandler } from '../../cueHandlers/YargCueHandler'
import { monotonicNowMs } from '../../../shared/time'
import { YargCueRegistry } from '../../cues/registries/YargCueRegistry'
import { CueStyle, INetCue } from '../../cues/interfaces/INetCue'
import { CueData, CueType, defaultCueData } from '../../cues/types/cueTypes'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import {
  getStrobeStateManager,
  __resetStrobeStateManagerForTests,
} from '../../controllers/StrobeStateManager'

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
    onVocalNote: jest.fn(),
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
    internals.currentMotionCueStartTime = monotonicNowMs()

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

  it('shutdown clears shared strobe state even when no strobe cue was active (Fix 2)', () => {
    __resetStrobeStateManagerForTests()
    // Simulate a stale slot left by a prior interrupted strobe (no Strobe_Off received).
    getStrobeStateManager().setActive('fast')
    expect(getStrobeStateManager().getActive()).toBe('fast')

    const handler = new YargCueHandler(makeLightManager(), makeSequencer())
    // No currentStrobeCue set — old code only cleared when one was present.
    handler.shutdown()

    expect(getStrobeStateManager().getActive()).toBeNull()
  })
})

describe('YargCueHandler strobe history isolation', () => {
  beforeEach(() => {
    __resetStrobeStateManagerForTests()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('a held strobe does not thrash the primary cue executionCount', async () => {
    const registry = YargCueRegistry.getInstance()
    const primary = makeFakeCue(CueStyle.Primary, 'frenzy')
    const strobe = makeFakeCue(CueStyle.Primary, 'strobe')
    jest
      .spyOn(registry, 'getCueImplementation')
      .mockImplementation((cueType) =>
        cueType === CueType.Frenzy ? primary : cueType === CueType.Strobe_Fast ? strobe : null,
      )

    const handler = new YargCueHandler(makeLightManager(), makeSequencer())
    const execCounts: Array<number | undefined> = []
    handler.addCueHandledListener((data) => execCounts.push(data.executionCount))

    await handler.handleCue(CueType.Frenzy, gameplayCueData({ lightingCue: CueType.Frenzy }))
    await handler.handleCue(CueType.Strobe_Fast, gameplayCueData({ lightingCue: CueType.Frenzy }))
    await handler.handleCue(CueType.Frenzy, gameplayCueData({ lightingCue: CueType.Frenzy }))

    // A strobe interleaved between two Frenzy dispatches must not touch the primary
    // executionCount: it reports the current count (1), and the second Frenzy advances to 2.
    expect(execCounts).toEqual([1, 1, 2])
    handler.shutdown()
  })
})

describe('YargCueHandler vocal note edge detection', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('fires note-on then note-off only on the active-state edges', () => {
    const sequencer = makeSequencer()
    const handler = new YargCueHandler(makeLightManager(), sequencer)
    const onVocalNote = sequencer.onVocalNote as jest.Mock

    // Silence -> no edge
    handler.handleVocalNote(gameplayCueData({ vocalNote: 0 }))
    expect(onVocalNote).not.toHaveBeenCalled()

    // Singing starts -> note-on edge (true)
    handler.handleVocalNote(gameplayCueData({ vocalNote: 0.7 }))
    expect(onVocalNote).toHaveBeenNthCalledWith(1, true)

    // Still singing (different pitch) -> no new edge
    handler.handleVocalNote(gameplayCueData({ vocalNote: 0.4 }))
    expect(onVocalNote).toHaveBeenCalledTimes(1)

    // Goes silent -> note-off edge (false)
    handler.handleVocalNote(gameplayCueData({ vocalNote: 0 }))
    expect(onVocalNote).toHaveBeenNthCalledWith(2, false)
    expect(onVocalNote).toHaveBeenCalledTimes(2)
  })

  it('treats any harmony part as singing', () => {
    const sequencer = makeSequencer()
    const handler = new YargCueHandler(makeLightManager(), sequencer)
    const onVocalNote = sequencer.onVocalNote as jest.Mock

    handler.handleVocalNote(gameplayCueData({ vocalNote: 0, harmony1Note: 0.9 }))
    expect(onVocalNote).toHaveBeenNthCalledWith(1, true)

    handler.handleVocalNote(
      gameplayCueData({ vocalNote: 0, harmony0Note: 0, harmony1Note: 0, harmony2Note: 0 }),
    )
    expect(onVocalNote).toHaveBeenNthCalledWith(2, false)
  })
})
