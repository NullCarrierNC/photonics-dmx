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
import type { EffectTransition } from '../../types'
import { createMockTrackedLight } from '../helpers/testFixtures'

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
      getLightTransitionController: jest.fn().mockReturnValue({}),
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
