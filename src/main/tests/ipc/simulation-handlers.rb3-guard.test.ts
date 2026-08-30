/**
 * Simulation IPC handlers refuse to dispatch while the RB3E listener is enabled: the listener
 * owns the rig chains (cue mode re-dispatches the RB3 look at ~30 Hz), so each dispatching
 * handler returns its error shape and touches no chain. Stop handlers stay available.
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
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'

type Handler = (...args: unknown[]) => Promise<unknown> | unknown

const BLOCKED = { success: false, error: 'Disable RB3E before simulating cues' }

describe('simulation IPC handlers while RB3E is enabled', () => {
  let handlers: Map<string, Handler>
  let onBeat: jest.Mock
  let startTestEffect: jest.Mock
  let startRb3TestEffect: jest.Mock
  let setRb3SimulationLedState: jest.Mock

  beforeEach(() => {
    handlers = new Map()
    const ipc = {
      handle: jest.fn((channel: string, h: Handler) => {
        handlers.set(channel, h)
      }),
      on: jest.fn(),
    }
    onBeat = jest.fn()
    startTestEffect = jest.fn()
    startRb3TestEffect = jest.fn()
    setRb3SimulationLedState = jest.fn()
    const fanout = new ChainFanout()
    fanout.setChains([
      {
        rigId: 'a',
        isPrimary: true,
        sequencer: { onBeat, schedulePanTiltClear: jest.fn() },
        cueHandlers: {
          yarg: null,
          rb3: null,
        },
        audioCueHandler: null,
        rb3MenuCueHandler: null,
      } as unknown as RigChain,
    ])
    const motionCueSimulator = new MotionCueSimulator({ getChainFanout: () => fanout })
    const controllerManager = withCollaboratorGetters({
      setOnConsoleEnter: jest.fn(),
      setOnSimulationPreempt: jest.fn(),
      ensureChainsHaveHandlersForSimulation: jest.fn(),
      getChainFanout: () => fanout,
      getMotionCueSimulator: () => motionCueSimulator,
      getIsInitialized: () => true,
      getIsRb3Enabled: () => true,
      startTestEffect,
      startRb3TestEffect,
      setRb3SimulationLedState,
      init: jest.fn(),
    })
    setupSimulationHandlers(
      ipc as never,
      controllerManager as unknown as Parameters<typeof setupSimulationHandlers>[1],
    )
  })

  it('SIMULATE_BEAT/KEYFRAME/MEASURE return false and touch no chain', async () => {
    for (const channel of [LIGHT.SIMULATE_BEAT, LIGHT.SIMULATE_KEYFRAME, LIGHT.SIMULATE_MEASURE]) {
      const result = await handlers.get(channel)!({}, undefined)
      expect(result).toBe(false)
    }
    expect(onBeat).not.toHaveBeenCalled()
  })

  it('START_TEST_EFFECT returns the blocked error without starting the runner', async () => {
    const result = await handlers.get(LIGHT.START_TEST_EFFECT)!({}, { effectId: 'x' })
    expect(result).toEqual(BLOCKED)
    expect(startTestEffect).not.toHaveBeenCalled()
  })

  it('START_RB3_TEST_EFFECT returns the blocked error without starting the runner', async () => {
    const result = await handlers.get(LIGHT.START_RB3_TEST_EFFECT)!({}, { effectId: 'Strobe_Fast' })
    expect(result).toEqual(BLOCKED)
    expect(startRb3TestEffect).not.toHaveBeenCalled()
  })

  it('SET_RB3_SIM_LED_STATE returns the blocked error without setting state', async () => {
    const result = await handlers.get(LIGHT.SET_RB3_SIM_LED_STATE)!(
      {},
      { red: 1, green: 0, blue: 0, yellow: 0, fog: false },
    )
    expect(result).toEqual(BLOCKED)
    expect(setRb3SimulationLedState).not.toHaveBeenCalled()
  })

  it('SIMULATE_INSTRUMENT_NOTE returns the blocked error', async () => {
    const result = await handlers.get(LIGHT.SIMULATE_INSTRUMENT_NOTE)!(
      {},
      { instrument: 'drums', noteType: 'Kick' },
    )
    expect(result).toEqual(BLOCKED)
  })

  it('both motion-sim start handlers return the blocked error', async () => {
    for (const channel of [
      LIGHT.START_YARG_MOTION_CUE_SIMULATION,
      LIGHT.START_AUDIO_MOTION_CUE_SIMULATION,
    ]) {
      const result = await handlers.get(channel)!({}, { groupId: 'g', cueId: 'c' })
      expect(result).toEqual(BLOCKED)
    }
  })

  it('STOP_MOTION_CUE_SIMULATION stays available', async () => {
    const result = await handlers.get(LIGHT.STOP_MOTION_CUE_SIMULATION)!({})
    expect(result).toEqual({ success: true })
  })
})
