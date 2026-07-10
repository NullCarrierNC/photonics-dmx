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
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
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

  it('shutdown ends the registry song so once-per-song and motion locks do not leak', () => {
    const injected = YargCueRegistry.getInstance()
    const songEnd = jest.spyOn(injected, 'onSongEnd')
    const motionSongEnd = jest.spyOn(injected, 'onMotionSongEnd')
    const handler = new YargCueHandler(makeLightManager(), makeSequencer(), { registry: injected })

    handler.shutdown()

    expect(songEnd).toHaveBeenCalled()
    expect(motionSongEnd).toHaveBeenCalled()
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

describe('YargCueHandler RB3 LED edge history', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('stamps previousFrame with the prior ledBanks and fogState so LED/fog edges fire', async () => {
    const registry = YargCueRegistry.getInstance()
    const cue = makeFakeCue(CueStyle.Primary, 'rb3')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(cue)
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)
    const handler = new YargCueHandler(makeLightManager(), makeSequencer())

    const banksA = { red: 0b0001, green: 0, blue: 0, yellow: 0 }
    const banksB = { red: 0b0101, green: 0, blue: 0, yellow: 0 }
    await handler.handleCue(
      CueType.RB3,
      gameplayCueData({ lightingCue: CueType.RB3, ledBanks: banksA, fogState: true }),
    )
    await handler.handleCue(
      CueType.RB3,
      gameplayCueData({ lightingCue: CueType.RB3, ledBanks: banksB, fogState: false }),
    )

    // The frame the cue saw on the second call carries the FIRST frame's LED/fog state as previousFrame,
    // which is exactly what the led-N / fog edge conditions compare against.
    const secondFrame = cue.execute.mock.calls[1][0] as CueData
    expect(secondFrame.previousFrame?.ledBanks).toEqual(banksA)
    expect(secondFrame.previousFrame?.fogState).toBe(true)
  })
})

describe('YargCueHandler injected registry', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('resolves cues and song notifications against the injected registry, not the singleton', async () => {
    const singleton = YargCueRegistry.getInstance()
    const injected = YargCueRegistry.create()
    const cue = makeFakeCue(CueStyle.Primary, 'injected')
    jest.spyOn(injected, 'getCueImplementation').mockReturnValue(cue)
    jest.spyOn(injected, 'getRandomMotionCue').mockReturnValue(null)
    const singletonResolve = jest.spyOn(singleton, 'getCueImplementation')
    const injectedSongStart = jest.spyOn(injected, 'onSongStart')
    const singletonSongStart = jest.spyOn(singleton, 'onSongStart')

    const handler = new YargCueHandler(makeLightManager(), makeSequencer(), { registry: injected })
    handler.setMotionEnabled(false)
    handler.notifySongStart()
    await handler.handleCue(CueType.Frenzy, gameplayCueData({ lightingCue: CueType.Frenzy }))

    expect(cue.execute).toHaveBeenCalledTimes(1)
    expect(singletonResolve).not.toHaveBeenCalled()
    expect(injectedSongStart).toHaveBeenCalledTimes(1)
    expect(singletonSongStart).not.toHaveBeenCalled()
  })
})

