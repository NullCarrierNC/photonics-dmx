/**
 * Re-enabling YARG mid-song replays the current cue.
 *
 * `LightingNodeCue` instances are singletons in `CueRegistry`, so their
 * `CueSession` (which gates `cue-started`) survives a YARG disable. The handler's
 * shutdown must call `onStop()` on each tracked slot so the next activation can
 * fire `cue-started` from a clean state.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import { CueHandler } from '../../cueHandlers/CueHandler'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { monotonicNowMs } from '../../../shared/time'
import { CueRegistry } from '../../cues/registries/CueRegistry'
import { CueStyle, INetCue } from '../../cues/interfaces/INetCue'
import { CueData, CueType, defaultCueData, DrumNoteType } from '../../cues/types/cueTypes'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import {
  getStrobeStateManager,
  __resetStrobeStateManagerForTests,
} from '../../controllers/StrobeStateManager'
import { fakeLightingController } from '../helpers/fakeLightingController'
import { resetLogConfiguration, setLogSink, type LogEntry } from '../../../shared/logger'

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
  return fakeLightingController()
}

type MotionInternals = {
  currentMotionCue: INetCue | null
  currentMotionCueStartTime: number | null
  currentPick: { source: 'manual' | 'auto'; manualFallback: boolean } | null
  lastManualMotionRefForMotion: unknown
}

/** The coordinator's motion state, for cases that seed a running cue directly. */
function motionInternals(handler: CueHandler): MotionInternals {
  return handler.getMotionCoordinator() as unknown as MotionInternals
}

