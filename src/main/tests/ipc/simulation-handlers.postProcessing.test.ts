/**
 * The post-processing simulation handler drives the same publisher state the YARG listener feeds,
 * validates the requested effect, and stays blocked while RB3E owns the lights.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

import { setupSimulationHandlers } from '../../ipc/simulation-handlers'
import { sendToAllWindows } from '../../utils/windowUtils'
import { LIGHT, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { ChainFanout } from '../../../photonics-dmx/controllers/ChainFanout'
import { MotionCueSimulator } from '../../controllers/MotionCueSimulator'

type Handler = (...args: unknown[]) => Promise<unknown> | unknown

function setup(
  options: {
    rb3Enabled?: boolean
    yargEnabled?: boolean
    initialized?: boolean
  } = {},
): {
  invoke: (payload: unknown) => Promise<unknown>
  simulateBeat: () => Promise<unknown>
  setVenuePostProcessing: jest.MockedFunction<(state: string) => void>
} {
  const handlers = new Map<string, Handler>()
  const ipc = {
    handle: jest.fn((channel: string, h: Handler) => {
      handlers.set(channel, h)
    }),
    on: jest.fn(),
  }
  // Holds state like the real stage, so the round trip through the getter is exercised.
  let held = 'Default'
  const setVenuePostProcessing = jest.fn((state: string) => {
    held = state
  })
  const venueFrameProcessor = {
    setVenuePostProcessing,
    getVenuePostProcessing: () => held,
  }
  const fanout = new ChainFanout()
  fanout.setChains([])
  const controllerManager = {
    setOnConsoleEnter: jest.fn(),
    setOnSimulationPreempt: jest.fn(),
    ensureChainsHaveHandlersForSimulation: jest.fn(),
    getChainFanout: () => fanout,
    getMotionCueSimulator: () => new MotionCueSimulator({ getChainFanout: () => fanout }),
    getIsInitialized: () => options.initialized ?? true,
    getIsRb3Enabled: () => options.rb3Enabled ?? false,
    getIsYargEnabled: () => options.yargEnabled ?? false,
    getVenueFrameProcessor: () => venueFrameProcessor,
    init: jest.fn(),
  }
  setupSimulationHandlers(
    ipc as never,
    controllerManager as unknown as Parameters<typeof setupSimulationHandlers>[1],
  )
  return {
    invoke: (payload) =>
      Promise.resolve(handlers.get(LIGHT.SIMULATE_POST_PROCESSING)!({}, payload)),
    simulateBeat: () => Promise.resolve(handlers.get(LIGHT.SIMULATE_BEAT)!({}, undefined)),
    setVenuePostProcessing,
  }
}

describe('SIMULATE_POST_PROCESSING', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('applies a known effect to the publisher', async () => {
    const ctx = setup()
    await expect(ctx.invoke({ state: 'BlackAndWhite' })).resolves.toBe(true)
    expect(ctx.setVenuePostProcessing).toHaveBeenCalledWith('BlackAndWhite')
  })

  it('clears back to Default', async () => {
    const ctx = setup()
    await expect(ctx.invoke({ state: 'Default' })).resolves.toBe(true)
    expect(ctx.setVenuePostProcessing).toHaveBeenCalledWith('Default')
  })

  it('refuses an unknown effect', async () => {
    const ctx = setup()
    await expect(ctx.invoke({ state: 'Kaleidoscope' })).resolves.toBe(false)
    await expect(ctx.invoke({})).resolves.toBe(false)
    await expect(ctx.invoke(undefined)).resolves.toBe(false)
    expect(ctx.setVenuePostProcessing).not.toHaveBeenCalled()
  })

  it('stays blocked while RB3E owns the lights', async () => {
    const ctx = setup({ rb3Enabled: true })
    await expect(ctx.invoke({ state: 'BlackAndWhite' })).resolves.toBe(false)
    expect(ctx.setVenuePostProcessing).not.toHaveBeenCalled()
  })

  it('stays blocked while YARG owns the lights', async () => {
    const ctx = setup({ yargEnabled: true })
    await expect(ctx.invoke({ state: 'BlackAndWhite' })).resolves.toBe(false)
    expect(ctx.setVenuePostProcessing).not.toHaveBeenCalled()
  })

  it('does nothing before the controllers are initialized', async () => {
    const ctx = setup({ initialized: false })
    await expect(ctx.invoke({ state: 'BlackAndWhite' })).resolves.toBe(false)
    expect(ctx.setVenuePostProcessing).not.toHaveBeenCalled()
  })

  it('carries the held effect on simulated frames so the cue preview reports it', async () => {
    const ctx = setup()
    const sent = sendToAllWindows as unknown as jest.Mock

    await ctx.simulateBeat()
    expect(lastCueData(sent).postProcessing).toBe('Default')

    await ctx.invoke({ state: 'SepiaTone' })
    await ctx.simulateBeat()
    expect(lastCueData(sent).postProcessing).toBe('SepiaTone')

    await ctx.invoke({ state: 'Default' })
    await ctx.simulateBeat()
    expect(lastCueData(sent).postProcessing).toBe('Default')
  })
})

function lastCueData(sent: jest.Mock): { postProcessing: string } {
  const calls = sent.mock.calls.filter((call) => call[0] === RENDERER_RECEIVE.CUE_HANDLED)
  return calls[calls.length - 1]![1] as { postProcessing: string }
}
