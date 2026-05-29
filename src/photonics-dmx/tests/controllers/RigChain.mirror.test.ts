/**
 * RigChain mirror integration: the `mirror` option transforms the rig's effective
 * `LightingConfiguration` before it reaches `DmxLightManager`, so cue resolution naturally
 * walks lights in the mirrored order without any consumer-side changes.
 */
import { describe, expect, it } from '@jest/globals'
import { RigChain } from '../../controllers/RigChain'
import { ManualTestClock } from '../helpers/sequencerHarness'
import { makeTwoRigs } from '../helpers/multiRigFixtures'
import type { Clock } from '../../controllers/sequencer/Clock'

describe('RigChain mirror', () => {
  it('Horiz mirror reverses the order returned by getLights(front, linear)', () => {
    const [rigA] = makeTwoRigs({ frontPerRig: 4 })
    const clock = new ManualTestClock() as unknown as Clock
    const plain = new RigChain({ rigId: 'plain', config: rigA.config, clock })
    const mirrored = new RigChain({
      rigId: 'mirrored',
      config: rigA.config,
      clock,
      mirror: { horiz: true },
    })

    const plainOrder = plain.dmxLightManager.getLights(['front'], ['linear']).map((l) => l.id)
    const mirroredOrder = mirrored.dmxLightManager.getLights(['front'], ['linear']).map((l) => l.id)

    expect(plainOrder).toEqual(['rig-a-front-1', 'rig-a-front-2', 'rig-a-front-3', 'rig-a-front-4'])
    expect(mirroredOrder).toEqual([...plainOrder].reverse())

    plain.dispose()
    mirrored.dispose()
  })

  it('Horiz mirror swaps which physical lights match even vs odd', () => {
    const [rigA] = makeTwoRigs({ frontPerRig: 4 })
    const clock = new ManualTestClock() as unknown as Clock
    const plain = new RigChain({ rigId: 'plain', config: rigA.config, clock })
    const mirrored = new RigChain({
      rigId: 'mirrored',
      config: rigA.config,
      clock,
      mirror: { horiz: true },
    })

    const plainEven = plain.dmxLightManager
      .getLights(['front'], ['even'])
      .map((l) => l.id)
      .sort()
    const mirroredEven = mirrored.dmxLightManager
      .getLights(['front'], ['even'])
      .map((l) => l.id)
      .sort()
    const plainOdd = plain.dmxLightManager
      .getLights(['front'], ['odd'])
      .map((l) => l.id)
      .sort()
    const mirroredOdd = mirrored.dmxLightManager
      .getLights(['front'], ['odd'])
      .map((l) => l.id)
      .sort()

    // Originally positions 1-4: even = [2, 4], odd = [1, 3]. After horiz mirror, positions
    // become 4, 3, 2, 1 for the same physical lights; even now lands on the lights originally
    // at positions 1 and 3, odd on 2 and 4.
    expect(plainEven).toEqual(['rig-a-front-2', 'rig-a-front-4'])
    expect(mirroredEven).toEqual(['rig-a-front-1', 'rig-a-front-3'])
    expect(plainOdd).toEqual(['rig-a-front-1', 'rig-a-front-3'])
    expect(mirroredOdd).toEqual(['rig-a-front-2', 'rig-a-front-4'])

    plain.dispose()
    mirrored.dispose()
  })

  it('Vert mirror returns the back row when asked for front', () => {
    const [rigA] = makeTwoRigs({ frontPerRig: 4, backPerRig: 4 })
    const clock = new ManualTestClock() as unknown as Clock
    const plain = new RigChain({ rigId: 'plain', config: rigA.config, clock })
    const mirrored = new RigChain({
      rigId: 'mirrored',
      config: rigA.config,
      clock,
      mirror: { vert: true },
    })

    const plainFrontIds = plain.dmxLightManager
      .getLights(['front'], ['all'])
      .map((l) => l.id)
      .sort()
    const mirroredFrontIds = mirrored.dmxLightManager
      .getLights(['front'], ['all'])
      .map((l) => l.id)
      .sort()
    const plainBackIds = plain.dmxLightManager
      .getLights(['back'], ['all'])
      .map((l) => l.id)
      .sort()

    expect(plainFrontIds).toEqual([
      'rig-a-front-1',
      'rig-a-front-2',
      'rig-a-front-3',
      'rig-a-front-4',
    ])
    expect(mirroredFrontIds).toEqual(plainBackIds)

    plain.dispose()
    mirrored.dispose()
  })

  it('an unmirrored chain built from the same config is unaffected by a sibling mirror', () => {
    const [rigA] = makeTwoRigs({ frontPerRig: 4 })
    const clock = new ManualTestClock() as unknown as Clock
    const chainA = new RigChain({ rigId: 'a', config: rigA.config, clock })
    const chainB = new RigChain({
      rigId: 'b',
      config: rigA.config,
      clock,
      mirror: { horiz: true },
    })

    const aOrder = chainA.dmxLightManager.getLights(['front'], ['linear']).map((l) => l.id)
    const bOrder = chainB.dmxLightManager.getLights(['front'], ['linear']).map((l) => l.id)

    expect(aOrder).toEqual(['rig-a-front-1', 'rig-a-front-2', 'rig-a-front-3', 'rig-a-front-4'])
    expect(bOrder).toEqual([...aOrder].reverse())
    // Confirm the input rig config wasn't mutated by chainB's construction.
    expect(rigA.config.frontLights.map((l) => l.position)).toEqual([1, 2, 3, 4])

    chainA.dispose()
    chainB.dispose()
  })
})
