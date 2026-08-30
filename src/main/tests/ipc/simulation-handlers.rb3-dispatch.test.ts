/**
 * With the live RB3E listener disabled, START_RB3_TEST_EFFECT validates the cue id and delegates
 * to the interval-driven RB3 test-effect runner (so a held strobe re-fires cue-called
 * continuously). The per-chain dispatch routing is covered by the TestEffectRunner and
 * ChainCueRuntime tests.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { withCollaboratorGetters } from './managerFacades'

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

import { setupSimulationHandlers } from '../../ipc/simulation-handlers'
import { LIGHT } from '../../../shared/ipcChannels'
import { ChainFanout } from '../../../photonics-dmx/controllers/ChainFanout'
import { MotionCueSimulator } from '../../controllers/MotionCueSimulator'
import { CueType } from '../../../photonics-dmx/cues/types/cueTypes'
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'

type Handler = (...args: unknown[]) => Promise<unknown> | unknown

describe('START_RB3_TEST_EFFECT while RB3E is disabled', () => {
  let handlers: Map<string, Handler>
  let startRb3TestEffect: jest.Mock

  beforeEach(() => {
    handlers = new Map()
    const ipc = {
      handle: jest.fn((channel: string, h: Handler) => handlers.set(channel, h)),
      on: jest.fn(),
    }
    startRb3TestEffect = jest.fn()
    const fanout = new ChainFanout()
    fanout.setChains([{ rigId: 'a', isPrimary: true } as unknown as RigChain])
    const motionCueSimulator = new MotionCueSimulator({ getChainFanout: () => fanout })
    const controllerManager = withCollaboratorGetters({
      setOnConsoleEnter: jest.fn(),
      setOnSimulationPreempt: jest.fn(),
      ensureChainsHaveHandlersForSimulation: jest.fn(),
      getChainFanout: () => fanout,
      getMotionCueSimulator: () => motionCueSimulator,
      getIsInitialized: () => true,
      getIsRb3Enabled: () => false,
      startRb3TestEffect,
      init: jest.fn(),
    })
    setupSimulationHandlers(
      ipc as never,
      controllerManager as unknown as Parameters<typeof setupSimulationHandlers>[1],
    )
  })

  it('delegates a valid cue to the RB3 test-effect runner', async () => {
    const result = await handlers.get(LIGHT.START_RB3_TEST_EFFECT)!(
      {},
      { effectId: CueType.Strobe_Fast, venueSize: 'Small', bpm: 120, cueGroup: 'rb3-stagekit' },
    )

    expect(result).toEqual({ success: true })
    expect(startRb3TestEffect).toHaveBeenCalledWith(
      CueType.Strobe_Fast,
      'Small',
      120,
      'rb3-stagekit',
    )
  })

  it('rejects an unknown cue id without starting the runner', async () => {
    const result = await handlers.get(LIGHT.START_RB3_TEST_EFFECT)!(
      {},
      { effectId: 'not-a-real-cue' },
    )
    expect(result).toMatchObject({ success: false })
    expect(startRb3TestEffect).not.toHaveBeenCalled()
  })
})
