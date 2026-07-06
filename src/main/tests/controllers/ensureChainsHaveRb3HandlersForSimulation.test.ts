/**
 * Verifies the simulation helper that ensures every active rig chain has an RB3 cue handler
 * attached (bound to the RB3 cue registry). The RB3 cue-simulation path depends on this being
 * idempotent and safe to call before/after the live RB3E listener runs, mirroring the YARG twin.
 */
import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ControllerManager } from '../../controllers/ControllerManager'
import { YargCueHandler } from '../../../photonics-dmx/cueHandlers/YargCueHandler'
import { RigChain } from '../../../photonics-dmx/controllers/RigChain'
import type { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'
import type { Sequencer } from '../../../photonics-dmx/controllers/sequencer/Sequencer'

function makeChainStub(rigId: string, isPrimary: boolean): RigChain {
  return {
    rigId,
    isPrimary,
    dmxLightManager: {} as DmxLightManager,
    sequencer: {} as Sequencer,
    yargCueHandler: null,
    audioCueHandler: null,
    rb3CueHandler: null,
    rb3MenuCueHandler: null,
  } as unknown as RigChain
}

function makeStubController(
  chains: RigChain[],
  prefs: {
    motionEnabled?: boolean
    rb3Motion?: { minimumHoldMs?: number; probabilityPercent?: number; activeCueRef?: unknown }
  } = {},
): ControllerManager {
  const config = {
    getPreference: (key: string) => {
      if (key === 'motionEnabled') return prefs.motionEnabled ?? true
      if (key === 'cueDomains') {
        return {
          rb3Motion: {
            minimumHoldMs: prefs.rb3Motion?.minimumHoldMs ?? 5000,
            probabilityPercent: prefs.rb3Motion?.probabilityPercent ?? 100,
            activeCueRef: prefs.rb3Motion?.activeCueRef ?? null,
          },
        }
      }
      return undefined
    },
  }
  const stub = Object.create(ControllerManager.prototype) as Record<string, unknown>
  stub.config = config
  stub.rigChains = chains
  return stub as unknown as ControllerManager
}

describe('ControllerManager.ensureChainsHaveRb3HandlersForSimulation', () => {
  it('installs an RB3 cue handler on every chain that has none', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const cm = makeStubController([a, b])

    cm.ensureChainsHaveRb3HandlersForSimulation()

    expect(a.rb3CueHandler).toBeInstanceOf(YargCueHandler)
    expect(b.rb3CueHandler).toBeInstanceOf(YargCueHandler)
    // The YARG slot is untouched by the RB3 helper.
    expect(a.yargCueHandler).toBeNull()
  })

  it('is idempotent: existing handlers are preserved on second call', () => {
    const a = makeChainStub('a', true)
    const cm = makeStubController([a])

    cm.ensureChainsHaveRb3HandlersForSimulation()
    const handlerA = a.rb3CueHandler

    cm.ensureChainsHaveRb3HandlersForSimulation()

    expect(a.rb3CueHandler).toBe(handlerA)
  })

  it('seeds each new handler with RB3 motion preferences from config', () => {
    const a = makeChainStub('a', true)
    const cm = makeStubController([a], {
      motionEnabled: false,
      rb3Motion: { activeCueRef: { groupId: 'g', cueId: 'c' } },
    })

    cm.ensureChainsHaveRb3HandlersForSimulation()

    const handler = a.rb3CueHandler as unknown as { motionEnabled: boolean }
    expect(handler.motionEnabled).toBe(false)
  })

  it('no-ops on an empty rigChains list', () => {
    const cm = makeStubController([])
    expect(() => cm.ensureChainsHaveRb3HandlersForSimulation()).not.toThrow()
  })
})
