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

describe('START_TEST_EFFECT payload', () => {
  let handlers: Map<string, Handler>
  let startTestEffect: jest.Mock

  beforeEach(() => {
    handlers = new Map()
    const ipc = {
      handle: jest.fn((channel: string, h: Handler) => handlers.set(channel, h)),
      on: jest.fn(),
    }
    startTestEffect = jest.fn()
    const fanout = new ChainFanout()
    fanout.setChains([{ rigId: 'a', isPrimary: true } as unknown as RigChain])
    const motionCueSimulator = new MotionCueSimulator({ getChainFanout: () => fanout })
    const controllerManager = withCollaboratorGetters({
      setOnConsoleEnter: jest.fn(),
      setOnSimulationPreempt: jest.fn(),
      getChainFanout: () => fanout,
      getMotionCueSimulator: () => motionCueSimulator,
      getIsInitialized: () => true,
      getIsRb3Enabled: () => false,
      startTestEffect,
      init: jest.fn(),
    })
    setupSimulationHandlers(
      ipc as never,
      controllerManager as unknown as Parameters<typeof setupSimulationHandlers>[1],
    )
  })

  const start = (payload: unknown) => handlers.get(LIGHT.START_TEST_EFFECT)!({}, payload)

  it('starts a known cue with the options it was given', async () => {
    const result = await start({
      effectId: CueType.Cool_Automatic,
      venueSize: 'Large',
      bpm: 140,
      cueGroup: 'yarg-stagekit',
    })

    expect(result).toEqual({ success: true })
    expect(startTestEffect).toHaveBeenCalledWith(
      CueType.Cool_Automatic,
      'Large',
      140,
      'yarg-stagekit',
    )
  })

  it.each([
    ['an unknown cue id', { effectId: 'not-a-cue' }],
    ['a missing cue id', {}],
    ['a BPM below the listener floor', { effectId: CueType.Cool_Automatic, bpm: 5 }],
    ['a BPM above the listener ceiling', { effectId: CueType.Cool_Automatic, bpm: 9000 }],
    ['a BPM that is not a number', { effectId: CueType.Cool_Automatic, bpm: 'fast' }],
    ['an unknown venue size', { effectId: CueType.Cool_Automatic, venueSize: 'Stadium' }],
    ['a cue group that is not a string', { effectId: CueType.Cool_Automatic, cueGroup: 7 }],
    ['a payload that is not an object', 'Cool_Automatic'],
  ])('refuses %s without starting the runner', async (_case, payload) => {
    const result = await start(payload)

    expect(result).toMatchObject({ success: false })
    expect(startTestEffect).not.toHaveBeenCalled()
  })
})
