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
import { rgbLight, createMockLightingConfig } from '../helpers/testFixtures'
import { fakeLightingController } from '../helpers/fakeLightingController'

function makeFourLightManager(): DmxLightManager {
  return new DmxLightManager(
    createMockLightingConfig({
      numLights: 4,
      frontLights: [
        rgbLight({ id: 'f0', position: 0, fixtureId: 'f0' }),
        rgbLight({ id: 'f1', position: 1, fixtureId: 'f1' }),
        rgbLight({ id: 'f2', position: 2, fixtureId: 'f2' }),
        rgbLight({ id: 'f3', position: 3, fixtureId: 'f3' }),
      ],
      backLights: [],
      strobeLights: [],
    }),
  )
}

/** A rig whose first two front lights are also flagged as strobes, so strobes have targets. */
function makeStrobeLightManager(): DmxLightManager {
  const front = [
    rgbLight({ id: 'f0', position: 0, fixtureId: 'f0', isStrobeEnabled: true }),
    rgbLight({ id: 'f1', position: 1, fixtureId: 'f1', isStrobeEnabled: true }),
    rgbLight({ id: 'f2', position: 2, fixtureId: 'f2' }),
    rgbLight({ id: 'f3', position: 3, fixtureId: 'f3' }),
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

/**
 * Four plain front lights, a front light and a strobe-row light that each have a strobe channel,
 * and a strobe-row light that has none. All three strobe lights are in the strobe row.
 */
function makeMixedStrobeLightManager(): DmxLightManager {
  const withChannel = { ...rgbLight().channels, strobeChannel: 9 }
  const front = [
    rgbLight({
      id: 'f0',
      position: 0,
      fixtureId: 'f0',
      isStrobeEnabled: true,
      channels: withChannel,
    }),
    rgbLight({ id: 'f1', position: 1, fixtureId: 'f1' }),
    rgbLight({ id: 'f2', position: 2, fixtureId: 'f2' }),
    rgbLight({ id: 'f3', position: 3, fixtureId: 'f3' }),
  ]
  const plainStrobe = rgbLight({ id: 's0', position: 5, fixtureId: 's0', isStrobeEnabled: true })
  const channelStrobe = rgbLight({
    id: 's1',
    position: 6,
    fixtureId: 's1',
    isStrobeEnabled: true,
    channels: withChannel,
  })
  return new DmxLightManager(
    createMockLightingConfig({
      numLights: 6,
      frontLights: front,
      backLights: [],
      strobeLights: [front[0], plainStrobe, channelStrobe],
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
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('swallows a throwing setState and clears the pending update', () => {
    const setState = jest.fn(() => {
      throw new Error('sequencer down')
    })
    const proc = new Rb3StageKitRigProcessor(
      'rig-1',
      makeFourLightManager(),
      makeSequencerStub(setState),
      DEFAULT_STAGEKIT_CONFIG,
    )

    proc.applyLightData([0, 1], 'red')
    // The flush is scheduled on a short accumulation timer.
    jest.advanceTimersByTime(50)

    expect(setState).toHaveBeenCalled()
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
    setState = jest.fn()
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

  it('flashes a strobe-row light, leaves a light whose strobe channel chops to it, and darkens the row when the strobe ends', () => {
    const mixed = new Rb3StageKitRigProcessor(
      'rig-1',
      makeMixedStrobeLightManager(),
      makeSequencerStub(setState),
      DEFAULT_STAGEKIT_CONFIG,
    )
    const litIds = (): string[][] =>
      setState.mock.calls.map(([lights]) => (lights as Array<{ id: string }>).map((l) => l.id))
    const levels = (id: string): number[] =>
      setState.mock.calls
        .filter(([lights]) => (lights as Array<{ id: string }>).some((l) => l.id === id))
        .map(([, color]) => (color as { intensity: number }).intensity)

    mixed.applyStrobeEffect('slow')
    jest.advanceTimersByTime(1000)

    expect(litIds().flat()).not.toContain('f0')
    expect(levels('s1')).toEqual([255])
    expect(new Set(levels('s0'))).toEqual(new Set([255, 0]))

    mixed.clearStrobeEffectsAtPositions([])
    expect(levels('s0').at(-1)).toBe(0)
    expect(levels('s1').at(-1)).toBe(0)
    mixed.dispose()
  })

  it('leaves nothing running after dispose', () => {
    proc.applyStrobeEffect('fastest')
    proc.dispose()

    expect(runningStrobes(proc)).toEqual([])
    setState.mockClear()
    jest.advanceTimersByTime(500)
    expect(setState).not.toHaveBeenCalled()
  })
})
