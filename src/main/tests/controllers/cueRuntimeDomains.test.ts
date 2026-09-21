import { describe, expect, it, jest } from '@jest/globals'
import { buildDomainChainHandlers } from '../../controllers/cueRuntimeDomains'
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'
import type { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'
import type { Sequencer } from '../../../photonics-dmx/controllers/sequencer/Sequencer'

function makeChainStub(rigId: string, isPrimary: boolean): RigChain {
  return {
    rigId,
    isPrimary,
    dmxLightManager: {} as DmxLightManager,
    sequencer: {
      onMotionPatternsCleared: () => () => {},
      schedulePanTiltClear: jest.fn(),
      cancelPanTiltClear: jest.fn(),
    } as unknown as Sequencer,
    cueHandlers: { yarg: null, rb3: null },
    audioCueHandler: null,
    rb3MenuCueHandler: null,
  } as unknown as RigChain
}

function options(replaceExisting: boolean) {
  return {
    getMotionEnabled: () => true,
    getMotionCueMinimumHoldMs: () => 5000,
    getMotionCueProbabilityPercent: () => 100,
    getActiveMotionCueRef: () => null,
    runtimeBroadcaster: { emit: jest.fn() },
    replaceExisting,
  }
}

describe('buildDomainChainHandlers motion coordinator', () => {
  it('gives every chain the same coordinator and returns the primary handler', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)

    const primary = buildDomainChainHandlers('yarg', [a, b], options(true))

    expect(primary).toBe(a.cueHandlers.yarg)
    expect(a.cueHandlers.yarg!.getMotionCoordinator()).toBe(
      b.cueHandlers.yarg!.getMotionCoordinator(),
    )
  })

  it('a top-up joins the coordinator the running handlers already use', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    buildDomainChainHandlers('yarg', [a], options(true))
    const running = a.cueHandlers.yarg!

    buildDomainChainHandlers('yarg', [a, b], options(false))

    expect(a.cueHandlers.yarg).toBe(running)
    expect(b.cueHandlers.yarg!.getMotionCoordinator()).toBe(running.getMotionCoordinator())
  })

  it('a rebuild shuts the old handlers down and starts a fresh coordinator', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    buildDomainChainHandlers('yarg', [a, b], options(true))
    const first = a.cueHandlers.yarg!
    const shutdown = jest.spyOn(first, 'shutdown')

    buildDomainChainHandlers('yarg', [a, b], options(true))

    expect(shutdown).toHaveBeenCalledTimes(1)
    expect(a.cueHandlers.yarg).not.toBe(first)
    expect(a.cueHandlers.yarg!.getMotionCoordinator()).not.toBe(first.getMotionCoordinator())
    expect(a.cueHandlers.yarg!.getMotionCoordinator()).toBe(
      b.cueHandlers.yarg!.getMotionCoordinator(),
    )
  })

  it('keeps the RB3 domain on its own coordinator', () => {
    const a = makeChainStub('a', true)
    buildDomainChainHandlers('yarg', [a], options(true))
    buildDomainChainHandlers('rb3', [a], options(true))

    expect(a.cueHandlers.rb3!.getMotionCoordinator()).not.toBe(
      a.cueHandlers.yarg!.getMotionCoordinator(),
    )
  })
})
