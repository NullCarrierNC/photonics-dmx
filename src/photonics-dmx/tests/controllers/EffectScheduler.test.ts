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
      getEffectQueue: jest.fn().mockReturnValue(new Map()),
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

    it('leaves the lights it has already started alone when it displaces another', () => {
      // The layer-wide removal runs outside the per-light loop, so taking a slot from a different
      // effect leaves alone the lights this same submission has just started, along with their
      // completion callbacks and their in-flight transitions.
      const two = createMockTrackedLight({ id: 'light-2' })
      const transitions: EffectTransition[] = [
        { ...transition(1), lights: [light] },
        { ...transition(1), lights: [two] },
      ]
      // A live active-effects map, so a light started earlier in this submission is visible to a
      // removal that happens later in it. A fixed map cannot show the eviction at all.
      const active = new Map<string, LightEffectState>([
        ['light-2', { name: 'other', lightId: 'light-2' } as LightEffectState],
      ])
      layerManager.getActiveEffects.mockReturnValue(new Map([[1, active]]))
      layerManager.getActiveEffect.mockImplementation((_layer, lightId) => active.get(lightId))
      layerManager.addActiveEffect.mockImplementation((_layer, lightId, state) => {
        active.set(lightId as string, state as LightEffectState)
      })
      layerManager.removeActiveEffect.mockImplementation((_layer, lightId) => {
        active.delete(lightId as string)
      })

      scheduler.applyEffectTransitions(
        'pulse',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
        false,
      )

      // Only the slot that held a different effect is given up.
      expect(layerManager.removeActiveEffect).toHaveBeenCalledTimes(1)
      expect(layerManager.removeActiveEffect).toHaveBeenCalledWith(1, 'light-2')
      // Both lights end up running the submitted effect.
      expect([...active.keys()].sort()).toEqual(['light-1', 'light-2'])
      expect([...active.values()].every((e) => e.name === 'pulse')).toBe(true)
      expect(fireCompletionCallback).not.toHaveBeenCalledWith('pulse', true)
    })

    it('advances past a first transition that needs neither time nor an event', () => {
      // Duration 0 with an event condition counted zero times: nothing will ever supply the event,
      // so the effect has to move on by itself rather than sit in waitingUntil forever.
      const instant: EffectTransition = {
        ...transition(1),
        transform: { ...transition(1).transform, duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilConditionCount: 0,
      }
      const transitions = [instant, transition(1)]

      scheduler.applyEffectTransitions(
        'instant',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
        false,
      )

      const started = layerManager.addActiveEffect.mock.calls[0][2] as LightEffectState
      expect(started.currentTransitionIndex).toBe(1)
      expect(started.state).not.toBe('waitingUntil')
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

    it('cancels a queued persistent run before displacing the active effect', () => {
      const queuedRunId = persistentRuns.register(
        'held',
        effectWith([]),
        groupByLayerAndLight([transition(1)]),
      )
      layerManager.getActiveEffect.mockReturnValue({
        name: 'held',
        lightId: light.id,
      } as unknown as LightEffectState)
      layerManager.getQueuedEffect.mockReturnValue({
        name: 'held',
        effect: effectWith([transition(1)]),
        isPersistent: true,
        lightId: light.id,
        effectRunId: queuedRunId,
      })
      const transitions = [transition(1)]

      scheduler.applyEffectTransitions(
        'usurper',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
        false,
      )

      expect(persistentRuns.has(queuedRunId!)).toBe(false)
      expect(layerManager.removeQueuedEffect).toHaveBeenCalledWith(1, light.id)
    })

    it('tells the waiter of a queued entry it drops from behind a different active effect', () => {
      layerManager.getActiveEffect.mockReturnValue({
        name: 'other',
        lightId: light.id,
      } as unknown as LightEffectState)
      layerManager.getQueuedEffect.mockReturnValue({
        name: 'waiting',
        effect: effectWith([transition(1)]),
        isPersistent: false,
        lightId: light.id,
      })
      const transitions = [transition(1)]

      scheduler.applyEffectTransitions(
        'pulse',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
        false,
      )

      expect(fireCompletionCallback).toHaveBeenCalledWith('waiting', true)
      expect(fireCompletionCallback).toHaveBeenCalledTimes(1)
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

    it('fires the displaced effect callback once when it differs from the incoming name', () => {
      layerManager.getActiveEffect.mockReturnValue({
        name: 'old',
        lightId: light.id,
      } as unknown as LightEffectState)
      const transitions = [transition(1)]

      scheduler.replaceEffectTransitions(
        'pulse',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
        false,
      )

      expect(fireCompletionCallback).toHaveBeenCalledWith('old', true)
      expect(fireCompletionCallback).toHaveBeenCalledTimes(1)
    })

    it('does not fire a callback for the incoming name replacing its own prior run', () => {
      layerManager.getActiveEffect.mockReturnValue({
        name: 'pulse',
        lightId: light.id,
      } as unknown as LightEffectState)
      const transitions = [transition(1)]

      scheduler.replaceEffectTransitions(
        'pulse',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
        false,
      )

      expect(fireCompletionCallback).not.toHaveBeenCalled()
    })

    it('cancels a queued successor run on the displaced slot', () => {
      const queuedRunId = persistentRuns.register(
        'old',
        effectWith([]),
        groupByLayerAndLight([transition(1)]),
      )
      layerManager.getActiveEffect.mockReturnValue({
        name: 'old',
        lightId: light.id,
      } as unknown as LightEffectState)
      layerManager.getQueuedEffect.mockReturnValue({
        name: 'old',
        effect: effectWith([transition(1)]),
        isPersistent: true,
        lightId: light.id,
        effectRunId: queuedRunId,
      })
      const transitions = [transition(1)]

      scheduler.replaceEffectTransitions(
        'pulse',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
        false,
      )

      expect(persistentRuns.has(queuedRunId!)).toBe(false)
    })

    it('tells the waiter of a differently named queued entry it drops, once', () => {
      layerManager.getActiveEffect.mockReturnValue({
        name: 'old',
        lightId: light.id,
      } as unknown as LightEffectState)
      layerManager.getQueuedEffect.mockReturnValue({
        name: 'waiting',
        effect: effectWith([transition(1)]),
        isPersistent: false,
        lightId: light.id,
      })
      const transitions = [transition(1)]

      scheduler.replaceEffectTransitions(
        'pulse',
        effectWith(transitions),
        groupByLayerAndLight(transitions),
        false,
      )

      expect(fireCompletionCallback).toHaveBeenCalledWith('waiting', true)
      expect(fireCompletionCallback.mock.calls.filter(([n]) => n === 'waiting')).toHaveLength(1)
    })
  })

  describe('startNextEffectInQueue', () => {
    const two = createMockTrackedLight({ id: 'light-2' })
    // Two transitions on the same layer, each targeting a different light.
    const staggered: EffectTransition[] = [
      { ...transition(1), lights: [light] },
      { ...transition(1), lights: [two] },
    ]

    /** Queues an entry for each light of the staggered effect, all under the same run id. */
    const queueStaggered = (effect: Effect, effectRunId?: string): void => {
      const queue = new Map(
        [light, two].map((l) => [
          l.id,
          {
            name: 'staggered',
            effect,
            isPersistent: effectRunId !== undefined,
            lightId: l.id,
            effectRunId,
          },
        ]),
      )
      layerManager.getQueuedEffect.mockImplementation((_layer, lightId) => queue.get(lightId))
    }

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

    it('starts a staggered effect on each queued light with only the transitions targeting it', () => {
      queueStaggered(effectWith(staggered), 'run-1')
      const startEffect = jest.spyOn(scheduler, 'startEffect')

      expect(scheduler.startNextEffectInQueue(1, light.id)).toBe(true)
      expect(scheduler.startNextEffectInQueue(1, two.id)).toBe(true)

      expect(
        startEffect.mock.calls.map(([, , lights, , transitions]) => [lights, transitions]),
      ).toEqual([
        [[light], [staggered[0]]],
        [[two], [staggered[1]]],
      ])
      const started = layerManager.addActiveEffect.mock.calls.map(([, lightId, state]) => [
        lightId,
        (state as LightEffectState).effectRunId,
      ])
      expect(started).toEqual([
        [light.id, 'run-1'],
        [two.id, 'run-1'],
      ])
      expect(fireCompletionCallback).not.toHaveBeenCalled()
    })

    it('restarts a persistent staggered run once every light it started from the queue finishes', () => {
      const effect = effectWith(staggered)
      const runId = persistentRuns.register('staggered', effect, groupByLayerAndLight(staggered))!
      queueStaggered(effect, runId)

      scheduler.startNextEffectInQueue(1, light.id)
      scheduler.startNextEffectInQueue(1, two.id)
      const queuedStarts = layerManager.addActiveEffect.mock.calls.map(
        ([, , state]) => state as LightEffectState,
      )
      expect(queuedStarts).toHaveLength(2)

      layerManager.addActiveEffect.mockClear()
      queuedStarts.forEach((state) => scheduler.onLightEffectComplete(state))

      const restarted = layerManager.addActiveEffect.mock.calls.map(([, lightId, state]) => [
        lightId,
        (state as LightEffectState).effectRunId,
      ])
      expect(restarted).toEqual([
        [light.id, runId],
        [two.id, runId],
      ])
    })

    it('discards a queued entry whose transitions on the layer only target other lights', () => {
      layerManager.getQueuedEffect.mockReturnValue({
        name: 'queued',
        effect: effectWith([staggered[1]]),
        isPersistent: false,
        lightId: light.id,
      })

      expect(scheduler.startNextEffectInQueue(1, light.id)).toBe(false)
      expect(layerManager.removeQueuedEffect).toHaveBeenCalledWith(1, light.id)
      expect(layerManager.addActiveEffect).not.toHaveBeenCalled()
      expect(fireCompletionCallback).toHaveBeenCalledWith('queued', true)
      expect(fireCompletionCallback).toHaveBeenCalledTimes(1)
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
      expect(fireCompletionCallback).toHaveBeenCalledWith('queued', true)
      expect(fireCompletionCallback).toHaveBeenCalledTimes(1)
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

    it('holds the callback while a run of the same name waits in a queue', () => {
      layerManager.getEffectQueue.mockReturnValue(
        new Map([[1, new Map([[light.id, { name: 'pulse', lightId: light.id }]])]]) as never,
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
