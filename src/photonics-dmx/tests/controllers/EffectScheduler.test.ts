import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { EffectScheduler } from '../../controllers/sequencer/EffectScheduler'
import { PersistentRunRegistry } from '../../controllers/sequencer/PersistentRunRegistry'
import type { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import type {
  IEffectTransformer,
  ILayerManager,
  LightEffectState,
} from '../../controllers/sequencer/interfaces'
import { Effect, EffectTransition } from '../../types'
import { createMockTrackedLight } from '../helpers/testFixtures'

const light = createMockTrackedLight({ id: 'light-1' })

const transition = (layer: number): EffectTransition => ({
  lights: [light],
  layer,
  waitForCondition: 'none',
  waitForTime: 0,
  transform: {
    color: { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1, blendMode: 'replace' },
    easing: 'linear',
    duration: 100,
  },
  waitUntilCondition: 'none',
  waitUntilTime: 0,
})

const effectWith = (transitions: EffectTransition[]): Effect => ({
  id: 'e',
  description: 'test effect',
  transitions,
})

/** Group transitions the way EffectTransformer does, so the scheduler sees a realistic shape. */
const groupByLayerAndLight = (
  transitions: EffectTransition[],
): Map<number, Map<string, EffectTransition[]>> => {
  const map = new Map<number, Map<string, EffectTransition[]>>()
  for (const t of transitions) {
    const layerMap = map.get(t.layer) ?? new Map<string, EffectTransition[]>()
    for (const l of t.lights) {
      layerMap.set(l.id, [...(layerMap.get(l.id) ?? []), t])
    }
    map.set(t.layer, layerMap)
  }
  return map
}

describe('EffectScheduler', () => {
  let layerManager: jest.Mocked<ILayerManager>
  let persistentRuns: PersistentRunRegistry
  let fireCompletionCallback: jest.Mock
  let scheduler: EffectScheduler

  beforeEach(() => {
    layerManager = {
      addActiveEffect: jest.fn(),
      removeActiveEffect: jest.fn(),
      getActiveEffect: jest.fn(),
      addQueuedEffect: jest.fn(),
      removeQueuedEffect: jest.fn(),
      getQueuedEffect: jest.fn(),
      getActiveEffects: jest.fn().mockReturnValue(new Map()),
      getLightState: jest.fn(),
      resetLayerTracking: jest.fn(),
    } as unknown as jest.Mocked<ILayerManager>

    const effectTransformer = {
      groupTransitionsByLayerAndLight: jest.fn(groupByLayerAndLight),
      expandTransitionsByLight: jest.fn((transitions: EffectTransition[]) =>
        transitions.flatMap((t) => t.lights.map((l) => ({ ...t, lights: [l] }))),
      ),
    } as unknown as IEffectTransformer

    const lightTransitionController = {
      getLightState: jest.fn(),
      setTransition: jest.fn(),
      removeLightLayer: jest.fn(),
    } as unknown as LightTransitionController

    persistentRuns = new PersistentRunRegistry()
    fireCompletionCallback = jest.fn()

    scheduler = new EffectScheduler({
      layerManager,
      effectTransformer,
      lightTransitionController,
      persistentRuns,
      fireCompletionCallback: fireCompletionCallback as unknown as (name: string) => void,
    })
  })

  describe('applyEffectTransitions', () => {
    it('starts the effect on a free slot', () => {
      const transitions = [transition(1)]
      scheduler.applyEffectTransitions(
        'pulse',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
        false,
      )

      expect(layerManager.addActiveEffect).toHaveBeenCalledTimes(1)
      expect(layerManager.addActiveEffect.mock.calls[0][0]).toBe(1)
    })

    it('queues behind an active effect of the same name', () => {
      layerManager.getActiveEffect.mockReturnValue({
        name: 'pulse',
        lightId: light.id,
      } as unknown as LightEffectState)
      const transitions = [transition(1)]

      scheduler.applyEffectTransitions(
        'pulse',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
        false,
      )

      expect(layerManager.addQueuedEffect).toHaveBeenCalledTimes(1)
      expect(layerManager.addActiveEffect).not.toHaveBeenCalled()
    })

    it('replaces an active effect of a different name', () => {
      layerManager.getActiveEffect.mockReturnValue({
        name: 'other',
        lightId: light.id,
      } as unknown as LightEffectState)
      const transitions = [transition(1)]

      scheduler.applyEffectTransitions(
        'pulse',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
        false,
      )

      expect(layerManager.addQueuedEffect).not.toHaveBeenCalled()
      expect(layerManager.addActiveEffect).toHaveBeenCalledTimes(1)
    })
  })

  describe('replaceEffectTransitions', () => {
    it('cancels the active run and slot, then starts immediately', () => {
      const runId = persistentRuns.register(
        'old',
        effectWith([]),
        groupByLayerAndLight([transition(1)]),
      )
      layerManager.getActiveEffect.mockReturnValue({
        name: 'old',
        lightId: light.id,
        effectRunId: runId,
      } as unknown as LightEffectState)
      const transitions = [transition(1)]

      scheduler.replaceEffectTransitions(
        'pulse',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
        false,
      )

      expect(persistentRuns.has(runId!)).toBe(false)
      expect(layerManager.removeActiveEffect).toHaveBeenCalledWith(1, light.id)
      expect(layerManager.removeQueuedEffect).toHaveBeenCalledWith(1, light.id)
      expect(layerManager.addActiveEffect).toHaveBeenCalledTimes(1)
    })
  })

  describe('startNextEffectInQueue', () => {
    it('reports false when nothing is queued', () => {
      layerManager.getQueuedEffect.mockReturnValue(undefined)
      expect(scheduler.startNextEffectInQueue(1, light.id)).toBe(false)
    })

    it('starts the queued effect under its own run id', () => {
      layerManager.getQueuedEffect.mockReturnValue({
        name: 'queued',
        effect: effectWith([transition(1)]),
        isPersistent: true,
        lightId: light.id,
        effectRunId: 'run-1',
      })

      expect(scheduler.startNextEffectInQueue(1, light.id)).toBe(true)
      expect(layerManager.removeQueuedEffect).toHaveBeenCalledWith(1, light.id)
      const started = layerManager.addActiveEffect.mock.calls[0][2] as LightEffectState
      expect(started.effectRunId).toBe('run-1')
    })

    it('discards a queued entry whose transitions do not target the light', () => {
      layerManager.getQueuedEffect.mockReturnValue({
        name: 'queued',
        effect: effectWith([transition(2)]),
        isPersistent: false,
        lightId: light.id,
      })

      expect(scheduler.startNextEffectInQueue(1, light.id)).toBe(false)
      expect(layerManager.removeQueuedEffect).toHaveBeenCalledWith(1, light.id)
      expect(layerManager.addActiveEffect).not.toHaveBeenCalled()
    })
  })

  describe('onLightEffectComplete', () => {
    it('fires the completion callback when no other light still runs the effect', () => {
      scheduler.onLightEffectComplete({ name: 'pulse', lightId: light.id } as LightEffectState)
      expect(fireCompletionCallback).toHaveBeenCalledWith('pulse')
    })

    it('holds the callback while another light still runs the effect', () => {
      layerManager.getActiveEffects.mockReturnValue(
        new Map([[1, new Map([['light-2', { name: 'pulse', lightId: 'light-2' }]])]]) as never,
      )

      scheduler.onLightEffectComplete({ name: 'pulse', lightId: light.id } as LightEffectState)

      expect(fireCompletionCallback).not.toHaveBeenCalled()
    })

    it('restarts a persistent run once its last light reports', () => {
      const transitions = [transition(1)]
      const runId = persistentRuns.register(
        'pulse',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
      )!

      scheduler.onLightEffectComplete({
        name: 'pulse',
        lightId: light.id,
        effectRunId: runId,
      } as LightEffectState)

      expect(persistentRuns.get(runId)?.remainingLights).toBe(1)
      expect(layerManager.addActiveEffect).toHaveBeenCalledTimes(1)
    })

    it('does not restart a run that was cancelled while the light was running', () => {
      const transitions = [transition(1)]
      const runId = persistentRuns.register(
        'pulse',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
      )!
      persistentRuns.cancel(runId)

      scheduler.onLightEffectComplete({
        name: 'pulse',
        lightId: light.id,
        effectRunId: runId,
      } as LightEffectState)

      expect(layerManager.addActiveEffect).not.toHaveBeenCalled()
    })
  })

  describe('removeEffectByLayer', () => {
    it('cancels the run, clears the slot and resets tracking when nothing is queued', () => {
      const runId = persistentRuns.register(
        'pulse',
        effectWith([]),
        groupByLayerAndLight([transition(1)]),
      )!
      layerManager.getActiveEffects.mockReturnValue(
        new Map([[1, new Map([[light.id, { name: 'pulse', effectRunId: runId }]])]]) as never,
      )
      layerManager.getQueuedEffect.mockReturnValue(undefined)

      scheduler.removeEffectByLayer(1, true)

      expect(persistentRuns.has(runId)).toBe(false)
      expect(layerManager.removeActiveEffect).toHaveBeenCalledWith(1, light.id)
      expect(layerManager.resetLayerTracking).toHaveBeenCalledWith(1)
    })
  })
})
