/**
 * Rb3StageKitRigProcessor: the accumulated-colour flush runs inside a setTimeout callback that
 * awaits sequencer.setState. If that rejects, the rejection must be caught (not left unhandled)
 * and the pending-updates entry must still be cleared so the light isn't stuck pending forever.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { Rb3StageKitRigProcessor } from '../../processors/Rb3StageKitRigProcessor'
import { DEFAULT_STAGEKIT_CONFIG } from '../../listeners/RB3/StageKitTypes'
import { createMockDmxLight, createMockLightingConfig } from '../helpers/testFixtures'

function makeFourLightManager(): DmxLightManager {
  return new DmxLightManager(
    createMockLightingConfig({
      numLights: 4,
      frontLights: [
        createMockDmxLight({ id: 'f0', position: 0, fixtureId: 'f0' }),
        createMockDmxLight({ id: 'f1', position: 1, fixtureId: 'f1' }),
        createMockDmxLight({ id: 'f2', position: 2, fixtureId: 'f2' }),
        createMockDmxLight({ id: 'f3', position: 3, fixtureId: 'f3' }),
      ],
      backLights: [],
      strobeLights: [],
    }),
  )
}

function makeSequencerStub(setState: jest.Mock): ILightingController {
  return {
    setState,
    addEffect: jest.fn(),
    setEffect: jest.fn(),
    removeAllEffects: jest.fn(),
    blackout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    cancelBlackout: jest.fn(),
  } as unknown as ILightingController
}

describe('Rb3StageKitRigProcessor accumulated-colour flush', () => {
  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason)
  }

  beforeEach(() => {
    jest.useFakeTimers()
    unhandled.length = 0
    process.on('unhandledRejection', onUnhandled)
  })

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled)
    jest.useRealTimers()
  })

  it('swallows a rejecting setState and clears the pending update', async () => {
    const setState = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('sequencer down'))
    const proc = new Rb3StageKitRigProcessor(
      'rig-1',
      makeFourLightManager(),
      makeSequencerStub(setState),
      DEFAULT_STAGEKIT_CONFIG,
    )

    await proc.applyLightData([0, 1], 'red')
    // The flush is scheduled on a short accumulation timer; drain it and its microtasks.
    await jest.advanceTimersByTimeAsync(50)

    expect(setState).toHaveBeenCalled()
    // The rejection was caught, not left dangling on the event loop.
    expect(unhandled).toHaveLength(0)
    // The finally block cleared the pending entry so the light isn't wedged.
    const pending = (proc as unknown as { pendingUpdates: Map<number, unknown> }).pendingUpdates
    expect(pending.size).toBe(0)
  })
})
