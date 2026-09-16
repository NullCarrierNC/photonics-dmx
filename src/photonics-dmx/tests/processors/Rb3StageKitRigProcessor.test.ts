/**
 * Rb3StageKitRigProcessor, covering the two pieces of per-rig state that outlive a single packet.
 *
 * The accumulated-colour flush runs inside a setTimeout callback that awaits sequencer.setState. If
 * that rejects, the rejection must be caught (not left unhandled) and the pending-updates entry
 * must still be cleared so the light isn't stuck pending forever.
 *
 * A strobe run owns a setInterval. RB3E repeats a strobe packet for as long as the strobe holds, so
 * a rig holds one run per type and a new type replaces the old one, and every stop path leaves the
 * interval cancelled.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { Rb3StageKitRigProcessor } from '../../processors/Rb3StageKitRigProcessor'
import { DEFAULT_STAGEKIT_CONFIG } from '../../listeners/RB3/StageKitTypes'
import { createMockDmxLight, createMockLightingConfig } from '../helpers/testFixtures'
import { fakeLightingController } from '../helpers/fakeLightingController'

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

/** A rig whose first two front lights are also flagged as strobes, so strobes have targets. */
function makeStrobeLightManager(): DmxLightManager {
  const front = [
    createMockDmxLight({ id: 'f0', position: 0, fixtureId: 'f0', isStrobeEnabled: true }),
    createMockDmxLight({ id: 'f1', position: 1, fixtureId: 'f1', isStrobeEnabled: true }),
    createMockDmxLight({ id: 'f2', position: 2, fixtureId: 'f2' }),
    createMockDmxLight({ id: 'f3', position: 3, fixtureId: 'f3' }),
  ]
  return new DmxLightManager(
    createMockLightingConfig({
      numLights: 4,
      frontLights: front,
      backLights: [],
      strobeLights: [front[0], front[1]],
    }),
  )
}

/** The strobe runs this rig currently holds. */
function runningStrobes(proc: Rb3StageKitRigProcessor): string[] {
  return [
    ...(
      proc as unknown as { activeStrobeEffects: Map<string, unknown> }
    ).activeStrobeEffects.keys(),
  ]
}

function makeSequencerStub(setState: jest.Mock): ILightingController {
  return fakeLightingController({
    setState,
  })
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

describe('Rb3StageKitRigProcessor strobe runs', () => {
  let setState: jest.Mock
  let proc: Rb3StageKitRigProcessor

  beforeEach(() => {
    jest.useFakeTimers()
    setState = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
    proc = new Rb3StageKitRigProcessor(
      'rig-1',
      makeStrobeLightManager(),
      makeSequencerStub(setState),
      DEFAULT_STAGEKIT_CONFIG,
    )
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('holds one run when the same strobe type arrives again', () => {
    proc.applyStrobeEffect('fast')
    proc.applyStrobeEffect('fast')
    proc.applyStrobeEffect('fast')

    expect(runningStrobes(proc)).toEqual(['stagekit-strobe-rig-1-fast'])
  })

  it('keeps the requested rate when a packet repeats', () => {
    proc.applyStrobeEffect('fast')
    jest.advanceTimersByTime(200)
    const alone = setState.mock.calls.length

    setState.mockClear()
    proc.applyStrobeEffect('fast')
    proc.applyStrobeEffect('fast')
    jest.advanceTimersByTime(200)

    expect(setState.mock.calls.length).toBe(alone)
  })

  it('replaces the run when the strobe type changes', () => {
    proc.applyStrobeEffect('slow')
    proc.applyStrobeEffect('fastest')

    expect(runningStrobes(proc)).toEqual(['stagekit-strobe-rig-1-fastest'])
  })

  it('leaves nothing running after the positions are cleared', () => {
    proc.applyStrobeEffect('medium')
    proc.clearStrobeEffectsAtPositions([])

    expect(runningStrobes(proc)).toEqual([])
    setState.mockClear()
    jest.advanceTimersByTime(500)
    expect(setState).not.toHaveBeenCalled()
  })

  it('stops a strobe cleared by an LED position the 4-light rig folds onto its lights', () => {
    proc.applyStrobeEffect('medium')
    // A 4-light rig shows LEDs 4 and 5 on lights 0 and 1, the two strobe targets here.
    proc.clearStrobeEffectsAtPositions([4, 5])

    expect(runningStrobes(proc)).toEqual([])
  })

  it('keeps a strobe running when the cleared positions miss its lights', () => {
    proc.applyStrobeEffect('medium')
    proc.clearStrobeEffectsAtPositions([2, 7])

    expect(runningStrobes(proc)).toEqual(['stagekit-strobe-rig-1-medium'])
  })

  it('leaves nothing running after dispose', async () => {
    proc.applyStrobeEffect('fastest')
    await proc.dispose()

    expect(runningStrobes(proc)).toEqual([])
    setState.mockClear()
    jest.advanceTimersByTime(500)
    expect(setState).not.toHaveBeenCalled()
  })
})
