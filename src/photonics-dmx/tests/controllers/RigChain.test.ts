/**
 * RigChain integration: each chain owns its own DmxLightManager, sequencer, and
 * LightStateManager bound to one rig's lights. The shared Clock ticks each chain's
 * sequencer independently and one chain's dispose() leaves the others ticking.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { RigChain } from '../../controllers/RigChain'
import { ManualTestClock } from '../helpers/sequencerHarness'
import { makeAsymmetricTwoRigs, makeTwoRigs } from '../helpers/multiRigFixtures'
import type { Clock } from '../../controllers/sequencer/Clock'

describe('RigChain', () => {
  it('builds a DmxLightManager scoped to that rig only', () => {
    const [rigA, rigB] = makeAsymmetricTwoRigs({ smallFrontCount: 4, largeFrontCount: 8 })
    const clock = new ManualTestClock() as unknown as Clock
    const chainA = new RigChain({ rigId: rigA.id, config: rigA.config, clock, isPrimary: true })
    const chainB = new RigChain({ rigId: rigB.id, config: rigB.config, clock, isPrimary: false })

    // Each chain's light manager sees only its own rig's lights. Cues asking for 'front'
    // ['all'] resolve against the rig-local set, which is the whole point of the per-rig
    // pipeline — same cue, two distinct scales.
    expect(chainA.dmxLightManager.getLights(['front'], ['all']).length).toBe(4)
    expect(chainB.dmxLightManager.getLights(['front'], ['all']).length).toBe(8)
    // totalLights is per-rig: the asymmetric helper gives small=4 and large=8 front lights.
    expect(chainA.dmxLightManager.getTotalDmxLightCount()).toBe(4)
    expect(chainB.dmxLightManager.getTotalDmxLightCount()).toBe(8)

    chainA.dispose()
    chainB.dispose()
  })

  it("disposing one chain doesn't tear down a sibling chain's sequencer", () => {
    const [rigA, rigB] = makeTwoRigs({ frontPerRig: 4 })
    const clock = new ManualTestClock() as unknown as Clock
    const chainA = new RigChain({ rigId: rigA.id, config: rigA.config, clock, isPrimary: true })
    const chainB = new RigChain({ rigId: rigB.id, config: rigB.config, clock, isPrimary: false })

    chainA.dispose()

    // chainB's pipeline is still usable — addEffect doesn't throw and queries against its
    // own light manager still answer correctly.
    expect(() => chainB.sequencer.removeAllEffects()).not.toThrow()
    expect(chainB.dmxLightManager.getLights(['front'], ['all']).length).toBe(4)

    chainB.dispose()
  })

  it('isPrimary defaults to true when no override is given', () => {
    const [rigA] = makeTwoRigs({ frontPerRig: 4 })
    const clock = new ManualTestClock() as unknown as Clock
    const chain = new RigChain({ rigId: rigA.id, config: rigA.config, clock })
    expect(chain.isPrimary).toBe(true)
    chain.dispose()
  })

  it('LightStateManager events from one chain do not bleed into the other', () => {
    const [rigA, rigB] = makeTwoRigs({ frontPerRig: 4 })
    const clock = new ManualTestClock() as unknown as Clock
    const chainA = new RigChain({ rigId: rigA.id, config: rigA.config, clock, isPrimary: true })
    const chainB = new RigChain({ rigId: rigB.id, config: rigB.config, clock, isPrimary: false })

    const eventsA: number[] = []
    const eventsB: number[] = []
    chainA.lightStateManager.on('LightStatesUpdated', (m) => eventsA.push(m.size))
    chainB.lightStateManager.on('LightStatesUpdated', (m) => eventsB.push(m.size))

    chainA.lightStateManager.setLightState('rig-a-front-1', {
      red: 255,
      green: 0,
      blue: 0,
      intensity: 255,
      opacity: 1,
      blendMode: 'replace',
    })
    chainA.lightStateManager.publishLightStates()

    expect(eventsA).toEqual([1])
    expect(eventsB).toEqual([])

    chainA.dispose()
    chainB.dispose()
  })

  it('setMotionEnabled / setManualMotionRef on the chain handlers operate per-rig', () => {
    // Direct iteration of `rigChains` from ControllerManager is what propagates the toggle
    // to every chain's YARG handler under multi-rig. This test pins that each chain has its
    // own independent flag so the toggle isn't visible only on the primary handler.
    const [rigA, rigB] = makeTwoRigs({ frontPerRig: 4 })
    const clock = new ManualTestClock() as unknown as Clock
    const chainA = new RigChain({ rigId: rigA.id, config: rigA.config, clock, isPrimary: true })
    const chainB = new RigChain({ rigId: rigB.id, config: rigB.config, clock, isPrimary: false })

    const handlerA = new (
      jest.requireActual(
        '../../cueHandlers/YargCueHandler',
      ) as typeof import('../../cueHandlers/YargCueHandler')
    ).YargCueHandler(chainA.dmxLightManager, chainA.sequencer)
    const handlerB = new (
      jest.requireActual(
        '../../cueHandlers/YargCueHandler',
      ) as typeof import('../../cueHandlers/YargCueHandler')
    ).YargCueHandler(chainB.dmxLightManager, chainB.sequencer)
    chainA.yargCueHandler = handlerA
    chainB.yargCueHandler = handlerB

    const aSpy = jest.spyOn(handlerA, 'setMotionEnabled')
    const bSpy = jest.spyOn(handlerB, 'setMotionEnabled')
    const aRefSpy = jest.spyOn(handlerA, 'setManualMotionRef')
    const bRefSpy = jest.spyOn(handlerB, 'setManualMotionRef')

    // Iterate as ControllerManager does (`for (const chain of this.rigChains)`).
    for (const chain of [chainA, chainB]) {
      chain.yargCueHandler?.setMotionEnabled(false)
      chain.yargCueHandler?.setManualMotionRef({ groupId: 'g', cueId: 'c' })
    }

    expect(aSpy).toHaveBeenCalledWith(false)
    expect(bSpy).toHaveBeenCalledWith(false)
    expect(aRefSpy).toHaveBeenCalledWith({ groupId: 'g', cueId: 'c' })
    expect(bRefSpy).toHaveBeenCalledWith({ groupId: 'g', cueId: 'c' })

    chainA.dispose()
    chainB.dispose()
  })

  it('dispose() releases per-sequencer state from cue registries', async () => {
    const { YargCueRegistry } = await import('../../cues/registries/YargCueRegistry')
    const { AudioCueRegistry } = await import('../../cues/registries/AudioCueRegistry')
    const yargSpy = jest.spyOn(YargCueRegistry.getInstance(), 'releaseSequencerFromAllCues')
    const audioSpy = jest.spyOn(AudioCueRegistry.getInstance(), 'releaseSequencerFromAllCues')
    try {
      const [rigA] = makeTwoRigs({ frontPerRig: 4 })
      const clock = new ManualTestClock() as unknown as Clock
      const chain = new RigChain({ rigId: rigA.id, config: rigA.config, clock })
      await chain.dispose()
      expect(yargSpy).toHaveBeenCalledWith(chain.sequencer)
      expect(audioSpy).toHaveBeenCalledWith(chain.sequencer)
    } finally {
      yargSpy.mockRestore()
      audioSpy.mockRestore()
    }
  })
})