describe('YargCueHandler Fallback motion suppression', () => {
  let registry: YargCueRegistry

  beforeEach(() => {
    registry = YargCueRegistry.getInstance()
    jest.restoreAllMocks()
  })

  it('does not pick a motion cue when the Fallback cue fires', async () => {
    const primary = makeFakeCue(CueStyle.Primary, 'primary:Fallback')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(primary)
    const getRandomMotionCue = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)

    const handler = new YargCueHandler(makeLightManager(), makeSequencer())

    await handler.handleCue(CueType.Fallback, gameplayCueData({ lightingCue: CueType.Fallback }))

    // The Fallback look still runs, but no automatic motion cue is picked.
    expect(primary.execute).toHaveBeenCalledTimes(1)
    expect(getRandomMotionCue).not.toHaveBeenCalled()
  })

  it('clears a running motion cue when the Fallback fires', async () => {
    const fallback = makeFakeCue(CueStyle.Primary, 'primary:Fallback')
    const motion = makeFakeCue(CueStyle.Primary, 'motion')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(fallback)
    const getRandomMotionCue = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)

    const sequencer = makeSequencer()
    const handler = new YargCueHandler(makeLightManager(), sequencer)

    // Seed a freshly-started motion cue from a previous (real) cue. startTime = now keeps it inside
    // the min-hold so the unpatched handler would re-execute it rather than clear it.
    const internals = handler as unknown as {
      currentMotionCue: INetCue | null
      currentMotionCueStartTime: number | null
    }
    internals.currentMotionCue = motion
    internals.currentMotionCueStartTime = monotonicNowMs()

    await handler.handleCue(CueType.Fallback, gameplayCueData({ lightingCue: CueType.Fallback }))

    // The leftover motion is stopped and the heads homed; nothing new is picked or executed.
    expect(motion.onStop).toHaveBeenCalledTimes(1)
    expect(sequencer.schedulePanTiltClear).toHaveBeenCalled()
    expect(getRandomMotionCue).not.toHaveBeenCalled()
    expect(motion.execute).not.toHaveBeenCalled()
    expect(internals.currentMotionCue).toBeNull()
  })
})

describe('YargCueHandler requestMotionRepick (RB3 external trigger)', () => {
  let registry: YargCueRegistry

  beforeEach(() => {
    registry = YargCueRegistry.getInstance()
    jest.restoreAllMocks()
  })

  function motionInternals(handler: YargCueHandler) {
    return handler as unknown as {
      currentMotionCue: INetCue | null
      currentMotionCueStartTime: number | null
      lastManualMotionRefForMotion: unknown
    }
  }

  it('swaps in a random motion cue without executing it (the frame dispatch runs it)', () => {
    const motion = makeFakeCue(CueStyle.Primary, 'motion')
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)
    jest
      .spyOn(registry, 'findYargMotionCueRef')
      .mockReturnValue({ groupId: 'rb3-motion-default', cueId: 'rb3-motion-wave' })
    const handler = new YargCueHandler(makeLightManager(), makeSequencer(), { registry })

    handler.requestMotionRepick()

    expect(motionInternals(handler).currentMotionCue).toBe(motion)
    // The swapped cue runs on the next keepalive dispatch, not from the trigger itself.
    expect(motion.execute).not.toHaveBeenCalled()
  })

  it('respects the min-hold floor (no re-pick within the hold window)', () => {
    const motion = makeFakeCue(CueStyle.Primary, 'motion')
    const getRandom = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)
    const handler = new YargCueHandler(makeLightManager(), makeSequencer(), {
      registry,
      getMotionCueMinimumHoldMs: () => 60_000,
    })
    const internals = motionInternals(handler)
    internals.currentMotionCue = motion
    internals.currentMotionCueStartTime = monotonicNowMs()
    // Neutralize the initial manual-change sync (null !== undefined) so only the min-hold gate is under test.
    internals.lastManualMotionRefForMotion = null

    handler.requestMotionRepick()

    expect(getRandom).not.toHaveBeenCalled()
    expect(internals.currentMotionCue).toBe(motion)
  })

  it('is a no-op while motion is disabled', () => {
    const getRandom = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)
    const handler = new YargCueHandler(makeLightManager(), makeSequencer(), { registry })
    handler.setMotionEnabled(false)

    handler.requestMotionRepick()

    expect(getRandom).not.toHaveBeenCalled()
  })

  it('broadcasts motion changes on the injected RB3 channel, not the YARG one', () => {
    const motion = makeFakeCue(CueStyle.Primary, 'motion')
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)
    jest
      .spyOn(registry, 'findYargMotionCueRef')
      .mockReturnValue({ groupId: 'rb3-motion-default', cueId: 'rb3-motion-wave' })
    const emit = jest.fn()
    const handler = new YargCueHandler(makeLightManager(), makeSequencer(), {
      registry,
      runtimeBroadcaster: { emit } as never,
      motionChangeChannel: RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE,
    })

    handler.requestMotionRepick()

    expect(emit).toHaveBeenCalledWith(RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE, expect.anything())
    expect(emit).not.toHaveBeenCalledWith(
      RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
      expect.anything(),
    )
  })
})
