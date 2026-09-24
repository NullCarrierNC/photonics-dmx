import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { withCollaboratorGetters } from './managerFacades'

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

import { setupSimulationHandlers } from '../../ipc/simulation-handlers'
import { LIGHT } from '../../../shared/ipcChannels'
import { ChainFanout } from '../../../photonics-dmx/controllers/ChainFanout'
import { MotionCueSimulator } from '../../controllers/MotionCueSimulator'
import type { LifecyclePhase } from '../../../shared/ipcTypes'

type Handler = (...args: unknown[]) => Promise<unknown> | unknown

describe('simulation IPC handlers while the controllers are held failed', () => {
  const REFUSED = {
    success: false,
    error: 'Restart the lighting controllers before simulating cues',
  }
  let handlers: Map<string, Handler>
  let phase: LifecyclePhase
  let startTestEffect: jest.Mock
  let startRb3TestEffect: jest.Mock
  let setVenuePostProcessing: jest.Mock

  beforeEach(() => {
    handlers = new Map()
    phase = 'failed'
    const ipc = {
      handle: jest.fn((channel: string, h: Handler) => {
        handlers.set(channel, h)
      }),
      on: jest.fn(),
    }
    startTestEffect = jest.fn()
    startRb3TestEffect = jest.fn()
    setVenuePostProcessing = jest.fn()
    const fanout = new ChainFanout()
    const motionCueSimulator = new MotionCueSimulator({ getChainFanout: () => fanout })
    const controllerManager = withCollaboratorGetters({
      setOnConsoleEnter: jest.fn(),
      setOnSimulationPreempt: jest.fn(),
      ensureChainsHaveHandlersForSimulation: jest.fn(),
      getChainFanout: () => fanout,
      getMotionCueSimulator: () => motionCueSimulator,
      getIsInitialized: () => true,
      getLifecyclePhase: () => phase,
      getVenueFrameProcessor: () => ({
        getVenuePostProcessing: () => undefined,
        setVenuePostProcessing,
      }),
      getIsRb3Enabled: () => false,
      getIsYargEnabled: () => false,
      getIsAudioEnabled: () => false,
      startTestEffect,
      startRb3TestEffect,
      setRb3SimulationLedState: jest.fn(),
      init: jest.fn(),
    })
    setupSimulationHandlers(ipc as never, controllerManager as never)
  })

  it('refuses a test effect on either runner', async () => {
    expect(await handlers.get(LIGHT.START_TEST_EFFECT)!({}, { effectId: 'x' })).toEqual(REFUSED)
    expect(
      await handlers.get(LIGHT.START_RB3_TEST_EFFECT)!({}, { effectId: 'Strobe_Fast' }),
    ).toEqual(REFUSED)
    expect(startTestEffect).not.toHaveBeenCalled()
    expect(startRb3TestEffect).not.toHaveBeenCalled()
  })

  it('refuses the simulated timing and venue events', async () => {
    for (const channel of [LIGHT.SIMULATE_BEAT, LIGHT.SIMULATE_KEYFRAME, LIGHT.SIMULATE_MEASURE]) {
      expect(await handlers.get(channel)!({}, undefined)).toBe(false)
    }
    expect(await handlers.get(LIGHT.SIMULATE_POST_PROCESSING)!({}, { state: 'Default' })).toBe(
      false,
    )
    expect(setVenuePostProcessing).not.toHaveBeenCalled()
  })

  it('refuses every motion simulation start', async () => {
    for (const channel of [
      LIGHT.START_YARG_MOTION_CUE_SIMULATION,
      LIGHT.START_RB3_MOTION_CUE_SIMULATION,
      LIGHT.START_AUDIO_MOTION_CUE_SIMULATION,
    ]) {
      expect(await handlers.get(channel)!({}, { groupId: 'g', cueId: 'c' })).toEqual(REFUSED)
    }
  })
})
