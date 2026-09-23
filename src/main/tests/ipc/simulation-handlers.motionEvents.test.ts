import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { withCollaboratorGetters } from './managerFacades'

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

import { sendToAllWindows } from '../../utils/windowUtils'
import { setupSimulationHandlers } from '../../ipc/simulation-handlers'
import { LIGHT, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { ChainFanout } from '../../../photonics-dmx/controllers/ChainFanout'
import { MotionCueSimulator } from '../../controllers/MotionCueSimulator'
import { CueRegistry } from '../../../photonics-dmx/cues/registries/CueRegistry'
import { getCueRegistry } from '../../../photonics-dmx/cues/registries/cueRegistries'
import { AudioCueRegistry } from '../../../photonics-dmx/cues/registries/AudioCueRegistry'
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'

type Handler = (...args: unknown[]) => Promise<unknown> | unknown

const GROUP = 'sim-motion-events-group'
const CLEARED = { ref: null, source: 'cleared', manualFallback: false }

function makeChainStub(rigId: string): RigChain {
  return {
    rigId,
    isPrimary: true,
    dmxLightManager: {} as RigChain['dmxLightManager'],
    sequencer: {
      schedulePanTiltClear: jest.fn(),
      cancelPanTiltClear: jest.fn(),
    } as unknown as RigChain['sequencer'],
    cueHandlers: { yarg: null, rb3: null },
    audioCueHandler: null,
    rb3MenuCueHandler: null,
  } as unknown as RigChain
}

function registerMotionGroup(registry: { registerGroup: (group: never) => void }): void {
  registry.registerGroup({
    id: GROUP,
    name: 'sim',
    description: '',
    cues: new Map(),
    motionCues: new Map([['m1', { id: 'm1', cueId: 'm1', execute: jest.fn() }]]),
  } as never)
}

describe('motion simulation events', () => {
  const handlers = new Map<string, Handler>()
  let sim: MotionCueSimulator

  beforeEach(() => {
    jest.mocked(sendToAllWindows).mockClear()
    handlers.clear()
    CueRegistry.getInstance().reset()
    getCueRegistry('rb3').reset()
    AudioCueRegistry.getInstance().reset()
    registerMotionGroup(CueRegistry.getInstance())
    registerMotionGroup(getCueRegistry('rb3'))
    registerMotionGroup(AudioCueRegistry.getInstance())
    const fanout = new ChainFanout()
    fanout.setChains([makeChainStub('a')])
    sim = new MotionCueSimulator({ getChainFanout: () => fanout })
    const ipcMain = {
      handle: (channel: string, h: Handler) => {
        handlers.set(channel, h)
      },
      on: jest.fn(),
    }
    const manager = withCollaboratorGetters({
      setOnConsoleEnter: jest.fn(),
      setOnSimulationPreempt: jest.fn(),
      ensureChainsHaveHandlersForSimulation: jest.fn(),
      getChainFanout: () => fanout,
      getMotionCueSimulator: () => sim,
      getIsInitialized: () => true,
      getIsRb3Enabled: () => false,
      getIsYargEnabled: () => false,
      getDmxPublisher: () => null,
      getVenueFrameProcessor: () => ({ getVenuePostProcessing: () => 'Default' }),
      init: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    })
    setupSimulationHandlers(ipcMain as never, manager as never)
  })

  afterEach(() => {
    CueRegistry.getInstance().reset()
    getCueRegistry('rb3').reset()
    AudioCueRegistry.getInstance().reset()
  })

  const start = (channel: string): Promise<unknown> =>
    Promise.resolve(handlers.get(channel)!({}, { groupId: GROUP, cueId: 'm1' }))

  it('stopping an RB3 simulation clears the RB3 preview and leaves the YARG one', async () => {
    await start(LIGHT.START_RB3_MOTION_CUE_SIMULATION)
    jest.mocked(sendToAllWindows).mockClear()

    await handlers.get(LIGHT.STOP_MOTION_CUE_SIMULATION)!({})

    expect(sendToAllWindows).toHaveBeenCalledTimes(1)
    expect(sendToAllWindows).toHaveBeenCalledWith(RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE, CLEARED)
  })

  it('an audio simulation announces its cue and clears it when stopped', async () => {
    await start(LIGHT.START_AUDIO_MOTION_CUE_SIMULATION)

    expect(sendToAllWindows).toHaveBeenCalledWith(RENDERER_RECEIVE.AUDIO_MOTION_CUE_CHANGE, {
      ref: { groupId: GROUP, cueId: 'm1' },
      source: 'auto',
      manualFallback: false,
    })
    jest.mocked(sendToAllWindows).mockClear()

    await handlers.get(LIGHT.STOP_MOTION_CUE_SIMULATION)!({})

    expect(sendToAllWindows).toHaveBeenCalledWith(RENDERER_RECEIVE.AUDIO_MOTION_CUE_CHANGE, CLEARED)
  })

  it('starting a YARG simulation clears a running RB3 one before announcing itself', async () => {
    await start(LIGHT.START_RB3_MOTION_CUE_SIMULATION)
    jest.mocked(sendToAllWindows).mockClear()

    await start(LIGHT.START_YARG_MOTION_CUE_SIMULATION)

    const calls = jest.mocked(sendToAllWindows).mock.calls
    expect(calls[0]).toEqual([RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE, CLEARED])
    expect(calls[1]).toEqual([
      RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
      { ref: { groupId: GROUP, cueId: 'm1' }, source: 'auto', manualFallback: false },
    ])
  })

  it('stopping with nothing running sends nothing', async () => {
    await handlers.get(LIGHT.STOP_MOTION_CUE_SIMULATION)!({})

    expect(sendToAllWindows).not.toHaveBeenCalled()
  })
})
