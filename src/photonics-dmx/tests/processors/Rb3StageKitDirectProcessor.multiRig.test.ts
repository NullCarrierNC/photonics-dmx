/**
 * Multi-rig RB3 StageKit: a single gameplay event fans out to every active rig's render
 * processor. Each rig has its own `StageKitLightMapper` sized to its own light count, so
 * asymmetric rigs (4-light tower + 8-light tower) each see their own DMX-index mapping
 * from the same LED positions.
 */
import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { Rb3StageKitDirectProcessor } from '../../processors/Rb3StageKitDirectProcessor'
import { ChainFanout } from '../../controllers/ChainFanout'
import type { RigChain } from '../../controllers/RigChain'
import { createMockDmxLight, createMockLightingConfig } from '../helpers/testFixtures'

function makeFourLightConfig() {
  return createMockLightingConfig({
    numLights: 4,
    frontLights: [
      createMockDmxLight({ id: 'a-f0', position: 0, fixtureId: 'a-f0' }),
      createMockDmxLight({ id: 'a-f1', position: 1, fixtureId: 'a-f1' }),
      createMockDmxLight({ id: 'a-f2', position: 2, fixtureId: 'a-f2' }),
      createMockDmxLight({ id: 'a-f3', position: 3, fixtureId: 'a-f3' }),
    ],
    backLights: [],
    strobeLights: [],
  })
}

function makeEightLightConfig(prefix = 'b') {
  return createMockLightingConfig({
    numLights: 8,
    frontLights: Array.from({ length: 8 }, (_, i) =>
      createMockDmxLight({ id: `${prefix}-f${i}`, position: i, fixtureId: `${prefix}-f${i}` }),
    ),
    backLights: [],
    strobeLights: [],
  })
}

function makeSequencerStub(): {
  ctrl: ILightingController
  setState: jest.Mock
  blackout: jest.Mock
} {
  const setState = jest.fn()
  const blackout = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
  return {
    ctrl: {
      addEffect: jest.fn(),
      setEffect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      addEffectWithCallback: jest.fn(),
      setEffectWithCallback: jest.fn(),
      addEffectUnblockedNameWithCallback: jest.fn(),
      setEffectUnblockedNameWithCallback: jest.fn(),
      removeEffectCallback: jest.fn(),
      removeEffect: jest.fn(),
      removeAllEffects: jest.fn(),
      removeEffectByLayer: jest.fn(),
      addEffectUnblockedName: jest.fn(),
      setEffectUnblockedName: jest.fn(),
      getActiveEffectsForLight: jest.fn(),
      isLayerFreeForLight: jest.fn(),
      setState,
      onBeat: jest.fn(),
      onMeasure: jest.fn(),
      onKeyframe: jest.fn(),
      onDrumNote: jest.fn(),
      onGuitarNote: jest.fn(),
      onBassNote: jest.fn(),
      onKeysNote: jest.fn(),
      blackout,
      cancelBlackout: jest.fn(),
      enableDebug: jest.fn(),
      debugLightLayers: jest.fn(),
      schedulePanTiltClear: jest.fn(),
      cancelPanTiltClear: jest.fn(),
      addMotionPattern: jest.fn(),
      removeMotionPattern: jest.fn(),
      getMotionPattern: jest.fn(),
      updateMotionPatternConfig: jest.fn(),
      replaceEffect: jest.fn(),
      shutdown: jest.fn(),
    } as unknown as ILightingController,
    setState,
    blackout,
  }
}

function makeChain(
  rigId: string,
  isPrimary: boolean,
  config: ReturnType<typeof makeFourLightConfig>,
): { chain: RigChain; setState: jest.Mock; blackout: jest.Mock } {
  const lightManager = new DmxLightManager(config)
  const { ctrl, setState, blackout } = makeSequencerStub()
  return {
    chain: {
      rigId,
      isPrimary,
      dmxLightManager: lightManager,
      sequencer: ctrl,
      yargCueHandler: null,
      audioCueHandler: null,
      rb3MenuCueHandler: null,
    } as unknown as RigChain,
    setState,
    blackout,
  }
}

