import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  MotionSelectionCoordinator,
  type MotionSelectionCoordinatorOptions,
} from '../../cueHandlers/MotionSelectionCoordinator'
import { CueRegistry } from '../../cues/registries/CueRegistry'
import { CueStyle, type INetCue } from '../../cues/interfaces/INetCue'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

type FakeCue = INetCue & { execute: jest.Mock; onStop: jest.Mock }

function makeFakeCue(id: string): FakeCue {
  return {
    cueId: id,
    id,
    style: CueStyle.Primary,
    execute: jest.fn(),
    onStop: jest.fn(),
  } as unknown as FakeCue
}

const REF = { groupId: 'motion-group', cueId: 'motion-a' }

describe('MotionSelectionCoordinator', () => {
  let registry: CueRegistry
  let emit: jest.Mock

  beforeEach(() => {
    registry = CueRegistry.create()
    jest.restoreAllMocks()
    emit = jest.fn()
    jest.spyOn(registry, 'findMotionCueRef').mockReturnValue(REF)
  })

  function build(
    options: Partial<MotionSelectionCoordinatorOptions<INetCue>> = {},
  ): MotionSelectionCoordinator {
    return new MotionSelectionCoordinator<INetCue>({
      registry,
      runtimeBroadcaster: { emit } as never,
      getMotionCueMinimumHoldMs: () => 0,
      ...options,
    })
  }

  it('decides once per token: a second caller with the same token gets the same cue', () => {
    const a = makeFakeCue('motion-a')
    const b = makeFakeCue('motion-b')
    const getRandom = jest
      .spyOn(registry, 'getRandomMotionCue')
      .mockReturnValueOnce(a)
      .mockReturnValueOnce(b)
    const coordinator = build()
    const token = {}

    expect(coordinator.select(token, { cueKey: 'Verse' })).toBe(a)
    expect(coordinator.select(token, { cueKey: 'Verse' })).toBe(a)

    expect(getRandom).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
      expect.objectContaining({ ref: REF, source: 'auto', manualFallback: false }),
    )
  })

  it('a later dispatch on a new cue picks again, stopping the previous cue once', () => {
    const a = makeFakeCue('motion-a')
    const b = makeFakeCue('motion-b')
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValueOnce(a).mockReturnValueOnce(b)
    const coordinator = build()

    coordinator.select({}, { cueKey: 'Verse' })
    expect(coordinator.select({}, { cueKey: 'Chorus' })).toBe(b)

    expect(a.onStop).toHaveBeenCalledTimes(1)
    expect(b.onStop).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledTimes(2)
  })

  it('keeps the current cue while dispatches carry the same cue and no repick is forced', () => {
    const a = makeFakeCue('motion-a')
    const getRandom = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(a)
    const coordinator = build()

    coordinator.select({}, { cueKey: 'Verse' })
    expect(coordinator.select({}, { cueKey: 'Verse' })).toBe(a)
    expect(coordinator.select({})).toBe(a)

    expect(getRandom).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('rolls the probability once per decision', () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.9)
    const getRandom = jest.spyOn(registry, 'getRandomMotionCue')
    const coordinator = build({ getMotionCueProbabilityPercent: () => 50 })
    const token = {}

    expect(coordinator.select(token, { cueKey: 'Verse' })).toBeNull()
    expect(coordinator.select(token, { cueKey: 'Verse' })).toBeNull()

    expect(random).toHaveBeenCalledTimes(1)
    expect(getRandom).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  it('re-picking the same cue broadcasts it again without stopping it', () => {
    const a = makeFakeCue('motion-a')
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(a)
    const coordinator = build()

    coordinator.select({}, { cueKey: 'Verse' })
    coordinator.select({}, { cueKey: 'Chorus' })

    expect(a.onStop).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledTimes(2)
  })

  it('clear stops the cue and broadcasts cleared once for a token shared by two chains', () => {
    const a = makeFakeCue('motion-a')
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(a)
    const coordinator = build()
    coordinator.select({}, { cueKey: 'Verse' })

    const token = {}
    coordinator.clear(token)
    coordinator.clear(token)

    expect(a.onStop).toHaveBeenCalledTimes(1)
    expect(coordinator.getCurrent()).toBeNull()
    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenLastCalledWith(
      RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
      expect.objectContaining({ ref: null, source: 'cleared' }),
    )
  })

  it('an external wipe stops the cue, reports it cleared and picks again on the next dispatch', () => {
    const a = makeFakeCue('motion-a')
    const b = makeFakeCue('motion-b')
    const getRandom = jest
      .spyOn(registry, 'getRandomMotionCue')
      .mockReturnValueOnce(a)
      .mockReturnValueOnce(b)
    const coordinator = build({ getMotionCueMinimumHoldMs: () => 60_000 })
    coordinator.select({}, { cueKey: 'Verse' })

    coordinator.notifyExternalWipe()

    expect(a.onStop).toHaveBeenCalledTimes(1)
    expect(coordinator.getRunningMotionRef()).toEqual({
      ref: null,
      source: 'cleared',
      manualFallback: false,
    })
    // Inside the hold and the same cue, where an ordinary dispatch keeps the current pick.
    expect(coordinator.select({}, { cueKey: 'Verse' })).toBe(b)
    expect(getRandom).toHaveBeenCalledTimes(2)
  })

  it('an external wipe with nothing running changes nothing', () => {
    const coordinator = build()

    coordinator.notifyExternalWipe()

    expect(emit).not.toHaveBeenCalled()
  })

  it('switching motion off stops the cue once and reports it cleared', () => {
    const a = makeFakeCue('motion-a')
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(a)
    const coordinator = build()
    coordinator.select({}, { cueKey: 'Verse' })

    coordinator.setMotionEnabled(false)
    coordinator.setMotionEnabled(false)

    expect(coordinator.isMotionEnabled()).toBe(false)
    expect(a.onStop).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledTimes(2)
  })

  it('stopIfCurrent only stops the cue that is running', () => {
    const a = makeFakeCue('motion-a')
    const b = makeFakeCue('motion-b')
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(a)
    const coordinator = build()
    coordinator.select({}, { cueKey: 'Verse' })

    coordinator.stopIfCurrent(b)
    expect(coordinator.getCurrent()).toBe(a)

    coordinator.stopIfCurrent(a)
    expect(coordinator.getCurrent()).toBeNull()
    expect(a.onStop).toHaveBeenCalledTimes(1)
  })

  it('reports a pinned cue as manual and a pin that fell back as auto with the fallback flag', () => {
    const pinned = makeFakeCue('pinned')
    const random = makeFakeCue('random')
    const getImplementation = jest
      .spyOn(registry, 'getMotionCueImplementation')
      .mockReturnValueOnce(pinned)
      .mockReturnValueOnce(null)
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(random)
    const coordinator = build()

    coordinator.setManualMotionRef({ groupId: 'motion-group', cueId: 'pinned' })
    coordinator.select({})
    expect(coordinator.getRunningMotionRef()).toEqual({
      ref: REF,
      source: 'manual',
      manualFallback: false,
    })

    coordinator.setManualMotionRef({ groupId: 'motion-group', cueId: 'missing' })
    coordinator.select({})
    expect(getImplementation).toHaveBeenCalledTimes(2)
    expect(coordinator.getRunningMotionRef()).toEqual({
      ref: REF,
      source: 'auto',
      manualFallback: true,
    })
    expect(emit).toHaveBeenCalledWith(RENDERER_RECEIVE.DEBUG_LOG, expect.anything())
  })

  it('treats the same manual ref again as no change, so the hold holds', () => {
    const pinned = makeFakeCue('pinned')
    const getImplementation = jest
      .spyOn(registry, 'getMotionCueImplementation')
      .mockReturnValue(pinned)
    const coordinator = build({ getMotionCueMinimumHoldMs: () => 60_000 })

    coordinator.setManualMotionRef({ groupId: 'motion-group', cueId: 'pinned' })
    coordinator.select({}, { cueKey: 'Verse' })
    coordinator.setManualMotionRef({ groupId: 'motion-group', cueId: 'pinned' })
    coordinator.select({}, { cueKey: 'Verse' })

    expect(getImplementation).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('picks again on the same cue after a stop', () => {
    const a = makeFakeCue('motion-a')
    const getRandom = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(a)
    const coordinator = build()
    coordinator.select({}, { cueKey: 'Verse' })

    coordinator.stop()

    expect(coordinator.select({}, { cueKey: 'Verse' })).toBe(a)
    expect(getRandom).toHaveBeenCalledTimes(2)
  })

  it('drops a new cue that arrives inside the hold', () => {
    const a = makeFakeCue('motion-a')
    const getRandom = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(a)
    let holdMs = 60_000
    const coordinator = build({ getMotionCueMinimumHoldMs: () => holdMs })
    coordinator.select({}, { cueKey: 'Verse' })

    coordinator.select({}, { cueKey: 'Chorus' })
    holdMs = 0
    coordinator.select({}, { cueKey: 'Chorus' })

    expect(getRandom).toHaveBeenCalledTimes(1)
  })

  it('picks for a new cue once the hold has run when asked to wait for it', () => {
    const a = makeFakeCue('motion-a')
    const getRandom = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(a)
    let holdMs = 60_000
    const coordinator = build({ getMotionCueMinimumHoldMs: () => holdMs })
    coordinator.select({}, { cueKey: 'wash', pickAfterHold: true })

    coordinator.select({}, { cueKey: 'pulse', pickAfterHold: true })
    expect(getRandom).toHaveBeenCalledTimes(1)
    holdMs = 0
    coordinator.select({}, { cueKey: 'pulse', pickAfterHold: true })

    expect(getRandom).toHaveBeenCalledTimes(2)
  })

  it('picks inside the hold and past a manual ref when told to', () => {
    const random = makeFakeCue('random')
    const getImplementation = jest.spyOn(registry, 'getMotionCueImplementation')
    const getRandom = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(random)
    const coordinator = build({ getMotionCueMinimumHoldMs: () => 60_000 })
    coordinator.select({}, { cueKey: 'wash', ignoreManualRef: true })
    coordinator.setManualMotionRef({ groupId: 'motion-group', cueId: 'pinned' })

    coordinator.select({}, { cueKey: 'pulse', bypassMinHold: true, ignoreManualRef: true })

    expect(getImplementation).not.toHaveBeenCalled()
    expect(getRandom).toHaveBeenCalledTimes(2)
  })

  it('reports cleared while no motion cue runs', () => {
    expect(build().getRunningMotionRef()).toEqual({
      ref: null,
      source: 'cleared',
      manualFallback: false,
    })
  })

  it('broadcasts on the channel it is built with', () => {
    const a = makeFakeCue('motion-a')
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(a)
    const coordinator = build({ motionChangeChannel: RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE })

    coordinator.select({}, { cueKey: 'Verse' })

    expect(emit).toHaveBeenCalledWith(RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE, expect.anything())
    expect(emit).not.toHaveBeenCalledWith(
      RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
      expect.anything(),
    )
  })
})
