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

describe('simulate channel payloads', () => {
  let handlers: Map<string, Handler>
  let fanout: ChainFanout

  beforeEach(() => {
    handlers = new Map()
    const ipc = {
      handle: jest.fn((channel: string, h: Handler) => handlers.set(channel, h)),
      on: jest.fn(),
    }
    fanout = new ChainFanout()
    fanout.setChains([{ rigId: 'a', isPrimary: true } as unknown as RigChain])
    jest.spyOn(fanout, 'onBeat').mockImplementation(() => {})
    jest.spyOn(fanout, 'handleGuitarNote').mockImplementation(() => {})
    jest.spyOn(fanout, 'handleCue').mockImplementation(async () => {})
    const motionCueSimulator = new MotionCueSimulator({ getChainFanout: () => fanout })
    const controllerManager = withCollaboratorGetters({
      setOnConsoleEnter: jest.fn(),
      setOnSimulationPreempt: jest.fn(),
      getChainFanout: () => fanout,
      getMotionCueSimulator: () => motionCueSimulator,
      getIsInitialized: () => true,
      getIsRb3Enabled: () => false,
      getIsYargEnabled: () => false,
      getIsAudioEnabled: () => false,
      ensureChainsHaveHandlersForSimulation: jest.fn(),
      getVenueFrameProcessor: () => ({ getVenuePostProcessing: () => 'Default' }),
      init: jest.fn(),
    })
    setupSimulationHandlers(
      ipc as never,
      controllerManager as unknown as Parameters<typeof setupSimulationHandlers>[1],
    )
  })

  const beat = (payload: unknown) => handlers.get(LIGHT.SIMULATE_BEAT)!({}, payload)
  const note = (payload: unknown) => handlers.get(LIGHT.SIMULATE_INSTRUMENT_NOTE)!({}, payload)

  it('fires a beat for a payload it can read', async () => {
    const result = await beat({ venueSize: 'Large', bpm: 140, effectId: CueType.Chorus })

    expect(result).toBe(true)
    expect(fanout.onBeat).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['an unknown venue size', { venueSize: 'Stadium' }],
    ['a BPM outside the listener range', { bpm: 9000 }],
    ['a cue group that is not a string', { cueGroup: 7 }],
    ['an unknown cue id', { effectId: 'not-a-cue' }],
    ['a payload that is not an object', 'beat'],
  ])('answers false to %s without firing', async (_case, payload) => {
    const result = await beat(payload)

    expect(result).toBe(false)
    expect(fanout.onBeat).not.toHaveBeenCalled()
  })

  it('answers false when firing the beat throws', async () => {
    jest.mocked(fanout.onBeat).mockImplementation(() => {
      throw new Error('chain gone')
    })

    await expect(beat({ bpm: 120 })).resolves.toBe(false)
  })

  it.each([
    ['an unknown instrument', { instrument: 'kazoo', noteType: 'Green' }],
    ['an unknown note', { instrument: 'guitar', noteType: 'purple' }],
    ['a note that is not a string', { instrument: 'guitar', noteType: 3 }],
    ['an unknown venue size', { instrument: 'guitar', noteType: 'Green', venueSize: 'Stadium' }],
    ['a payload that is not an object', null],
  ])('refuses a note with %s', async (_case, payload) => {
    const result = await note(payload)

    expect(result).toMatchObject({ success: false })
    expect(fanout.handleGuitarNote).not.toHaveBeenCalled()
  })
})
