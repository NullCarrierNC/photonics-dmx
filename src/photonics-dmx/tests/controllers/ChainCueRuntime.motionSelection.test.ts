import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ChainFanout } from '../../controllers/ChainFanout'
import { RigChain } from '../../controllers/RigChain'
import { ManualTestClock } from '../helpers/sequencerHarness'
import { makeTwoRigs } from '../helpers/multiRigFixtures'
import { CueHandler } from '../../cueHandlers/CueHandler'
import { MotionSelectionCoordinator } from '../../cueHandlers/MotionSelectionCoordinator'
import { CueRegistry } from '../../cues/registries/CueRegistry'
import { CueStyle, type INetCue } from '../../cues/interfaces/INetCue'
import { CueType, defaultCueData, type CueData } from '../../cues/types/cueTypes'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import type { Clock } from '../../controllers/sequencer/Clock'

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

function frame(lightingCue: CueType): CueData {
  return { ...defaultCueData, currentScene: 'Gameplay', trackMode: 'tracked', lightingCue }
}

describe('ChainCueRuntime motion selection across chains', () => {
  let chains: RigChain[] = []
  let registry: CueRegistry
  let emit: jest.Mock
  let coordinator: MotionSelectionCoordinator
  let fanout: ChainFanout

  function attachHandler(chain: RigChain): void {
    chain.cueHandlers.yarg = new CueHandler(chain.dmxLightManager, chain.sequencer, {
      registry,
      motionCoordinator: coordinator,
    })
  }

  beforeEach(() => {
    registry = CueRegistry.create()
    jest.restoreAllMocks()
    const [rigA, rigB] = makeTwoRigs({ frontPerRig: 2 })
    const clock = new ManualTestClock() as unknown as Clock
    chains = [
      new RigChain({ rigId: rigA.id, config: rigA.config, clock, isPrimary: true }),
      new RigChain({ rigId: rigB.id, config: rigB.config, clock, isPrimary: false }),
    ]
    emit = jest.fn()
    coordinator = new MotionSelectionCoordinator({
      registry,
      runtimeBroadcaster: { emit } as never,
      getMotionCueMinimumHoldMs: () => 0,
    })
    for (const chain of chains) attachHandler(chain)
    fanout = new ChainFanout()
    fanout.setChains(chains)
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(makeFakeCue('lighting'))
    jest
      .spyOn(registry, 'findMotionCueRef')
      .mockReturnValue({ groupId: 'motion-group', cueId: 'motion-a' })
  })

  afterEach(() => {
    for (const chain of chains) chain.dispose()
    chains = []
  })

  it('runs the one cue picked for a dispatch on every chain and broadcasts it once', async () => {
    const a = makeFakeCue('motion-a')
    const b = makeFakeCue('motion-b')
    const getRandom = jest
      .spyOn(registry, 'getRandomMotionCue')
      .mockReturnValueOnce(a)
      .mockReturnValueOnce(b)

    await fanout.handleCue(CueType.Frenzy, frame(CueType.Frenzy))

    expect(getRandom).toHaveBeenCalledTimes(1)
    expect(a.execute).toHaveBeenCalledTimes(2)
    expect(a.execute).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      chains[0].sequencer,
      chains[0].dmxLightManager,
    )
    expect(a.execute).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      chains[1].sequencer,
      chains[1].dmxLightManager,
    )
    expect(b.execute).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
      expect.objectContaining({ ref: { groupId: 'motion-group', cueId: 'motion-a' } }),
    )
    expect(fanout.runningMotionCue('yarg')).toEqual({
      ref: { groupId: 'motion-group', cueId: 'motion-a' },
      source: 'auto',
      manualFallback: false,
    })
  })

  it('a Fallback stops the cue once, homes every chain and broadcasts cleared once', async () => {
    const a = makeFakeCue('motion-a')
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(a)
    await fanout.handleCue(CueType.Frenzy, frame(CueType.Frenzy))
    const homed = chains.map((chain) => jest.spyOn(chain.sequencer, 'schedulePanTiltClear'))

    await fanout.handleCue(CueType.Fallback, frame(CueType.Fallback))

    expect(a.onStop).toHaveBeenCalledTimes(1)
    for (const spy of homed) expect(spy).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenLastCalledWith(
      RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
      expect.objectContaining({ ref: null, source: 'cleared' }),
    )
    expect(fanout.runningMotionCue('yarg').ref).toBeNull()
  })

  it('a repick request picks once for every chain and the next dispatch runs it on each', async () => {
    const a = makeFakeCue('motion-a')
    const b = makeFakeCue('motion-b')
    const getRandom = jest
      .spyOn(registry, 'getRandomMotionCue')
      .mockReturnValueOnce(a)
      .mockReturnValueOnce(b)
    await fanout.handleCue(CueType.Frenzy, frame(CueType.Frenzy))

    fanout.cueRuntime('yarg').requestMotionRepick()

    expect(getRandom).toHaveBeenCalledTimes(2)
    expect(a.onStop).toHaveBeenCalledTimes(1)
    expect(b.execute).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledTimes(2)

    await fanout.handleCue(CueType.Frenzy, frame(CueType.Frenzy))

    expect(b.execute).toHaveBeenCalledTimes(2)
    expect(getRandom).toHaveBeenCalledTimes(2)
  })

  it('a chain that joins after the pick runs the current cue at its first dispatch', async () => {
    const a = makeFakeCue('motion-a')
    const getRandom = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(a)
    fanout.setChains([chains[0]])
    await fanout.handleCue(CueType.Frenzy, frame(CueType.Frenzy))
    expect(a.execute).toHaveBeenCalledTimes(1)

    fanout.setChains(chains)
    await fanout.handleCue(CueType.Frenzy, frame(CueType.Frenzy))

    expect(a.execute).toHaveBeenCalledTimes(3)
    expect(a.execute).toHaveBeenLastCalledWith(
      expect.anything(),
      chains[1].sequencer,
      chains[1].dmxLightManager,
    )
    expect(getRandom).toHaveBeenCalledTimes(1)
  })

  it('reports no motion cue when no chain has a handler for the domain', () => {
    expect(fanout.runningMotionCue('rb3')).toEqual({
      ref: null,
      source: 'cleared',
      manualFallback: false,
    })
    expect(new ChainFanout().runningMotionCue('yarg').ref).toBeNull()
  })
})
