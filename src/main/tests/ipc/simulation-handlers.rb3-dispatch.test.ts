/**
 * With the live RB3E listener disabled, START_RB3_TEST_EFFECT resolves the selected cue and
 * dispatches it through Rb3ChainRuntime to every chain's rb3CueHandler (never the YARG slot),
 * so RB3 cue mode can be simulated without a real RB3E source.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

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
  let rb3HandleCue: jest.Mock
  let yargHandleCue: jest.Mock

  beforeEach(() => {
    handlers = new Map()
    const ipc = {
      handle: jest.fn((channel: string, h: Handler) => handlers.set(channel, h)),
      on: jest.fn(),
    }
    rb3HandleCue = jest.fn(async () => {})
    yargHandleCue = jest.fn(async () => {})
    const fanout = new ChainFanout()
    fanout.setChains([
      {
        rigId: 'a',
        isPrimary: true,
        sequencer: { schedulePanTiltClear: jest.fn() },
        rb3CueHandler: { handleCue: rb3HandleCue },
        yargCueHandler: { handleCue: yargHandleCue },
      } as unknown as RigChain,
    ])
    const motionCueSimulator = new MotionCueSimulator({ getChainFanout: () => fanout })
    const controllerManager = {
      setOnConsoleEnter: jest.fn(),
      setOnSimulationPreempt: jest.fn(),
      ensureChainsHaveYargHandlersForSimulation: jest.fn(),
      // No-op: the chain above already carries a mock rb3CueHandler.
      ensureChainsHaveRb3HandlersForSimulation: jest.fn(),
      getChainFanout: () => fanout,
      getMotionCueSimulator: () => motionCueSimulator,
      getIsInitialized: () => true,
      getIsRb3Enabled: () => false,
      init: jest.fn(),
    }
    setupSimulationHandlers(
      ipc as never,
      controllerManager as unknown as Parameters<typeof setupSimulationHandlers>[1],
    )
  })

  it('dispatches the resolved cue to the RB3 handler, never the YARG slot', async () => {
    const result = await handlers.get(LIGHT.START_RB3_TEST_EFFECT)!(
      {},
      { effectId: CueType.Strobe_Fast, venueSize: 'Small', bpm: 120 },
    )

    expect(result).toEqual({ success: true })
    expect(rb3HandleCue).toHaveBeenCalled()
    expect(rb3HandleCue.mock.calls[0][0]).toBe(CueType.Strobe_Fast)
    expect(yargHandleCue).not.toHaveBeenCalled()
  })

  it('rejects an unknown cue id without dispatching', async () => {
    const result = await handlers.get(LIGHT.START_RB3_TEST_EFFECT)!(
      {},
      { effectId: 'not-a-real-cue' },
    )
    expect(result).toMatchObject({ success: false })
    expect(rb3HandleCue).not.toHaveBeenCalled()
  })
})
