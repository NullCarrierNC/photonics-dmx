/**
 * Verifies the simulation IPC handlers fan out to every active rig chain so cue simulation
 * and motion simulation aren't primary-rig-only. Each test wires a minimal ControllerManager
 * stub that exposes a ChainFanout backed by N stub chains; assertions check that:
 *  - SIMULATE_BEAT/KEYFRAME/MEASURE call the fanout's direct-sequencer methods.
 *  - SIMULATE_INSTRUMENT_NOTE routes through the fanout's per-instrument methods.
 *  - START_YARG/AUDIO_MOTION_CUE_SIMULATION executes the cue once per chain with that
 *    chain's (sequencer, lightManager) pair.
 *  - STOP_MOTION_CUE_SIMULATION clears pan/tilt on every chain via the fanout.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

import { setupSimulationHandlers } from '../../ipc/simulation-handlers'
import { LIGHT } from '../../../shared/ipcChannels'
import { ChainFanout } from '../../../photonics-dmx/controllers/ChainFanout'
import { YargCueRegistry } from '../../../photonics-dmx/cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../../../photonics-dmx/cues/registries/AudioCueRegistry'
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'

type Handler = (...args: unknown[]) => Promise<unknown> | unknown

interface FakeIpcMain {
  handle: jest.Mock
  on: jest.Mock
  getHandler: (channel: string) => Handler | undefined
}

function makeIpcMain(): FakeIpcMain {
  const handlers = new Map<string, Handler>()
  const handle = jest.fn((channel: string, h: Handler) => {
    handlers.set(channel, h)
  })
  return {
    handle: handle as unknown as jest.Mock,
    on: jest.fn() as unknown as jest.Mock,
    getHandler: (c) => handlers.get(c),
  }
}

function makeChainStub(rigId: string, isPrimary: boolean): RigChain {
  return {
    rigId,
    isPrimary,
    dmxLightManager: { id: `lm-${rigId}` } as unknown as RigChain['dmxLightManager'],
    sequencer: {
      onBeat: jest.fn(),
      onMeasure: jest.fn(),
      onKeyframe: jest.fn(),
      schedulePanTiltClear: jest.fn(),
      cancelPanTiltClear: jest.fn(),
    } as unknown as RigChain['sequencer'],
    yargCueHandler: {
      handleCue: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      handleDrumNote: jest.fn(),
      handleGuitarNote: jest.fn(),
      handleBassNote: jest.fn(),
      handleKeysNote: jest.fn(),
    } as unknown as RigChain['yargCueHandler'],
    audioCueHandler: null,
    rb3MenuCueHandler: null,
  } as unknown as RigChain
}

describe('simulation IPC handlers fan out to every active rig chain', () => {
  const TEST_GROUP = 'sim-fanout-test-group'
  let yargRegistry: YargCueRegistry
  let audioRegistry: AudioCueRegistry
  let chains: RigChain[]
  let fanout: ChainFanout
  let ipc: FakeIpcMain
  let controllerManager: {
    setOnConsoleEnter: jest.Mock
    ensureChainsHaveYargHandlersForSimulation: jest.Mock
    getChainFanout: () => ChainFanout
    getIsInitialized: () => boolean
    init: jest.Mock
  }
  // Cast for setupSimulationHandlers' parameter type — the IPC handlers exercise only a
  // narrow ControllerManager surface; the stub is intentionally minimal.
  const asControllerManager = (
    cm: typeof controllerManager,
  ): Parameters<typeof setupSimulationHandlers>[1] =>
    cm as unknown as Parameters<typeof setupSimulationHandlers>[1]

  beforeEach(() => {
    yargRegistry = YargCueRegistry.getInstance()
    yargRegistry.reset()
    audioRegistry = AudioCueRegistry.getInstance()
    audioRegistry.reset()
    chains = [makeChainStub('a', true), makeChainStub('b', false)]
    fanout = new ChainFanout()
    fanout.setChains(chains)
    ipc = makeIpcMain()
    controllerManager = {
      setOnConsoleEnter: jest.fn(),
      ensureChainsHaveYargHandlersForSimulation: jest.fn(),
      getChainFanout: () => fanout,
      getIsInitialized: () => true,
      init: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
    setupSimulationHandlers(ipc as never, asControllerManager(controllerManager))
  })

  afterEach(() => {
    yargRegistry.reset()
    audioRegistry.reset()
  })

  it('SIMULATE_BEAT calls yargOnBeat on the fanout (every chain sequencer)', async () => {
    const handler = ipc.getHandler(LIGHT.SIMULATE_BEAT)!
    await handler({}, undefined)
    expect(chains[0].sequencer.onBeat).toHaveBeenCalledTimes(1)
    expect(chains[1].sequencer.onBeat).toHaveBeenCalledTimes(1)
    expect(controllerManager.ensureChainsHaveYargHandlersForSimulation).toHaveBeenCalledTimes(1)
  })

  it('SIMULATE_KEYFRAME calls yargOnKeyframe on the fanout', async () => {
    const handler = ipc.getHandler(LIGHT.SIMULATE_KEYFRAME)!
    await handler({}, undefined)
    expect(chains[0].sequencer.onKeyframe).toHaveBeenCalledTimes(1)
    expect(chains[1].sequencer.onKeyframe).toHaveBeenCalledTimes(1)
  })

  it('SIMULATE_MEASURE calls yargOnMeasure on the fanout', async () => {
    const handler = ipc.getHandler(LIGHT.SIMULATE_MEASURE)!
    await handler({}, undefined)
    expect(chains[0].sequencer.onMeasure).toHaveBeenCalledTimes(1)
    expect(chains[1].sequencer.onMeasure).toHaveBeenCalledTimes(1)
  })

  it('SIMULATE_INSTRUMENT_NOTE routes drum notes through every chain handler', async () => {
    const handler = ipc.getHandler(LIGHT.SIMULATE_INSTRUMENT_NOTE)!
    await handler({}, { instrument: 'drums', noteType: 'Kick' })
    expect(chains[0].yargCueHandler!.handleDrumNote).toHaveBeenCalledTimes(1)
    expect(chains[1].yargCueHandler!.handleDrumNote).toHaveBeenCalledTimes(1)
  })

  it('SIMULATE_INSTRUMENT_NOTE routes guitar/bass/keys through every chain handler', async () => {
    const handler = ipc.getHandler(LIGHT.SIMULATE_INSTRUMENT_NOTE)!
    await handler({}, { instrument: 'guitar', noteType: 'Green' })
    await handler({}, { instrument: 'bass', noteType: 'Red' })
    await handler({}, { instrument: 'keys', noteType: 'Blue' })
    expect(chains[0].yargCueHandler!.handleGuitarNote).toHaveBeenCalledTimes(1)
    expect(chains[1].yargCueHandler!.handleGuitarNote).toHaveBeenCalledTimes(1)
    expect(chains[0].yargCueHandler!.handleBassNote).toHaveBeenCalledTimes(1)
    expect(chains[1].yargCueHandler!.handleBassNote).toHaveBeenCalledTimes(1)
    expect(chains[0].yargCueHandler!.handleKeysNote).toHaveBeenCalledTimes(1)
    expect(chains[1].yargCueHandler!.handleKeysNote).toHaveBeenCalledTimes(1)
  })

  it('START_YARG_MOTION_CUE_SIMULATION executes the cue once per chain with that chain pair', async () => {
    const execute = jest.fn<(...args: unknown[]) => void>(() => undefined)
    yargRegistry.registerGroup({
      id: TEST_GROUP,
      name: 'sim',
      description: '',
      cues: new Map(),
      motionCues: new Map([['m1', { id: 'm1', cueId: 'm1', execute } as never]]),
    })
    const handler = ipc.getHandler(LIGHT.START_YARG_MOTION_CUE_SIMULATION)!
    const result = await handler({}, { groupId: TEST_GROUP, cueId: 'm1' })

    expect(result).toEqual({ success: true })
    expect(execute).toHaveBeenCalledTimes(2)
    // The cue runs against each chain's own (sequencer, lightManager) pair so secondary
    // rigs see motion against their own light layout, not the primary's.
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      chains[0].sequencer,
      chains[0].dmxLightManager,
    )
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      chains[1].sequencer,
      chains[1].dmxLightManager,
    )
    // pan/tilt clear is cancelled across all chains so a previous stop doesn't fire mid-motion.
    expect(chains[0].sequencer.cancelPanTiltClear).toHaveBeenCalledTimes(1)
    expect(chains[1].sequencer.cancelPanTiltClear).toHaveBeenCalledTimes(1)
  })

  it('START_AUDIO_MOTION_CUE_SIMULATION executes the audio cue once per chain', async () => {
    const execute = jest.fn<(...args: unknown[]) => void>(() => undefined)
    audioRegistry.registerGroup({
      id: TEST_GROUP,
      name: 'sim',
      description: '',
      cues: new Map(),
      motionCues: new Map([['m1', { id: 'm1', execute } as never]]),
    })
    const handler = ipc.getHandler(LIGHT.START_AUDIO_MOTION_CUE_SIMULATION)!
    const result = await handler({}, { groupId: TEST_GROUP, cueId: 'm1' })

    expect(result).toEqual({ success: true })
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      chains[0].sequencer,
      chains[0].dmxLightManager,
    )
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      chains[1].sequencer,
      chains[1].dmxLightManager,
    )
  })

  it('STOP_MOTION_CUE_SIMULATION schedules pan/tilt clear on every chain', async () => {
    const handler = ipc.getHandler(LIGHT.STOP_MOTION_CUE_SIMULATION)!
    await handler({})
    expect(chains[0].sequencer.schedulePanTiltClear).toHaveBeenCalledTimes(1)
    expect(chains[1].sequencer.schedulePanTiltClear).toHaveBeenCalledTimes(1)
  })
})