describe('Rb3StageKitDirectProcessor multi-rig fanout', () => {
  let networkListener: EventEmitter
  let fanout: ChainFanout
  let processor: Rb3StageKitDirectProcessor

  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    networkListener = new EventEmitter()
    fanout = new ChainFanout()
  })

  afterEach(() => {
    processor?.stopListening(networkListener)
    processor?.destroy()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  async function flushBlendingTimers(): Promise<void> {
    // The blending pipeline schedules `setTimeout(applyAccumulatedColors, 5ms)` per light;
    // the callback awaits applyColorToLight → sequencer.setState. Drain timers + a healthy
    // number of microtasks so every per-rig per-light chain completes.
    jest.advanceTimersByTime(10)
    for (let i = 0; i < 16; i++) await Promise.resolve()
  }

  it('symmetric two-rig: gameplay event drives setState on every chain sequencer', async () => {
    const a = makeChain('a', true, makeFourLightConfig())
    const b = makeChain(
      'b',
      false,
      createMockLightingConfig({
        numLights: 4,
        frontLights: [
          createMockDmxLight({ id: 'b-f0', position: 0, fixtureId: 'b-f0' }),
          createMockDmxLight({ id: 'b-f1', position: 1, fixtureId: 'b-f1' }),
          createMockDmxLight({ id: 'b-f2', position: 2, fixtureId: 'b-f2' }),
          createMockDmxLight({ id: 'b-f3', position: 3, fixtureId: 'b-f3' }),
        ],
        backLights: [],
        strobeLights: [],
      }),
    )
    fanout.setChains([a.chain, b.chain])
    processor = new Rb3StageKitDirectProcessor(fanout)
    processor.startListening(networkListener)

    networkListener.emit('stagekit:data', {
      positions: [0, 1],
      color: 'red',
      brightness: 'medium',
      timestamp: Date.now(),
    })
    // Drain microtasks (Promise.allSettled) before the blending timer fires.
    await Promise.resolve()
    await Promise.resolve()
    await flushBlendingTimers()
    await Promise.resolve()

    // Each rig's sequencer.setState gets called against its own light references.
    expect(a.setState).toHaveBeenCalled()
    expect(b.setState).toHaveBeenCalled()
    const aLightIds = a.setState.mock.calls.flatMap((call) =>
      (call[0] as { id: string }[]).map((l) => l.id),
    )
    const bLightIds = b.setState.mock.calls.flatMap((call) =>
      (call[0] as { id: string }[]).map((l) => l.id),
    )
    // Rig A only ever sees rig A's lights; same for rig B.
    expect(aLightIds.every((id) => id.startsWith('a-'))).toBe(true)
    expect(bLightIds.every((id) => id.startsWith('b-'))).toBe(true)
  })

  it('asymmetric two-rig (4 + 8 lights): each chain runs its own StageKit mode', async () => {
    const small = makeChain('small', true, makeFourLightConfig())
    const large = makeChain('large', false, makeEightLightConfig('b'))
    fanout.setChains([small.chain, large.chain])
    processor = new Rb3StageKitDirectProcessor(fanout)
    processor.startListening(networkListener)

    networkListener.emit('stagekit:data', {
      positions: [0, 1, 2, 3, 4, 5, 6, 7],
      color: 'blue',
      brightness: 'medium',
      timestamp: Date.now(),
    })
    await Promise.resolve()
    await Promise.resolve()
    await flushBlendingTimers()
    await Promise.resolve()

    expect(small.setState).toHaveBeenCalled()
    expect(large.setState).toHaveBeenCalled()
    const smallLightIds = new Set(
      small.setState.mock.calls.flatMap((call) => (call[0] as { id: string }[]).map((l) => l.id)),
    )
    const largeLightIds = new Set(
      large.setState.mock.calls.flatMap((call) => (call[0] as { id: string }[]).map((l) => l.id)),
    )
    // Small rig only touches its 4 lights; large rig touches its 8.
    expect([...smallLightIds].every((id) => id.startsWith('a-'))).toBe(true)
    expect([...largeLightIds].every((id) => id.startsWith('b-'))).toBe(true)
    expect(smallLightIds.size).toBeLessThanOrEqual(4)
    expect(largeLightIds.size).toBeLessThanOrEqual(8)
  })

  it('rig with fewer than 4 lights is skipped without breaking siblings', async () => {
    const tiny = makeChain(
      'tiny',
      true,
      createMockLightingConfig({
        numLights: 2,
        frontLights: [
          createMockDmxLight({ id: 'tiny-f0', position: 0, fixtureId: 'tiny-f0' }),
          createMockDmxLight({ id: 'tiny-f1', position: 1, fixtureId: 'tiny-f1' }),
        ],
        backLights: [],
        strobeLights: [],
      }),
    )
    const ok = makeChain('ok', false, makeFourLightConfig())
    fanout.setChains([tiny.chain, ok.chain])
    processor = new Rb3StageKitDirectProcessor(fanout)
    processor.startListening(networkListener)

    networkListener.emit('stagekit:data', {
      positions: [0, 1],
      color: 'red',
      brightness: 'medium',
      timestamp: Date.now(),
    })
    await Promise.resolve()
    await Promise.resolve()
    await flushBlendingTimers()
    await Promise.resolve()

    // tiny rig was skipped — never gets a setState call.
    expect(tiny.setState).not.toHaveBeenCalled()
    // ok rig is unaffected.
    expect(ok.setState).toHaveBeenCalled()
  })

  it('strobe effects run per-rig and effect names carry the rig id (no collision)', async () => {
    // Two rigs with strobe-flagged lights. After a medium strobe event, each rig's setState
    // alternates with its own interval; effect names start with `stagekit-strobe-{rigId}-`.
    const aConfig = createMockLightingConfig({
      numLights: 4,
      frontLights: [
        createMockDmxLight({ id: 'a-f0', position: 0, fixtureId: 'a-f0', isStrobeEnabled: true }),
        createMockDmxLight({ id: 'a-f1', position: 1, fixtureId: 'a-f1' }),
        createMockDmxLight({ id: 'a-f2', position: 2, fixtureId: 'a-f2' }),
        createMockDmxLight({ id: 'a-f3', position: 3, fixtureId: 'a-f3' }),
      ],
      backLights: [],
      strobeLights: [
        createMockDmxLight({ id: 'a-f0', position: 0, fixtureId: 'a-f0', isStrobeEnabled: true }),
      ],
    })
    const bConfig = createMockLightingConfig({
      numLights: 4,
      frontLights: [
        createMockDmxLight({ id: 'b-f0', position: 0, fixtureId: 'b-f0', isStrobeEnabled: true }),
        createMockDmxLight({ id: 'b-f1', position: 1, fixtureId: 'b-f1' }),
        createMockDmxLight({ id: 'b-f2', position: 2, fixtureId: 'b-f2' }),
        createMockDmxLight({ id: 'b-f3', position: 3, fixtureId: 'b-f3' }),
      ],
      backLights: [],
      strobeLights: [
        createMockDmxLight({ id: 'b-f0', position: 0, fixtureId: 'b-f0', isStrobeEnabled: true }),
      ],
    })
    const a = makeChain('a', true, aConfig)
    const b = makeChain('b', false, bConfig)
    fanout.setChains([a.chain, b.chain])
    processor = new Rb3StageKitDirectProcessor(fanout)
    processor.startListening(networkListener)

    networkListener.emit('stagekit:data', {
      positions: [0],
      color: 'off',
      brightness: 'medium',
      strobeEffect: 'medium',
      timestamp: Date.now(),
    })
    // First strobe tick is at +100ms (medium interval).
    jest.advanceTimersByTime(100)
    await Promise.resolve()

    // Both rigs fired setState in this tick (white on their respective strobe light).
    const aIds = a.setState.mock.calls.flatMap((c) => (c[0] as { id: string }[]).map((l) => l.id))
    const bIds = b.setState.mock.calls.flatMap((c) => (c[0] as { id: string }[]).map((l) => l.id))
    expect(aIds).toContain('a-f0')
    expect(bIds).toContain('b-f0')

    // Effect names include the rig id — two rigs running medium strobes don't collide.
    const status = processor.getStatus()
    const aHits = status.activeStrobeEffects.filter((s) =>
      s.startsWith('stagekit-strobe-a-medium-'),
    )
    const bHits = status.activeStrobeEffects.filter((s) =>
      s.startsWith('stagekit-strobe-b-medium-'),
    )
    expect(aHits).toHaveLength(1)
    expect(bHits).toHaveLength(1)
  })

  it('one rig in strobe does not cause the other rig to receive setState calls', async () => {
    // Only chain A has a strobe-flagged light; chain B has no strobe lights configured.
    // The strobe should run on A only — B's sequencer never receives strobe-derived
    // setState calls (its `applyStrobeEffect` is a no-op).
    const aConfig = createMockLightingConfig({
      numLights: 4,
      frontLights: [
        createMockDmxLight({ id: 'a-f0', position: 0, fixtureId: 'a-f0', isStrobeEnabled: true }),
        createMockDmxLight({ id: 'a-f1', position: 1, fixtureId: 'a-f1' }),
        createMockDmxLight({ id: 'a-f2', position: 2, fixtureId: 'a-f2' }),
        createMockDmxLight({ id: 'a-f3', position: 3, fixtureId: 'a-f3' }),
      ],
      backLights: [],
      strobeLights: [
        createMockDmxLight({ id: 'a-f0', position: 0, fixtureId: 'a-f0', isStrobeEnabled: true }),
      ],
    })
    const bConfig = createMockLightingConfig({
      numLights: 4,
      frontLights: [
        createMockDmxLight({ id: 'b-f0', position: 0, fixtureId: 'b-f0' }),
        createMockDmxLight({ id: 'b-f1', position: 1, fixtureId: 'b-f1' }),
        createMockDmxLight({ id: 'b-f2', position: 2, fixtureId: 'b-f2' }),
        createMockDmxLight({ id: 'b-f3', position: 3, fixtureId: 'b-f3' }),
      ],
      backLights: [],
      strobeLights: [],
    })
    const a = makeChain('a', true, aConfig)
    const b = makeChain('b', false, bConfig)
    fanout.setChains([a.chain, b.chain])
    processor = new Rb3StageKitDirectProcessor(fanout)
    processor.startListening(networkListener)

    networkListener.emit('stagekit:data', {
      positions: [0],
      color: 'off',
      brightness: 'medium',
      strobeEffect: 'medium',
      timestamp: Date.now(),
    })
    jest.advanceTimersByTime(100)
    await Promise.resolve()

    expect(a.setState).toHaveBeenCalled()
    expect(b.setState).not.toHaveBeenCalled()
  })

  it('getStatus aggregates active lights, strobe effects, and strobed lights across rigs', async () => {
    const aConfig = createMockLightingConfig({
      numLights: 4,
      frontLights: [
        createMockDmxLight({ id: 'a-f0', position: 0, fixtureId: 'a-f0', isStrobeEnabled: true }),
        createMockDmxLight({ id: 'a-f1', position: 1, fixtureId: 'a-f1' }),
        createMockDmxLight({ id: 'a-f2', position: 2, fixtureId: 'a-f2' }),
        createMockDmxLight({ id: 'a-f3', position: 3, fixtureId: 'a-f3' }),
      ],
      backLights: [],
      strobeLights: [
        createMockDmxLight({ id: 'a-f0', position: 0, fixtureId: 'a-f0', isStrobeEnabled: true }),
      ],
    })
    const bConfig = createMockLightingConfig({
      numLights: 4,
      frontLights: [
        createMockDmxLight({ id: 'b-f0', position: 0, fixtureId: 'b-f0', isStrobeEnabled: true }),
        createMockDmxLight({ id: 'b-f1', position: 1, fixtureId: 'b-f1' }),
        createMockDmxLight({ id: 'b-f2', position: 2, fixtureId: 'b-f2' }),
        createMockDmxLight({ id: 'b-f3', position: 3, fixtureId: 'b-f3' }),
      ],
      backLights: [],
      strobeLights: [
        createMockDmxLight({ id: 'b-f0', position: 0, fixtureId: 'b-f0', isStrobeEnabled: true }),
      ],
    })
    const a = makeChain('a', true, aConfig)
    const b = makeChain('b', false, bConfig)
    fanout.setChains([a.chain, b.chain])
    processor = new Rb3StageKitDirectProcessor(fanout)
    processor.startListening(networkListener)

    networkListener.emit('stagekit:data', {
      positions: [0, 1],
      color: 'red',
      brightness: 'medium',
      timestamp: Date.now(),
    })
    await Promise.resolve()
    await Promise.resolve()
    await flushBlendingTimers()
    await Promise.resolve()

    networkListener.emit('stagekit:data', {
      positions: [0],
      color: 'off',
      brightness: 'medium',
      strobeEffect: 'slow',
      timestamp: Date.now(),
    })
    jest.advanceTimersByTime(200)
    await Promise.resolve()

    const status = processor.getStatus()
    // Active-light summaries come from both rigs — each entry is prefixed with a rig id.
    const aLights = status.currentActiveLights.filter((l) => l.startsWith('Rig a '))
    const bLights = status.currentActiveLights.filter((l) => l.startsWith('Rig b '))
    expect(aLights.length).toBeGreaterThan(0)
    expect(bLights.length).toBeGreaterThan(0)
    // Two strobes (one per rig) are active.
    expect(status.activeStrobeEffects.length).toBe(2)
    expect(status.hasActiveStrobeEffects).toBe(true)
  })

  it('getColorBlendingInfo returns a deterministic blend even with multiple rigs', () => {
    const a = makeChain('a', true, makeFourLightConfig())
    const b = makeChain(
      'b',
      false,
      createMockLightingConfig({
        numLights: 4,
        frontLights: [
          createMockDmxLight({ id: 'b-f0', position: 0, fixtureId: 'b-f0' }),
          createMockDmxLight({ id: 'b-f1', position: 1, fixtureId: 'b-f1' }),
          createMockDmxLight({ id: 'b-f2', position: 2, fixtureId: 'b-f2' }),
          createMockDmxLight({ id: 'b-f3', position: 3, fixtureId: 'b-f3' }),
        ],
        backLights: [],
        strobeLights: [],
      }),
    )
    fanout.setChains([a.chain, b.chain])
    processor = new Rb3StageKitDirectProcessor(fanout)

    const blend = processor.getColorBlendingInfo('red')
    expect(blend.color).toBe('red')
    expect(blend.description).toBe('Single color: red')
    expect(blend.blendedColor).toBeTruthy()
  })

  it('refreshRigs adds processors for new chains and disposes processors for removed ones', async () => {
    const a = makeChain('a', true, makeFourLightConfig())
    const b = makeChain(
      'b',
      false,
      createMockLightingConfig({
        numLights: 4,
        frontLights: [
          createMockDmxLight({ id: 'b-f0', position: 0, fixtureId: 'b-f0' }),
          createMockDmxLight({ id: 'b-f1', position: 1, fixtureId: 'b-f1' }),
          createMockDmxLight({ id: 'b-f2', position: 2, fixtureId: 'b-f2' }),
          createMockDmxLight({ id: 'b-f3', position: 3, fixtureId: 'b-f3' }),
        ],
        backLights: [],
        strobeLights: [],
      }),
    )

    // Start with rig A only.
    fanout.setChains([a.chain])
    processor = new Rb3StageKitDirectProcessor(fanout)
    processor.startListening(networkListener)

    // First gameplay event reaches A only.
    networkListener.emit('stagekit:data', {
      positions: [0, 1],
      color: 'red',
      brightness: 'medium',
      timestamp: Date.now(),
    })
    await Promise.resolve()
    await Promise.resolve()
    await flushBlendingTimers()
    await Promise.resolve()
    expect(a.setState).toHaveBeenCalled()
    expect(b.setState).not.toHaveBeenCalled()
    a.setState.mockClear()

    // Add rig B mid-flight: update the fanout chain list, then call refreshRigs.
    fanout.setChains([a.chain, b.chain])
    processor.refreshRigs()

    networkListener.emit('stagekit:data', {
      positions: [0, 1],
      color: 'green',
      brightness: 'medium',
      timestamp: Date.now(),
    })
    // Drain the synchronous fanout Promise.allSettled before the blending timer fires.
    for (let i = 0; i < 4; i++) await Promise.resolve()
    await flushBlendingTimers()

    // Both rigs now drive setState.
    expect(a.setState).toHaveBeenCalled()
    expect(b.setState).toHaveBeenCalled()
    a.setState.mockClear()
    b.setState.mockClear()

    // Remove rig A mid-flight: fanout sees only B; refreshRigs disposes A's processor.
    fanout.setChains([b.chain])
    processor.refreshRigs()

    networkListener.emit('stagekit:data', {
      positions: [0, 1],
      color: 'blue',
      brightness: 'medium',
      timestamp: Date.now(),
    })
    await Promise.resolve()
    await Promise.resolve()
    await flushBlendingTimers()
    await Promise.resolve()

    // Only rig B receives the new event.
    expect(a.setState).not.toHaveBeenCalled()
    expect(b.setState).toHaveBeenCalled()
  })

  it('game state InGame transition blacks out every chain sequencer', async () => {
    const a = makeChain('a', true, makeFourLightConfig())
    const b = makeChain(
      'b',
      false,
      createMockLightingConfig({
        numLights: 4,
        frontLights: [
          createMockDmxLight({ id: 'b-f0', position: 0, fixtureId: 'b-f0' }),
          createMockDmxLight({ id: 'b-f1', position: 1, fixtureId: 'b-f1' }),
          createMockDmxLight({ id: 'b-f2', position: 2, fixtureId: 'b-f2' }),
          createMockDmxLight({ id: 'b-f3', position: 3, fixtureId: 'b-f3' }),
        ],
        backLights: [],
        strobeLights: [],
      }),
    )
    fanout.setChains([a.chain, b.chain])
    processor = new Rb3StageKitDirectProcessor(fanout)
    processor.startListening(networkListener)

    networkListener.emit('rb3e:gameState', {
      gameState: 'InGame',
      platform: 'RB3E',
      timestamp: Date.now(),
      cueData: null,
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(a.blackout).toHaveBeenCalled()
    expect(b.blackout).toHaveBeenCalled()
  })
})
