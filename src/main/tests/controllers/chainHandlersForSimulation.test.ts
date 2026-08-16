/**
 * Verifies the simulation helper that ensures every active rig chain has a cue handler in a
 * domain's slot. The simulation IPC path and TestEffectRunner depend on this being idempotent and
 * safe to call before or after the real network listener runs, for either game domain.
 */
import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ControllerManager } from '../../controllers/ControllerManager'
import { CueHandler } from '../../../photonics-dmx/cueHandlers/CueHandler'
import { RigChain } from '../../../photonics-dmx/controllers/RigChain'
import type { GameCueMode } from '../../../photonics-dmx/cues/types/nodeCueTypes'
import type { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'
import type { Sequencer } from '../../../photonics-dmx/controllers/sequencer/Sequencer'

function makeChainStub(rigId: string, isPrimary: boolean): RigChain {
  return {
    rigId,
    isPrimary,
    dmxLightManager: {} as DmxLightManager,
    sequencer: {} as Sequencer,
    cueHandlers: {
      yarg: null,
      rb3: null,
    },
    audioCueHandler: null,
    rb3MenuCueHandler: null,
  } as unknown as RigChain
}

interface MotionPrefsStub {
  minimumHoldMs?: number
  probabilityPercent?: number
  activeCueRef?: unknown
}

function makeStubController(
  chains: RigChain[],
  prefs: {
    motionEnabled?: boolean
    yargMotion?: MotionPrefsStub
    rb3Motion?: MotionPrefsStub
  } = {},
): ControllerManager {
  const motion = (p: MotionPrefsStub = {}) => ({
    minimumHoldMs: p.minimumHoldMs ?? 5000,
    probabilityPercent: p.probabilityPercent ?? 100,
    activeCueRef: p.activeCueRef ?? null,
  })
  const config = {
    getPreference: (key: string) => {
      if (key === 'motionEnabled') return prefs.motionEnabled ?? true
      if (key === 'cueDomains') {
        return {
          yargMotion: motion(prefs.yargMotion),
          rb3Motion: motion(prefs.rb3Motion),
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

describe.each<GameCueMode>(['yarg', 'rb3'])(
  'ControllerManager.ensureChainsHaveHandlersForSimulation (%s)',
  (domain) => {
    const other: GameCueMode = domain === 'yarg' ? 'rb3' : 'yarg'

    it('installs a cue handler on every chain that has none', () => {
      const a = makeChainStub('a', true)
      const b = makeChainStub('b', false)
      const cm = makeStubController([a, b])

      cm.ensureChainsHaveHandlersForSimulation(domain)

      expect(a.cueHandlers[domain]).toBeInstanceOf(CueHandler)
      expect(b.cueHandlers[domain]).toBeInstanceOf(CueHandler)
      // The other domain's slot is untouched.
      expect(a.cueHandlers[other]).toBeNull()
    })

    it('is idempotent: existing handlers are preserved on second call', () => {
      const a = makeChainStub('a', true)
      const b = makeChainStub('b', false)
      const cm = makeStubController([a, b])

      cm.ensureChainsHaveHandlersForSimulation(domain)
      const handlerA = a.cueHandlers[domain]
      const handlerB = b.cueHandlers[domain]

      cm.ensureChainsHaveHandlersForSimulation(domain)

      expect(a.cueHandlers[domain]).toBe(handlerA)
      expect(b.cueHandlers[domain]).toBe(handlerB)
    })

    it('preserves a handler the listener already installed', () => {
      const a = makeChainStub('a', true)
      const b = makeChainStub('b', false)
      const preExisting = { shutdown: jest.fn() } as unknown as CueHandler
      a.cueHandlers[domain] = preExisting
      const cm = makeStubController([a, b])

      cm.ensureChainsHaveHandlersForSimulation(domain)

      expect(a.cueHandlers[domain]).toBe(preExisting)
      expect(b.cueHandlers[domain]).toBeInstanceOf(CueHandler)
    })

    it('seeds each new handler with the domain motion preferences from config', () => {
      const a = makeChainStub('a', true)
      const cm = makeStubController([a], {
        motionEnabled: false,
        [`${domain === 'yarg' ? 'yarg' : 'rb3'}Motion`]: {
          activeCueRef: { groupId: 'g', cueId: 'c' },
        },
      })

      cm.ensureChainsHaveHandlersForSimulation(domain)

      const handler = a.cueHandlers[domain] as unknown as { motionEnabled: boolean }
      expect(handler.motionEnabled).toBe(false)
    })

    it('no-ops on an empty rigChains list', () => {
      const cm = makeStubController([])
      expect(() => cm.ensureChainsHaveHandlersForSimulation(domain)).not.toThrow()
    })
  },
)
