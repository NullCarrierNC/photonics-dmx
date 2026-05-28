/**
 * Verifies the simulation helper that ensures every active rig chain has a YargCueHandler
 * attached. The simulation IPC path and TestEffectRunner depend on this being idempotent
 * and safe to call before/after the real network listener runs.
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
    rb3MenuCueHandler: null,
  } as unknown as RigChain
}

function makeStubController(
  chains: RigChain[],
  prefs: {
    motionEnabled?: boolean
    yargMotion?: { minimumHoldMs?: number; probabilityPercent?: number; activeCueRef?: unknown }
  } = {},
): ControllerManager {
  const config = {
    getPreference: (key: string) => {
      if (key === 'motionEnabled') return prefs.motionEnabled ?? true
      if (key === 'cueDomains') {
        return {
          yargMotion: {
            minimumHoldMs: prefs.yargMotion?.minimumHoldMs ?? 5000,
            probabilityPercent: prefs.yargMotion?.probabilityPercent ?? 100,
            activeCueRef: prefs.yargMotion?.activeCueRef ?? null,
          },
        }
      }
      return undefined
    },
  }
  // Prototype-stub controller manager with just enough state for the helper to run.
  const stub = Object.create(ControllerManager.prototype) as Record<string, unknown>
  stub.config = config
  stub.rigChains = chains
  return stub as unknown as ControllerManager
}

describe('ControllerManager.ensureChainsHaveYargHandlersForSimulation', () => {
  it('installs a YargCueHandler on every chain that has none', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const cm = makeStubController([a, b])

    cm.ensureChainsHaveYargHandlersForSimulation()

    expect(a.yargCueHandler).toBeInstanceOf(YargCueHandler)
    expect(b.yargCueHandler).toBeInstanceOf(YargCueHandler)
  })

  it('is idempotent: existing handlers are preserved on second call', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const cm = makeStubController([a, b])

    cm.ensureChainsHaveYargHandlersForSimulation()
    const handlerA = a.yargCueHandler
    const handlerB = b.yargCueHandler

    cm.ensureChainsHaveYargHandlersForSimulation()

    // Same instances — the helper short-circuits when the slot is already populated.
    expect(a.yargCueHandler).toBe(handlerA)
    expect(b.yargCueHandler).toBe(handlerB)
  })

  it('preserves pre-existing handlers installed by enableYargInternal', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const preExisting = { shutdown: jest.fn() } as unknown as YargCueHandler
    a.yargCueHandler = preExisting
    const cm = makeStubController([a, b])

    cm.ensureChainsHaveYargHandlersForSimulation()

    // Chain a keeps the listener's handler; chain b gets a new one.
    expect(a.yargCueHandler).toBe(preExisting)
    expect(b.yargCueHandler).toBeInstanceOf(YargCueHandler)
  })

  it('seeds each new handler with motion preferences from config', () => {
    const a = makeChainStub('a', true)
    const cm = makeStubController([a], {
      motionEnabled: false,
      yargMotion: { activeCueRef: { groupId: 'g', cueId: 'c' } },
    })

    cm.ensureChainsHaveYargHandlersForSimulation()

    // YargCueHandler exposes these via internal fields; verify by calling its read paths.
    // motionEnabled=false means setMotionEnabled(true) would be a state change (no longer
    // false). Easiest assertion: the handler exists and `setMotionEnabled` wasn't a no-op
    // for the seed call.
    const handler = a.yargCueHandler as unknown as { motionEnabled: boolean }
    expect(handler.motionEnabled).toBe(false)
  })

  it('no-ops on an empty rigChains list', () => {
    const cm = makeStubController([])
    expect(() => cm.ensureChainsHaveYargHandlersForSimulation()).not.toThrow()
  })
})
