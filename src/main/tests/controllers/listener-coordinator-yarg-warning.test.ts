import { describe, expect, it, jest } from '@jest/globals'
import {
  ListenerCoordinator,
  type ListenerCoordinatorDeps,
} from '../../controllers/ListenerCoordinator'
import { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'
import { ILightingController } from '../../../photonics-dmx/controllers/sequencer/interfaces'
import { ChainFanout } from '../../../photonics-dmx/controllers/ChainFanout'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { withCapturedLogEntries } from '../captureLogSink'

const mockBind = jest.fn((_port: number, callback: () => void) => {
  callback()
})
const mockClose = jest.fn((callback?: () => void) => {
  if (callback) callback()
})
const mockOn = jest.fn()

jest.mock('dgram', () => ({
  createSocket: jest.fn(() => ({
    bind: mockBind,
    close: mockClose,
    on: mockOn,
  })),
}))

function makeDeps(): ListenerCoordinatorDeps & { sendToAllWindows: jest.Mock } {
  const effects = {
    removeAllEffects: jest.fn(),
    blackout: jest.fn<() => Promise<void>>().mockImplementation(() => Promise.resolve()),
  } as unknown as ILightingController
  const dmx = {} as DmxLightManager
  const fakeChain = {
    rigId: 'stub',
    isPrimary: true,
    dmxLightManager: dmx,
    sequencer: effects,
    cueHandlers: {
      yarg: null,
      rb3: null,
    },
    audioCueHandler: null,
    rb3MenuCueHandler: null,
  } as unknown as RigChain
  const chains: RigChain[] = [fakeChain]
  const chainFanout = new ChainFanout()
  chainFanout.setChains(chains)
  const sendToAllWindows = jest.fn()
  return {
    getDmxLightManager: () => dmx,
    getEffectsController: () => effects,
    getRigChains: () => chains,
    getChainFanout: () => chainFanout,
    getMotionEnabled: () => true,
    getActiveYargMotionCueRef: () => null,
    getMotionCueMinimumHoldMs: () => 5000,
    getMotionCueProbabilityPercent: () => 100,
    getActiveRb3MotionCueRef: () => null,
    getRb3MotionCueMinimumHoldMs: () => 5000,
    getRb3MotionCueProbabilityPercent: () => 100,
    getRb3MotionCueDurationRangeSec: () => ({ min: 5, max: 20 }),
    getFallbackCueTimeMs: () => 20000,
    sendSenderError: jest.fn(),
    sendToAllWindows,
    runtimeBroadcaster: noopRuntimeBroadcaster(),
    setCueHandlerRef: jest.fn(),
    setRb3CueHandlerRef: jest.fn(),
    getRb3ProcessingMode: () => 'direct',
  }
}

describe('ListenerCoordinator YARG warning forwarding', () => {
  it('logs warnings at warn severity and forwards severity plus datagramVersion without auto-disable', async () => {
    const deps = makeDeps()
    const lc = new ListenerCoordinator(deps)
    await lc.enableYargInternal()

    const listener = (
      lc as unknown as { yargListener: { emit: (event: string, payload: unknown) => void } }
    ).yargListener
    expect(listener).toBeTruthy()

    const payload = {
      type: 'datagram-version-newer',
      severity: 'warning' as const,
      message: 'YARG datagram version 6 is newer than this build supports (5).',
      datagramVersion: 6,
    }

    withCapturedLogEntries((entries) => {
      listener.emit('yarg-error', payload)
      expect(entries.some((e) => e.level === 'warn' && e.scope === 'ListenerCoordinator')).toBe(
        true,
      )
      expect(entries.some((e) => e.level === 'error' && e.scope === 'ListenerCoordinator')).toBe(
        false,
      )
    })

    expect(deps.sendToAllWindows).toHaveBeenCalledWith(RENDERER_RECEIVE.YARG_ERROR, {
      type: payload.type,
      message: payload.message,
      severity: 'warning',
      datagramVersion: 6,
    })
    expect(
      deps.sendToAllWindows.mock.calls.some(
        (call) => (call[1] as { autoDisabled?: boolean }).autoDisabled === true,
      ),
    ).toBe(false)

    await lc.disableYarg()
  })
})
