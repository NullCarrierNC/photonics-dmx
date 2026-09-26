/**
 * The reap that follows a song event. It frees the names of effects the event carried past their
 * last transition, so it runs only when the event took an effect out of its wait: a counted wait
 * that merely ticks down leaves every effect where it was.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import { SongEventHandler } from '../../controllers/sequencer/SongEventHandler'
import type {
  ILayerManager,
  ITransitionEngine,
  LightEffectState,
} from '../../controllers/sequencer/interfaces'
import type { Effect, EffectTransition, RGBIO, WaitCondition } from '../../types'
import { createMockTrackedLight } from '../helpers/testFixtures'
import { createSequencerHarness } from '../helpers/sequencerHarness'
import { getEffectSingleColor } from '../../effects/effectSingleColor'

type WaitKind = 'waitFor' | 'waitUntil'

const transition = (kind: WaitKind, count?: number): EffectTransition => ({
  lights: [createMockTrackedLight()],
  layer: 1,
  waitForCondition: kind === 'waitFor' ? 'measure' : 'none',
  waitForTime: 0,
  ...(kind === 'waitFor' && count !== undefined ? { waitForConditionCount: count } : {}),
  waitUntilCondition: kind === 'waitUntil' ? 'measure' : 'none',
  waitUntilTime: 0,
  ...(kind === 'waitUntil' && count !== undefined ? { waitUntilConditionCount: count } : {}),
  transform: {
    color: { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace' },
    duration: 100,
    easing: 'linear',
  },
})

const parkedEffect = (kind: WaitKind, count?: number): LightEffectState =>
  ({
    name: 'parked',
    effect: { id: 'parked', description: 'parked', transitions: [] },
    transitions: [transition(kind, count)],
    layer: 1,
    lightId: 'front-1',
    currentTransitionIndex: 0,
    state: kind === 'waitFor' ? 'waitingFor' : 'waitingUntil',
    transitionStartTime: 0,
    waitEndTime: 0,
    isPersistent: false,
  }) as unknown as LightEffectState

describe('SongEventHandler reap after a song event', () => {
  let layerManager: ILayerManager
  let transitionEngine: ITransitionEngine
  let handler: SongEventHandler

  const withActiveEffect = (effect: LightEffectState): void => {
    const lights = new Map<string, LightEffectState>([[effect.lightId, effect]])
    ;(layerManager.getActiveEffects as jest.Mock).mockReturnValue(
      new Map<number, Map<string, LightEffectState>>([[effect.layer, lights]]),
    )
  }

  beforeEach(() => {
    layerManager = {
      getActiveEffects: jest.fn().mockReturnValue(new Map()),
    } as unknown as ILayerManager
    transitionEngine = {
      startTransition: jest.fn(),
      prepareTransition: jest.fn(),
      reapCompletedEffects: jest.fn(),
      getLightTransitionController: jest.fn().mockReturnValue({ getPublishedFrameCount: () => 0 }),
    } as unknown as ITransitionEngine
    handler = new SongEventHandler(layerManager, transitionEngine)
  })

  it.each<WaitKind>(['waitFor', 'waitUntil'])(
    'does not reap when a counted %s only ticks down',
    (kind) => {
      const effect = parkedEffect(kind, 3)
      withActiveEffect(effect)

      handler.onMeasure()

      expect(transitionEngine.reapCompletedEffects).not.toHaveBeenCalled()
      const remaining =
        kind === 'waitFor'
          ? effect.transitions[0].waitForConditionCount
          : effect.transitions[0].waitUntilConditionCount
      expect(remaining).toBe(2)
    },
  )

  it.each<WaitKind>(['waitFor', 'waitUntil'])('reaps when a counted %s reaches zero', (kind) => {
    withActiveEffect(parkedEffect(kind, 1))

    handler.onMeasure()

    expect(transitionEngine.reapCompletedEffects).toHaveBeenCalledTimes(1)
  })

  it.each<WaitKind>(['waitFor', 'waitUntil'])('reaps an uncounted %s on its event', (kind) => {
    withActiveEffect(parkedEffect(kind))

    handler.onMeasure()

    expect(transitionEngine.reapCompletedEffects).toHaveBeenCalledTimes(1)
  })

  it.each<WaitKind>(['waitFor', 'waitUntil'])(
    'does not reap when a different event fires for %s',
    (kind) => {
      withActiveEffect(parkedEffect(kind))

      handler.onBeat()

      expect(transitionEngine.reapCompletedEffects).not.toHaveBeenCalled()
    },
  )
})

describe('a transition that waits for and until the same event', () => {
  it('takes one event to start and another to finish', () => {
    const h = createSequencerHarness({ frontCount: 1, backCount: 0 })
    const done = jest.fn()
    h.sequencer.addEffectUnblockedNameWithCallback(
      'on-beats',
      getEffectSingleColor({
        color: { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1, blendMode: 'replace' },
        duration: 0,
        waitFor: 'beat',
        waitUntil: 'beat',
        lights: h.lightManager.getLights(['front'], 'all'),
        layer: 1,
      }),
      done,
    )
    h.advanceBy(10)

    h.sequencer.onBeat()
    h.advanceBy(10)
    expect(done).not.toHaveBeenCalled()

    h.sequencer.onBeat()
    h.advanceBy(10)
    expect(done).toHaveBeenCalledTimes(1)
    h.cleanup()
  })
})

describe('a chase step held until a tempo event', () => {
  const RED: RGBIO = {
    red: 255,
    green: 0,
    blue: 0,
    intensity: 255,
    opacity: 1,
    blendMode: 'replace',
  }
  const GREEN: RGBIO = { ...RED, red: 0, green: 255 }
  const BLUE: RGBIO = { ...RED, red: 0, blue: 255 }

  type Harness = ReturnType<typeof createSequencerHarness>

  interface Step {
    color: RGBIO
    startOn?: WaitCondition
    holdUntil?: WaitCondition
  }

  /** A chase on the front light. Each step snaps to its colour and holds for one event. */
  const chase = (h: Harness, steps: Step[]): Effect => ({
    id: 'chase-step',
    description: 'a chase of held steps',
    transitions: steps.map(({ color, startOn = 'none', holdUntil = 'none' }) => ({
      lights: h.lightManager.getLights(['front'], 'all'),
      layer: 1,
      waitForCondition: startOn,
      waitForTime: 0,
      transform: { color, easing: 'linear', duration: 0 },
      waitUntilCondition: holdUntil,
      waitUntilTime: 0,
      ...(holdUntil === 'none' ? {} : { waitUntilConditionCount: 1 }),
    })),
  })

  const colourOf = (h: Harness): [number, number, number] => {
    const state = h.getLightState(h.frontLightIds[0])
    return [state?.red ?? 0, state?.green ?? 0, state?.blue ?? 0]
  }

  /** A measure frame raises the beat and then the measure, as the cue handler does. */
  const measureFrame = (h: Harness): void => {
    h.sequencer.onBeat()
    h.sequencer.onMeasure()
  }

  it('shows a step submitted in the frame of a beat until the next beat', () => {
    const h = createSequencerHarness({ frontCount: 1, backCount: 0 })
    try {
      h.sequencer.addEffect(
        'chase',
        chase(h, [{ color: RED, holdUntil: 'beat' }, { color: GREEN }]),
      )
      h.sequencer.onBeat()
      h.advanceBy(10)
      expect(colourOf(h)).toEqual([255, 0, 0])

      h.advanceBy(490)
      expect(colourOf(h)).toEqual([255, 0, 0])

      h.sequencer.onBeat()
      h.advanceBy(10)
      expect(colourOf(h)).toEqual([0, 255, 0])
    } finally {
      h.cleanup()
    }
  })

  it('starts a step waiting for a beat on the beat of a measure and holds it to the next measure', () => {
    const h = createSequencerHarness({ frontCount: 1, backCount: 0 })
    try {
      h.sequencer.addEffect(
        'chase',
        chase(h, [{ color: RED, startOn: 'beat', holdUntil: 'measure' }, { color: GREEN }]),
      )
      measureFrame(h)
      h.advanceBy(10)
      expect(colourOf(h)).toEqual([255, 0, 0])

      h.advanceBy(490)
      h.sequencer.onBeat()
      h.advanceBy(10)
      expect(colourOf(h)).toEqual([255, 0, 0])

      h.advanceBy(490)
      measureFrame(h)
      h.advanceBy(10)
      expect(colourOf(h)).toEqual([0, 255, 0])
    } finally {
      h.cleanup()
    }
  })

  it('ends a hold on a beat that arrives after its step has been shown', () => {
    const h = createSequencerHarness({ frontCount: 1, backCount: 0 })
    try {
      h.sequencer.addEffect(
        'chase',
        chase(h, [
          { color: RED, holdUntil: 'beat' },
          { color: GREEN, holdUntil: 'beat' },
          { color: BLUE },
        ]),
      )
      h.sequencer.onBeat()
      h.advanceBy(10)
      expect(colourOf(h)).toEqual([255, 0, 0])

      h.advanceBy(490)
      h.sequencer.onBeat()
      h.advanceBy(10)
      expect(colourOf(h)).toEqual([0, 255, 0])

      h.advanceBy(490)
      h.sequencer.onBeat()
      h.advanceBy(10)
      expect(colourOf(h)).toEqual([0, 0, 255])
    } finally {
      h.cleanup()
    }
  })
})
