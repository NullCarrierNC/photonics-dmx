/**
 * Ensures disableYarg / disableRb3 await UDP listener shutdown so the port is
 * released before `isYargEnabled` / `isRb3Enabled` is cleared.
 */
import { describe, expect, it, jest } from '@jest/globals'
import {
  ListenerCoordinator,
  type ListenerCoordinatorDeps,
} from '../../controllers/ListenerCoordinator'
import { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'
import { ILightingController } from '../../../photonics-dmx/controllers/sequencer/interfaces'

function makeDeps(): ListenerCoordinatorDeps {
  const effects = {
    removeAllEffects: jest.fn(),
    blackout: jest.fn<() => Promise<void>>().mockImplementation(() => Promise.resolve()),
  } as unknown as ILightingController
  const dmx = {} as DmxLightManager
  return {
    getDmxLightManager: () => dmx,
    getEffectsController: () => effects,
    getMotionEnabled: () => true,
    getActiveYargMotionCueRef: () => null,
    getMotionCueMinimumHoldMs: () => 5000,
    getMotionCueProbabilityPercent: () => 100,
    sendSenderError: jest.fn(),
    sendToAllWindows: jest.fn(),
    setCueHandlerRef: jest.fn(),
  }
}

describe('ListenerCoordinator listener shutdown ordering', () => {
  it('disableYarg keeps isYargEnabled true until the YARG listener shutdown Promise resolves', async () => {
    const lc = new ListenerCoordinator(makeDeps())
    let releaseShutdown: (() => void) | undefined
    const shutdownP = new Promise<void>((resolve) => {
      releaseShutdown = resolve
    })

    const co = lc as unknown as {
      isYargEnabled: boolean
      yargListener: { shutdown: () => Promise<void> } | null
      cueHandler: { shutdown: () => void } | null
    }
    co.isYargEnabled = true
    co.yargListener = { shutdown: () => shutdownP }
    co.cueHandler = { shutdown: jest.fn() }

    const disableP = lc.disableYarg()
    await Promise.resolve()
    expect(co.isYargEnabled).toBe(true)
    releaseShutdown!()
    await disableP
    expect(co.isYargEnabled).toBe(false)
    expect(co.yargListener).toBeNull()
    expect(co.cueHandler).toBeNull()
  })

  it('disableRb3 keeps isRb3Enabled true until the RB3 listener shutdown Promise resolves', async () => {
    const lc = new ListenerCoordinator(makeDeps())
    let releaseShutdown: (() => void) | undefined
    const shutdownP = new Promise<void>((resolve) => {
      releaseShutdown = resolve
    })

    const co = lc as unknown as {
      isRb3Enabled: boolean
      rb3eListener: { shutdown: () => Promise<void> } | null
      processorManager: { destroy: () => void } | null
      rb3MenuHandler: { shutdown: () => void } | null
    }
    co.isRb3Enabled = true
    co.rb3eListener = { shutdown: () => shutdownP }
    co.processorManager = { destroy: jest.fn() }
    co.rb3MenuHandler = { shutdown: jest.fn() }

    const disableP = lc.disableRb3()
    await Promise.resolve()
    expect(co.isRb3Enabled).toBe(true)
    releaseShutdown!()
    await disableP
    expect(co.isRb3Enabled).toBe(false)
    expect(co.rb3eListener).toBeNull()
    expect(co.processorManager).toBeNull()
    expect(co.rb3MenuHandler).toBeNull()
  })
})