/** Put `cue` in place as the running motion cue, applied to this handler's chain. */
function seedRunningMotion(handler: CueHandler, cue: INetCue): void {
  const internals = motionInternals(handler)
  internals.currentMotionCue = cue
  internals.currentMotionCueStartTime = monotonicNowMs()
  internals.currentPick = { source: 'auto', manualFallback: false }
  ;(handler as unknown as { appliedMotionCue: INetCue | null }).appliedMotionCue = cue
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

describe('CueHandler shutdown lifecycle', () => {
  let registry: CueRegistry

  beforeEach(() => {
    registry = CueRegistry.getInstance()
    jest.restoreAllMocks()
  })

  it('shutdown stops a primary cue that was activated via handleCue', async () => {
    const primary = makeFakeCue(CueStyle.Primary, 'primary:Frenzy')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(primary)
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)

    const handler = new CueHandler(makeLightManager(), makeSequencer())
    handler.setMotionEnabled(false)

    await handler.handleCue(CueType.Frenzy, gameplayCueData({ lightingCue: CueType.Frenzy }))
    expect(primary.execute).toHaveBeenCalledTimes(1)

    handler.shutdown()

    expect(primary.onStop).toHaveBeenCalledTimes(1)
  })

  it('shutdown stops every tracked cue slot (primary, secondary, strobe, motion)', () => {
    const handler = new CueHandler(makeLightManager(), makeSequencer())

    const primary = makeFakeCue(CueStyle.Primary, 'primary')
    const secondary = makeFakeCue(CueStyle.Secondary, 'secondary')
    const strobe = makeFakeCue(CueStyle.Primary, 'strobe')
    const motion = makeFakeCue(CueStyle.Primary, 'motion')

    const internals = handler as unknown as {
      currentPrimaryCue: INetCue | null
      currentSecondaryCue: INetCue | null
      currentStrobeCue: INetCue | null
    }
    internals.currentPrimaryCue = primary
    internals.currentSecondaryCue = secondary
    internals.currentStrobeCue = strobe
    seedRunningMotion(handler, motion)

    handler.shutdown()

    expect(primary.onStop).toHaveBeenCalledTimes(1)
    expect(secondary.onStop).toHaveBeenCalledTimes(1)
    expect(strobe.onStop).toHaveBeenCalledTimes(1)
    expect(motion.onStop).toHaveBeenCalledTimes(1)

    expect(internals.currentPrimaryCue).toBeNull()
    expect(internals.currentSecondaryCue).toBeNull()
    expect(internals.currentStrobeCue).toBeNull()
    expect(handler.getMotionCoordinator().getCurrent()).toBeNull()
    expect(motionInternals(handler).currentMotionCueStartTime).toBeNull()
  })

  it('shutdown with an active motion cue schedules a pan/tilt clear and broadcasts it cleared once', () => {
    const sequencer = makeSequencer()
    const emit = jest.fn()
    const handler = new CueHandler(makeLightManager(), sequencer, {
      runtimeBroadcaster: { emit } as never,
    })
    const motion = makeFakeCue(CueStyle.Primary, 'motion')
    seedRunningMotion(handler, motion)

    handler.shutdown()

    expect(sequencer.schedulePanTiltClear).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
      expect.objectContaining({ ref: null, source: 'cleared' }),
    )
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('shutdown clears shared strobe state even when no strobe cue was active (Fix 2)', () => {
    __resetStrobeStateManagerForTests()
    // Simulate a stale slot left by a prior interrupted strobe (no Strobe_Off received).
    getStrobeStateManager().setActive('fast', 'net')
    expect(getStrobeStateManager().getActive()).toBe('fast')

    const handler = new CueHandler(makeLightManager(), makeSequencer())
    // No currentStrobeCue set — old code only cleared when one was present.
    handler.shutdown()

    expect(getStrobeStateManager().getActive()).toBeNull()
  })

  it('shutdown ends the registry song so once-per-song and motion locks do not leak', () => {
    const injected = CueRegistry.getInstance()
    const songEnd = jest.spyOn(injected, 'onSongEnd')
    const motionSongEnd = jest.spyOn(injected, 'onMotionSongEnd')
    const handler = new CueHandler(makeLightManager(), makeSequencer(), { registry: injected })

    handler.shutdown()

    expect(songEnd).toHaveBeenCalled()
    expect(motionSongEnd).toHaveBeenCalled()
  })
})

describe('CueHandler strobe history isolation', () => {
  beforeEach(() => {
    __resetStrobeStateManagerForTests()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('a held strobe does not thrash the primary cue executionCount', async () => {
    const registry = CueRegistry.getInstance()
    const primary = makeFakeCue(CueStyle.Primary, 'frenzy')
    const strobe = makeFakeCue(CueStyle.Primary, 'strobe')
    jest
      .spyOn(registry, 'getCueImplementation')
      .mockImplementation((cueType) =>
        cueType === CueType.Frenzy ? primary : cueType === CueType.Strobe_Fast ? strobe : null,
      )

    const handler = new CueHandler(makeLightManager(), makeSequencer())
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

describe('CueHandler vocal note edge detection', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('fires note-on then note-off only on the active-state edges', () => {
    const sequencer = makeSequencer()
    const handler = new CueHandler(makeLightManager(), sequencer)
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
    const handler = new CueHandler(makeLightManager(), sequencer)
    const onVocalNote = sequencer.onVocalNote as jest.Mock

    handler.handleVocalNote(gameplayCueData({ vocalNote: 0, harmony1Note: 0.9 }))
    expect(onVocalNote).toHaveBeenNthCalledWith(1, true)

    handler.handleVocalNote(
      gameplayCueData({ vocalNote: 0, harmony0Note: 0, harmony1Note: 0, harmony2Note: 0 }),
    )
    expect(onVocalNote).toHaveBeenNthCalledWith(2, false)
  })
})

describe('CueHandler RB3 LED edge history', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('stamps previousFrame with the prior ledBanks and fogState so LED/fog edges fire', async () => {
    const registry = CueRegistry.getInstance()
    const cue = makeFakeCue(CueStyle.Primary, 'rb3')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(cue)
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)
    const handler = new CueHandler(makeLightManager(), makeSequencer())

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

describe('CueHandler input edge reset', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('resetInputEdgeState clears previousFrame baseline without resetting executionCount', async () => {
    const registry = CueRegistry.getInstance()
    const cue = makeFakeCue(CueStyle.Primary, 'frenzy')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(cue)
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)
    const handler = new CueHandler(makeLightManager(), makeSequencer())

    await handler.handleCue(
      CueType.Frenzy,
      gameplayCueData({ lightingCue: CueType.Frenzy, drumNotes: [DrumNoteType.Kick] }),
    )
    const firstExecutionCount = (cue.execute.mock.calls[0]![0] as CueData).executionCount

    handler.resetInputEdgeState()

    await handler.handleCue(
      CueType.Frenzy,
      gameplayCueData({ lightingCue: CueType.Frenzy, drumNotes: [DrumNoteType.Kick] }),
    )
    const secondFrame = cue.execute.mock.calls[1]![0] as CueData
    expect(secondFrame.previousFrame?.drumNotes ?? []).toEqual([])
    expect(secondFrame.executionCount).toBe((firstExecutionCount ?? 0) + 1)
  })

  it('records drum note release in previousFrame for rapid re-hit detection', async () => {
    const registry = CueRegistry.getInstance()
    const cue = makeFakeCue(CueStyle.Primary, 'frenzy')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(cue)
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)
    const handler = new CueHandler(makeLightManager(), makeSequencer())

    await handler.handleCue(
      CueType.Frenzy,
      gameplayCueData({ lightingCue: CueType.Frenzy, drumNotes: [DrumNoteType.Kick] }),
    )
    await handler.handleCue(
      CueType.Frenzy,
      gameplayCueData({ lightingCue: CueType.Frenzy, drumNotes: [] }),
    )
    await handler.handleCue(
      CueType.Frenzy,
      gameplayCueData({ lightingCue: CueType.Frenzy, drumNotes: [DrumNoteType.Kick] }),
    )

    const rehitFrame = cue.execute.mock.calls[2]![0] as CueData
    expect(rehitFrame.previousFrame?.drumNotes ?? []).toEqual([])
  })

  it('resetSessionState stops active strobe slot and clears previousFrame', async () => {
    __resetStrobeStateManagerForTests()
    const registry = CueRegistry.getInstance()
    const strobe = makeFakeCue(CueStyle.Primary, 'strobe')
    jest
      .spyOn(registry, 'getCueImplementation')
      .mockImplementation((cueType) => (cueType === CueType.Strobe_Fast ? strobe : null))
    const handler = new CueHandler(makeLightManager(), makeSequencer())

    await handler.handleCue(
      CueType.Strobe_Fast,
      gameplayCueData({ lightingCue: CueType.Default, strobeState: 'Strobe_Fast' }),
    )
    expect(getStrobeStateManager().getActive()).not.toBeNull()

    handler.resetSessionState()

    expect(strobe.onStop).toHaveBeenCalledTimes(1)
    expect(getStrobeStateManager().getActive()).toBeNull()
    const internals = handler as unknown as {
      currentStrobeCue: INetCue | null
      previousCueData?: CueData
    }
    expect(internals.currentStrobeCue).toBeNull()
    expect(internals.previousCueData).toBeUndefined()
  })

  it('stopActiveStrobe clears the strobe slot without clearing previousFrame baseline', async () => {
    __resetStrobeStateManagerForTests()
    const registry = CueRegistry.getInstance()
    const primary = makeFakeCue(CueStyle.Primary, 'frenzy')
    const strobe = makeFakeCue(CueStyle.Primary, 'strobe')
    jest
      .spyOn(registry, 'getCueImplementation')
      .mockImplementation((cueType) =>
        cueType === CueType.Frenzy ? primary : cueType === CueType.Strobe_Fast ? strobe : null,
      )
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)
    const handler = new CueHandler(makeLightManager(), makeSequencer())

    await handler.handleCue(
      CueType.Frenzy,
      gameplayCueData({ lightingCue: CueType.Frenzy, drumNotes: [DrumNoteType.Kick] }),
    )
    await handler.handleCue(
      CueType.Strobe_Fast,
      gameplayCueData({ lightingCue: CueType.Frenzy, strobeState: 'Strobe_Fast' }),
    )
    const internals = handler as unknown as {
      currentStrobeCue: INetCue | null
      previousCueData?: CueData
    }
    expect(internals.previousCueData?.drumNotes).toEqual([DrumNoteType.Kick])

    handler.stopActiveStrobe()

    expect(strobe.onStop).toHaveBeenCalledTimes(1)
    expect(getStrobeStateManager().getActive()).toBeNull()
    expect(internals.currentStrobeCue).toBeNull()
    expect(internals.previousCueData?.drumNotes).toEqual([DrumNoteType.Kick])
  })
})

describe('CueHandler injected registry', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('resolves cues and song notifications against the injected registry, not the singleton', async () => {
    const singleton = CueRegistry.getInstance()
    const injected = CueRegistry.create()
    const cue = makeFakeCue(CueStyle.Primary, 'injected')
    jest.spyOn(injected, 'getCueImplementation').mockReturnValue(cue)
    jest.spyOn(injected, 'getRandomMotionCue').mockReturnValue(null)
    const singletonResolve = jest.spyOn(singleton, 'getCueImplementation')
    const injectedSongStart = jest.spyOn(injected, 'onSongStart')
    const singletonSongStart = jest.spyOn(singleton, 'onSongStart')

    const handler = new CueHandler(makeLightManager(), makeSequencer(), { registry: injected })
    handler.setMotionEnabled(false)
    handler.notifySongStart()
    await handler.handleCue(CueType.Frenzy, gameplayCueData({ lightingCue: CueType.Frenzy }))

    expect(cue.execute).toHaveBeenCalledTimes(1)
    expect(singletonResolve).not.toHaveBeenCalled()
    expect(injectedSongStart).toHaveBeenCalledTimes(1)
    expect(singletonSongStart).not.toHaveBeenCalled()
  })
})

describe('CueHandler Fallback motion suppression', () => {
  let registry: CueRegistry

  beforeEach(() => {
    registry = CueRegistry.getInstance()
    jest.restoreAllMocks()
  })

  it('does not pick a motion cue when the Fallback cue fires', async () => {
    const primary = makeFakeCue(CueStyle.Primary, 'primary:Fallback')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(primary)
    const getRandomMotionCue = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)

    const handler = new CueHandler(makeLightManager(), makeSequencer())

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
    const handler = new CueHandler(makeLightManager(), sequencer)

    // Seed a freshly-started motion cue from a previous (real) cue. startTime = now keeps it inside
    // the min-hold, where an ordinary cue change keeps it running.
    seedRunningMotion(handler, motion)

    await handler.handleCue(CueType.Fallback, gameplayCueData({ lightingCue: CueType.Fallback }))

    // The leftover motion is stopped and the heads homed; nothing new is picked or executed.
    expect(motion.onStop).toHaveBeenCalledTimes(1)
    expect(sequencer.schedulePanTiltClear).toHaveBeenCalled()
    expect(getRandomMotionCue).not.toHaveBeenCalled()
    expect(motion.execute).not.toHaveBeenCalled()
    expect(handler.getMotionCoordinator().getCurrent()).toBeNull()
  })
})

describe('CueHandler requestMotionRepick (RB3 external trigger)', () => {
  let registry: CueRegistry

  beforeEach(() => {
    registry = CueRegistry.getInstance()
    jest.restoreAllMocks()
  })

  it('swaps in a random motion cue without executing it (the frame dispatch runs it)', () => {
    const motion = makeFakeCue(CueStyle.Primary, 'motion')
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)
    jest
      .spyOn(registry, 'findMotionCueRef')
      .mockReturnValue({ groupId: 'rb3-motion-default', cueId: 'rb3-motion-wave' })
    const handler = new CueHandler(makeLightManager(), makeSequencer(), { registry })

    handler.requestMotionRepick()

    expect(motionInternals(handler).currentMotionCue).toBe(motion)
    // The swapped cue runs on the next keepalive dispatch, not from the trigger itself.
    expect(motion.execute).not.toHaveBeenCalled()
  })

  it('respects the min-hold floor (no re-pick within the hold window)', () => {
    const motion = makeFakeCue(CueStyle.Primary, 'motion')
    const getRandom = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)
    const handler = new CueHandler(makeLightManager(), makeSequencer(), {
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
    const handler = new CueHandler(makeLightManager(), makeSequencer(), { registry })
    handler.setMotionEnabled(false)

    handler.requestMotionRepick()

    expect(getRandom).not.toHaveBeenCalled()
  })

  it('broadcasts motion changes on the injected RB3 channel, not the YARG one', () => {
    const motion = makeFakeCue(CueStyle.Primary, 'motion')
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)
    jest
      .spyOn(registry, 'findMotionCueRef')
      .mockReturnValue({ groupId: 'rb3-motion-default', cueId: 'rb3-motion-wave' })
    const emit = jest.fn()
    const handler = new CueHandler(makeLightManager(), makeSequencer(), {
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

describe('CueHandler forced primary group (RB3 game-mode rotation)', () => {
  it('routes a tracked frame with preferredCueGroup through getCueImplementationFromGroup', async () => {
    const registry = CueRegistry.create()
    const cue = makeFakeCue(CueStyle.Primary, 'rb3-primary')
    const fromGroup = jest.spyOn(registry, 'getCueImplementationFromGroup').mockReturnValue(cue)
    const normal = jest.spyOn(registry, 'getCueImplementation').mockReturnValue(null)

    const handler = new CueHandler(makeLightManager(), makeSequencer(), { registry })
    await handler.handleCue(
      CueType.RB3,
      gameplayCueData({ lightingCue: CueType.RB3, preferredCueGroup: 'rb3-mirror' }),
    )

    expect(fromGroup).toHaveBeenCalledWith(CueType.RB3, 'rb3-mirror', 'tracked')
    expect(normal).not.toHaveBeenCalled()
    expect(cue.execute).toHaveBeenCalled()
  })

  it('falls back to normal selection when the forced group lacks the cueType', async () => {
    // Strobes carry RB3's rotated group, but only the Stage Kit group ships them.
    const registry = CueRegistry.create()
    const strobe = makeFakeCue(CueStyle.Secondary, 'stagekit-strobe')
    const fromGroup = jest.spyOn(registry, 'getCueImplementationFromGroup').mockReturnValue(null)
    const normal = jest.spyOn(registry, 'getCueImplementation').mockReturnValue(strobe)

    const handler = new CueHandler(makeLightManager(), makeSequencer(), { registry })
    await handler.handleCue(
      CueType.Strobe_Fast,
      gameplayCueData({ lightingCue: CueType.RB3, preferredCueGroup: 'rb3-mirror' }),
    )

    expect(fromGroup).toHaveBeenCalledWith(CueType.Strobe_Fast, 'rb3-mirror', 'tracked')
    expect(normal).toHaveBeenCalledWith(CueType.Strobe_Fast, 'tracked')
    expect(strobe.execute).toHaveBeenCalled()
  })
})

describe('CueHandler chart-driven Blackout_Slow handoff', () => {
  let registry: CueRegistry

  beforeEach(() => {
    registry = CueRegistry.getInstance()
    __resetStrobeStateManagerForTests()
    jest.restoreAllMocks()
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)
  })

  /** Call order of each instant blackout the handler asked the sequencer for. */
  const instantBlackoutOrders = (sequencer: ILightingController): number[] => {
    const mock = sequencer.blackout as jest.Mock
    return mock.mock.calls.flatMap((args, i) =>
      args[0] === 0 ? [mock.mock.invocationCallOrder[i]] : [],
    )
  }

  it('ends the fade in an instant blackout before the next resolved non-strobe cue executes', async () => {
    const sequencer = makeSequencer()
    const handler = new CueHandler(makeLightManager(), sequencer)
    handler.setMotionEnabled(false)

    await handler.handleCue(
      CueType.Blackout_Slow,
      gameplayCueData({ lightingCue: CueType.Blackout_Slow }),
    )
    expect(instantBlackoutOrders(sequencer)).toHaveLength(0)

    const next = makeFakeCue(CueStyle.Primary, 'primary:Frenzy')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(next)

    await handler.handleCue(CueType.Frenzy, gameplayCueData({ lightingCue: CueType.Frenzy }))

    // The fade has to end before the cue executes, or its clearing submission is refused by the
    // sequencer's own blackout gate and the rig can stay dark for the cue's whole run. A cancel
    // would uncover the previous look instead of black, so it must not be the way it ends.
    const orders = instantBlackoutOrders(sequencer)
    expect(orders).toHaveLength(1)
    const executeOrder = (next.execute as jest.Mock).mock.invocationCallOrder[0]
    expect(orders[0]).toBeLessThan(executeOrder)
    expect(sequencer.cancelBlackout).not.toHaveBeenCalled()
  })

  it('does not end the fade for a strobe cue arriving while the blackout holds', async () => {
    const sequencer = makeSequencer()
    const handler = new CueHandler(makeLightManager(), sequencer)
    handler.setMotionEnabled(false)

    await handler.handleCue(
      CueType.Blackout_Slow,
      gameplayCueData({ lightingCue: CueType.Blackout_Slow }),
    )

    const strobe = makeFakeCue(CueStyle.Secondary, 'strobe:Strobe_Fast')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(strobe)

    await handler.handleCue(
      CueType.Strobe_Fast,
      gameplayCueData({ lightingCue: CueType.Blackout_Slow, strobeState: 'Strobe_Fast' }),
    )

    expect(instantBlackoutOrders(sequencer)).toHaveLength(0)
    expect(strobe.execute).not.toHaveBeenCalled()
    expect(getStrobeStateManager().getActive()).toBeNull()
  })

  it('only ends the fade once, not on every repeated dispatch of the cue that follows', async () => {
    const sequencer = makeSequencer()
    const handler = new CueHandler(makeLightManager(), sequencer)
    handler.setMotionEnabled(false)

    await handler.handleCue(
      CueType.Blackout_Slow,
      gameplayCueData({ lightingCue: CueType.Blackout_Slow }),
    )

    const next = makeFakeCue(CueStyle.Primary, 'primary:Frenzy')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(next)

    await handler.handleCue(CueType.Frenzy, gameplayCueData({ lightingCue: CueType.Frenzy }))
    await handler.handleCue(CueType.Frenzy, gameplayCueData({ lightingCue: CueType.Frenzy }))

    expect(instantBlackoutOrders(sequencer)).toHaveLength(1)
  })

  it('does not blackout again after an instant blackout, which already ended the fade itself', async () => {
    const sequencer = makeSequencer()
    const handler = new CueHandler(makeLightManager(), sequencer)
    handler.setMotionEnabled(false)

    await handler.handleCue(
      CueType.Blackout_Slow,
      gameplayCueData({ lightingCue: CueType.Blackout_Slow }),
    )
    await handler.handleCue(
      CueType.Blackout_Fast,
      gameplayCueData({ lightingCue: CueType.Blackout_Fast }),
    )

    const next = makeFakeCue(CueStyle.Primary, 'primary:Frenzy')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(next)
    await handler.handleCue(CueType.Frenzy, gameplayCueData({ lightingCue: CueType.Frenzy }))

    // The one instant blackout is Blackout_Fast's own.
    expect(instantBlackoutOrders(sequencer)).toHaveLength(1)
  })
})

describe('CueHandler chart blackout strobe suppression', () => {
  let registry: CueRegistry

  beforeEach(() => {
    registry = CueRegistry.getInstance()
    __resetStrobeStateManagerForTests()
    jest.restoreAllMocks()
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)
  })

  it('suppresses a strobe cue that arrives in the same frame as a fast blackout', async () => {
    const handler = new CueHandler(makeLightManager(), makeSequencer())
    handler.setMotionEnabled(false)
    const strobe = makeFakeCue(CueStyle.Secondary, 'strobe:Strobe_Fast')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(strobe)

    await handler.handleCue(
      CueType.Blackout_Fast,
      gameplayCueData({ lightingCue: CueType.Blackout_Fast }),
    )
    await handler.handleCue(
      CueType.Strobe_Fast,
      gameplayCueData({ lightingCue: CueType.Blackout_Fast, strobeState: 'Strobe_Fast' }),
    )

    expect(strobe.execute).not.toHaveBeenCalled()
    expect(getStrobeStateManager().getActive()).toBeNull()
  })

  it('keeps suppressing repeated strobes until the next primary cue', async () => {
    const handler = new CueHandler(makeLightManager(), makeSequencer())
    handler.setMotionEnabled(false)
    const strobeMedium = makeFakeCue(CueStyle.Secondary, 'strobe:Strobe_Medium')
    const strobeFast = makeFakeCue(CueStyle.Secondary, 'strobe:Strobe_Fast')
    const implementation = jest.spyOn(registry, 'getCueImplementation')
    implementation.mockImplementation((cueType) =>
      cueType === CueType.Strobe_Medium ? strobeMedium : strobeFast,
    )

    await handler.handleCue(CueType.NoCue, gameplayCueData({ lightingCue: CueType.NoCue }))
    await handler.handleCue(
      CueType.Strobe_Medium,
      gameplayCueData({ lightingCue: CueType.NoCue, strobeState: 'Strobe_Medium' }),
    )
    await handler.handleCue(
      CueType.Strobe_Fast,
      gameplayCueData({ lightingCue: CueType.NoCue, strobeState: 'Strobe_Fast' }),
    )

    expect(strobeMedium.execute).not.toHaveBeenCalled()
    expect(strobeFast.execute).not.toHaveBeenCalled()
    expect(getStrobeStateManager().getActive()).toBeNull()

    const primary = makeFakeCue(CueStyle.Primary, 'primary:Chorus')
    implementation.mockReturnValue(primary)
    await handler.handleCue(CueType.Chorus, gameplayCueData({ lightingCue: CueType.Chorus }))
    expect(primary.execute).toHaveBeenCalled()

    implementation.mockReturnValue(strobeFast)
    await handler.handleCue(
      CueType.Strobe_Fast,
      gameplayCueData({ lightingCue: CueType.Chorus, strobeState: 'Strobe_Fast' }),
    )
    expect(strobeFast.execute).toHaveBeenCalled()
    expect(getStrobeStateManager().getActive()).toBe('fast')
  })

  it('clears an active hardware strobe latch when chart blackout starts', async () => {
    const handler = new CueHandler(makeLightManager(), makeSequencer())
    handler.setMotionEnabled(false)
    const strobe = makeFakeCue(CueStyle.Secondary, 'strobe:Strobe_Slow')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(strobe)

    await handler.handleCue(
      CueType.Strobe_Slow,
      gameplayCueData({ lightingCue: CueType.Verse, strobeState: 'Strobe_Slow' }),
    )
    expect(getStrobeStateManager().getActive()).toBe('slow')

    await handler.handleCue(
      CueType.Blackout_Spotlight,
      gameplayCueData({ lightingCue: CueType.Blackout_Spotlight }),
    )

    expect(getStrobeStateManager().getActive()).toBeNull()
  })

  it('Strobe_Off remains idempotent while chart blackout is held', async () => {
    const handler = new CueHandler(makeLightManager(), makeSequencer())
    handler.setMotionEnabled(false)

    await handler.handleCue(
      CueType.Blackout_Fast,
      gameplayCueData({ lightingCue: CueType.Blackout_Fast }),
    )
    await handler.handleCue(
      CueType.Strobe_Off,
      gameplayCueData({ lightingCue: CueType.Blackout_Fast, strobeState: 'Strobe_Off' }),
    )

    expect(getStrobeStateManager().getActive()).toBeNull()
  })

  it('re-enables strobes on a non-strobe cue the registry cannot resolve', async () => {
    const handler = new CueHandler(makeLightManager(), makeSequencer())
    handler.setMotionEnabled(false)
    const strobe = makeFakeCue(CueStyle.Secondary, 'strobe:Strobe_Fast')
    const implementation = jest.spyOn(registry, 'getCueImplementation')
    implementation.mockReturnValue(null)

    await handler.handleCue(
      CueType.Blackout_Fast,
      gameplayCueData({ lightingCue: CueType.Blackout_Fast }),
    )
    // Nothing implements this cue type, so it resolves to null and only clears the hold.
    await handler.handleCue(CueType.Chorus, gameplayCueData({ lightingCue: CueType.Chorus }))

    implementation.mockReturnValue(strobe)
    await handler.handleCue(
      CueType.Strobe_Fast,
      gameplayCueData({ lightingCue: CueType.Chorus, strobeState: 'Strobe_Fast' }),
    )

    expect(strobe.execute).toHaveBeenCalled()
  })

  it('re-enables strobes once the song ends', async () => {
    const handler = new CueHandler(makeLightManager(), makeSequencer())
    handler.setMotionEnabled(false)
    const strobe = makeFakeCue(CueStyle.Secondary, 'strobe:Strobe_Fast')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(strobe)

    await handler.handleCue(
      CueType.Blackout_Fast,
      gameplayCueData({ lightingCue: CueType.Blackout_Fast }),
    )
    handler.notifySongEnd()

    await handler.handleCue(
      CueType.Strobe_Fast,
      gameplayCueData({ lightingCue: CueType.Blackout_Fast, strobeState: 'Strobe_Fast' }),
    )

    expect(strobe.execute).toHaveBeenCalled()
  })

  it('lets strobes through once the RB3 primary cue resolves after a menu blackout', async () => {
    const handler = new CueHandler(makeLightManager(), makeSequencer())
    handler.setMotionEnabled(false)
    const rb3Primary = makeFakeCue(CueStyle.Primary, 'rb3:primary')
    const strobe = makeFakeCue(CueStyle.Secondary, 'strobe:Strobe_Fast')
    const implementation = jest.spyOn(registry, 'getCueImplementation')
    implementation.mockReturnValue(rb3Primary)

    // RB3 cue mode dispatches Blackout_Fast to enter its menu look.
    await handler.handleCue(
      CueType.Blackout_Fast,
      gameplayCueData({ lightingCue: CueType.Blackout_Fast }),
    )
    await handler.handleCue(CueType.RB3, gameplayCueData({ lightingCue: CueType.RB3 }))
    expect(rb3Primary.execute).toHaveBeenCalled()

    implementation.mockReturnValue(strobe)
    await handler.handleCue(
      CueType.Strobe_Fast,
      gameplayCueData({ lightingCue: CueType.RB3, strobeState: 'Strobe_Fast' }),
    )

    expect(strobe.execute).toHaveBeenCalled()
  })

  it('plays a strobe that opens a song after a menu blackout', async () => {
    const handler = new CueHandler(makeLightManager(), makeSequencer())
    handler.setMotionEnabled(false)
    const strobe = makeFakeCue(CueStyle.Secondary, 'strobe:Strobe_Fast')
    await handler.handleCue(
      CueType.Blackout_Fast,
      gameplayCueData({ lightingCue: CueType.Blackout_Fast }),
    )

    handler.notifySongStart()
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(strobe)
    await handler.handleCue(
      CueType.Strobe_Fast,
      gameplayCueData({ lightingCue: CueType.RB3, strobeState: 'Strobe_Fast' }),
    )

    expect(strobe.execute).toHaveBeenCalled()
  })
})

describe('CueHandler cue change during a cue-driven fade', () => {
  let registry: CueRegistry

  beforeEach(() => {
    registry = CueRegistry.getInstance()
    __resetStrobeStateManagerForTests()
    jest.restoreAllMocks()
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)
  })

  const fadingSequencer = (): ILightingController =>
    fakeLightingController({ isBlackoutActive: () => true })

  const instantBlackouts = (sequencer: ILightingController): unknown[][] =>
    (sequencer.blackout as jest.Mock).mock.calls.filter((args) => args[0] === 0)

  it('ends the fade before a different primary cue executes', async () => {
    const sequencer = fadingSequencer()
    const handler = new CueHandler(makeLightManager(), sequencer)
    handler.setMotionEnabled(false)

    const first = makeFakeCue(CueStyle.Primary, 'primary:Verse')
    const implementation = jest.spyOn(registry, 'getCueImplementation').mockReturnValue(first)
    await handler.handleCue(CueType.Verse, gameplayCueData({ lightingCue: CueType.Verse }))
    ;(sequencer.blackout as jest.Mock).mockClear()

    const next = makeFakeCue(CueStyle.Primary, 'primary:Chorus')
    implementation.mockReturnValue(next)
    await handler.handleCue(CueType.Chorus, gameplayCueData({ lightingCue: CueType.Chorus }))

    expect(instantBlackouts(sequencer)).toHaveLength(1)
    const blackoutOrder = (sequencer.blackout as jest.Mock).mock.invocationCallOrder[0]
    const executeOrder = (next.execute as jest.Mock).mock.invocationCallOrder[0]
    expect(blackoutOrder).toBeLessThan(executeOrder)
  })

  it("leaves a fade alone while the same primary cue keeps running, since it is the cue's own", async () => {
    const sequencer = fadingSequencer()
    const handler = new CueHandler(makeLightManager(), sequencer)
    handler.setMotionEnabled(false)

    const cue = makeFakeCue(CueStyle.Primary, 'primary:Verse')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(cue)
    await handler.handleCue(CueType.Verse, gameplayCueData({ lightingCue: CueType.Verse }))
    ;(sequencer.blackout as jest.Mock).mockClear()

    await handler.handleCue(CueType.Verse, gameplayCueData({ lightingCue: CueType.Verse }))
    await handler.handleCue(CueType.Verse, gameplayCueData({ lightingCue: CueType.Verse }))

    expect(instantBlackouts(sequencer)).toHaveLength(0)
  })

  it('leaves a fade alone when a secondary overlay arrives', async () => {
    const sequencer = fadingSequencer()
    const handler = new CueHandler(makeLightManager(), sequencer)
    handler.setMotionEnabled(false)

    const primary = makeFakeCue(CueStyle.Primary, 'primary:Verse')
    const implementation = jest.spyOn(registry, 'getCueImplementation').mockReturnValue(primary)
    await handler.handleCue(CueType.Verse, gameplayCueData({ lightingCue: CueType.Verse }))
    ;(sequencer.blackout as jest.Mock).mockClear()

    implementation.mockReturnValue(makeFakeCue(CueStyle.Secondary, 'secondary:Frenzy'))
    await handler.handleCue(CueType.Frenzy, gameplayCueData({ lightingCue: CueType.Frenzy }))

    expect(instantBlackouts(sequencer)).toHaveLength(0)
  })
})

describe('CueHandler cue execution failure', () => {
  let registry: CueRegistry

  beforeEach(() => {
    registry = CueRegistry.getInstance()
    jest.restoreAllMocks()
  })

  it('reports a cue whose execute throws and still finishes the dispatch', async () => {
    const cue = makeFakeCue(CueStyle.Primary, 'primary:Frenzy')
    cue.execute.mockImplementation(() => {
      throw new Error('boom')
    })
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(cue)
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)

    const handler = new CueHandler(makeLightManager(), makeSequencer())
    handler.setMotionEnabled(false)
    const handled = jest.fn()
    handler.on('cueHandled', handled)

    const entries: LogEntry[] = []
    setLogSink((entry) => entries.push(entry))
    try {
      await handler.handleCue(CueType.Frenzy, gameplayCueData({ lightingCue: CueType.Frenzy }))
    } finally {
      resetLogConfiguration()
    }

    expect(entries.some((e) => e.message.includes('Cue Frenzy execution failed'))).toBe(true)
    expect(handled).toHaveBeenCalledTimes(1)
  })
})
