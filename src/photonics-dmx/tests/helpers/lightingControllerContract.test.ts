import { describe, expect, it, jest } from '@jest/globals'
import type { ILightingController } from '../../controllers/sequencer/interfaces'
import type { Effect, RGBIO, TrackedLight } from '../../types'
import { getEffectSingleColor } from '../../effects/effectSingleColor'
import { BLACKOUT_LAYER, MAX_NODE_LAYER } from '../../constants/nodeConstants'
import { completingLightingController } from './fakeLightingController'
import { createSequencerHarness } from './sequencerHarness'
import { createMockTrackedLight } from './testFixtures'

const RED: RGBIO = { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1, blendMode: 'replace' }

/** Where an effect runs: a light group and a layer, front on layer 0 when left out. */
interface Placement {
  group?: 'front' | 'back'
  layer?: number
}

const EMPTY: Effect = { id: 'empty', description: '', transitions: [] }

function redEffect(lights: TrackedLight[], layer: number): Effect {
  return getEffectSingleColor({ color: RED, duration: 5000, lights, layer })
}

/**
 * A controller under the contract, with a frame step and an effect long enough to still be running.
 */
interface Subject {
  controller: ILightingController
  frame(): void
  /** Runs frames until a 500 ms blackout fade has ended. */
  settle(): void
  effect(placement?: Placement): Effect
  cleanup(): void
}

function realSequencer(): Subject {
  const h = createSequencerHarness({ frontCount: 2, backCount: 2 })
  return {
    controller: h.sequencer,
    frame: () => h.advanceBy(10),
    settle: () => h.advanceBy(800),
    effect: ({ group = 'front', layer = 0 } = {}) =>
      redEffect(h.lightManager.getLights([group], 'all'), layer),
    cleanup: () => h.cleanup(),
  }
}

function completingFake(): Subject {
  const fake = completingLightingController()
  const lights = (group: 'front' | 'back'): TrackedLight[] =>
    [1, 2].map((n) => createMockTrackedLight({ id: `${group}-${n}` }))
  return {
    controller: fake,
    frame: () => {},
    settle: () => fake.tick(),
    effect: ({ group = 'front', layer = 0 } = {}) => redEffect(lights(group), layer),
    cleanup: () => {},
  }
}

describe.each([
  ['the real sequencer', realSequencer],
  ['the completing fake', completingFake],
])('%s', (_name, subject) => {
  const withSubject = (run: (s: Subject) => void): void => {
    const s = subject()
    try {
      run(s)
    } finally {
      s.cleanup()
    }
  }
  const withSubjectAsync = async (run: (s: Subject) => Promise<void>): Promise<void> => {
    const s = subject()
    try {
      await run(s)
    } finally {
      s.cleanup()
    }
  }

  it('cancels the waiter an effect holds when a set replaces the look', () => {
    withSubject((s) => {
      const first = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('first', s.effect(), first)
      s.frame()

      s.controller.setEffectUnblockedNameWithCallback('second', s.effect(), jest.fn())
      s.frame()

      expect(first).toHaveBeenCalledWith(true)
    })
  })

  it('releases the displaced waiter when an effect of the same name replaces it', () => {
    withSubject((s) => {
      const displaced = jest.fn()
      const replacing = jest.fn()
      s.controller.replaceEffectWithCallback('move', s.effect(), displaced)
      s.frame()

      s.controller.replaceEffectWithCallback('move', s.effect(), replacing)
      s.frame()

      expect(displaced).toHaveBeenCalledWith(true)
      expect(replacing).not.toHaveBeenCalled()
    })
  })

  it('hands a running effect over to the waiter of an update of the same name', () => {
    withSubject((s) => {
      const first = jest.fn()
      const second = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('held', s.effect(), first)
      s.frame()

      expect(s.controller.updateEffectWithCallback('held', s.effect(), second)).toBe(true)
      s.frame()

      expect(first).toHaveBeenCalledWith(true)
      expect(second).not.toHaveBeenCalled()
    })
  })

  it('refuses an update with a waiter while a blackout fades', () => {
    withSubject((s) => {
      const late = jest.fn()
      void s.controller.blackout(500)
      s.frame()

      expect(s.controller.updateEffectWithCallback('late', s.effect(), late)).toBe(false)
    })
  })

  it('refuses an unblocked-name submission while a blackout fades', () => {
    withSubject((s) => {
      const late = jest.fn()
      void s.controller.blackout(500)
      s.frame()

      const accepted = s.controller.addEffectUnblockedNameWithCallback('late', s.effect(), late)
      s.frame()

      expect(accepted).toBe(false)
      expect(late).not.toHaveBeenCalled()
    })
  })

  it('parks a waiter on a name already running', () => {
    withSubject((s) => {
      const firstWaiter = jest.fn()
      const secondWaiter = jest.fn()
      expect(s.controller.addEffectUnblockedNameWithCallback('held', s.effect(), firstWaiter)).toBe(
        true,
      )
      s.frame()

      expect(
        s.controller.addEffectUnblockedNameWithCallback('held', s.effect(), secondWaiter),
      ).toBe(true)
      s.frame()

      expect(firstWaiter).not.toHaveBeenCalled()
      expect(secondWaiter).not.toHaveBeenCalled()
    })
  })

  it('refuses a callback-less unblocked-name submission of a name already running', () => {
    withSubject((s) => {
      s.controller.addEffectUnblockedNameWithCallback('running', s.effect(), jest.fn())
      s.frame()

      expect(s.controller.addEffectUnblockedName('running', s.effect())).toBe(false)
    })
  })

  it('cancels the waiter of an effect removed by name', () => {
    withSubject((s) => {
      const waiter = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('removed', s.effect(), waiter)
      s.frame()

      s.controller.removeEffect('removed', 0)
      s.frame()

      expect(waiter).toHaveBeenCalledWith(true)
    })
  })

  it('ends a zero-length blackout at once', () => {
    withSubject((s) => {
      void s.controller.blackout(0)

      expect(s.controller.isBlackoutActive()).toBe(false)
    })
  })

  it('cancels a held waiter on a zero-length blackout', () => {
    withSubject((s) => {
      const waiter = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('held', s.effect(), waiter)
      s.frame()

      void s.controller.blackout(0)
      s.frame()

      expect(waiter).toHaveBeenCalledWith(true)
    })
  })

  it('leaves an effect running when it is removed by name from another layer', () => {
    withSubject((s) => {
      const waiter = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('layered', s.effect(), waiter)
      s.frame()

      s.controller.removeEffect('layered', 7)

      expect(waiter).not.toHaveBeenCalled()
    })
  })

  it('refuses an unblocked-name submission of a name a callback-less effect runs', () => {
    withSubject((s) => {
      s.controller.addEffect('plain', s.effect())
      s.frame()

      expect(s.controller.addEffectUnblockedName('plain', s.effect())).toBe(false)
    })
  })

  it('parks an unblocked-name set on a name already running', () => {
    withSubject((s) => {
      const firstWaiter = jest.fn()
      s.controller.setEffectUnblockedNameWithCallback('held', s.effect(), firstWaiter)
      s.frame()

      expect(s.controller.setEffectUnblockedNameWithCallback('held', s.effect(), jest.fn())).toBe(
        true,
      )
      s.frame()

      expect(firstWaiter).not.toHaveBeenCalled()
    })
  })

  it('refuses a callback-less unblocked-name set of a name already running', () => {
    withSubject((s) => {
      s.controller.addEffectUnblockedNameWithCallback('held', s.effect(), jest.fn())
      s.frame()

      expect(s.controller.setEffectUnblockedName('held', s.effect())).toBe(false)
    })
  })

  it('cancels a fading blackout when an effect is added', () => {
    withSubject((s) => {
      void s.controller.blackout(500)
      s.frame()

      s.controller.addEffect('later', s.effect())
      s.frame()

      expect(s.controller.isBlackoutActive()).toBe(false)
    })
  })

  it('settles a second blackout at once while the first still fades', async () => {
    await withSubjectAsync(async (s) => {
      void s.controller.blackout(500)
      s.frame()

      let settled = false
      void s.controller.blackout(500).then(() => {
        settled = true
      })
      const stillFading = s.controller.isBlackoutActive()
      for (let i = 0; i < 5; i++) await Promise.resolve()

      expect(settled).toBe(true)
      expect(stillFading).toBe(true)
    })
  })

  it('ends a fading blackout on a zero-length blackout', () => {
    withSubject((s) => {
      void s.controller.blackout(500)
      s.frame()

      void s.controller.blackout(0)

      expect(s.controller.isBlackoutActive()).toBe(false)
    })
  })

  it('cancels a held waiter when a blackout fade ends', async () => {
    await withSubjectAsync(async (s) => {
      const waiter = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('held', s.effect(), waiter)
      s.frame()

      const done = s.controller.blackout(500)
      s.settle()
      await done

      expect(waiter).toHaveBeenCalledWith(true)
      expect(s.controller.isBlackoutActive()).toBe(false)
    })
  })

  it('cancels the waiter of an effect another name displaces on its layer and lights', () => {
    withSubject((s) => {
      const displaced = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('first', s.effect(), displaced)
      s.frame()

      s.controller.addEffect('second', s.effect())
      s.frame()

      expect(displaced).toHaveBeenCalledWith(true)
    })
  })

  it('cancels the waiter of an effect another name replaces on its layer and lights', () => {
    withSubject((s) => {
      const displaced = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('first', s.effect(), displaced)
      s.frame()

      s.controller.replaceEffect('second', s.effect())
      s.frame()

      expect(displaced).toHaveBeenCalledWith(true)
    })
  })

  it('leaves an effect running when another name is added on a different layer', () => {
    withSubject((s) => {
      const waiter = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('first', s.effect(), waiter)
      s.frame()

      s.controller.addEffect('second', s.effect({ layer: 1 }))
      s.frame()

      expect(waiter).not.toHaveBeenCalled()
    })
  })

  it('leaves an effect running when another name is added on other lights of its layer', () => {
    withSubject((s) => {
      const waiter = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('first', s.effect(), waiter)
      s.frame()

      s.controller.addEffect('second', s.effect({ group: 'back' }))
      s.frame()

      expect(waiter).not.toHaveBeenCalled()
    })
  })

  it('cancels the waiter of every effect on a layer removed by layer', () => {
    withSubject((s) => {
      const front = jest.fn()
      const back = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('front', s.effect(), front)
      s.controller.addEffectUnblockedNameWithCallback('back', s.effect({ group: 'back' }), back)
      s.frame()

      s.controller.removeEffectByLayer(0, false)
      s.frame()

      expect(front).toHaveBeenCalledWith(true)
      expect(back).toHaveBeenCalledWith(true)
    })
  })

  it('leaves an effect running when a different layer is removed by layer', () => {
    withSubject((s) => {
      const waiter = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('layered', s.effect(), waiter)
      s.frame()

      s.controller.removeEffectByLayer(1, false)
      s.frame()

      expect(waiter).not.toHaveBeenCalled()
    })
  })

  it('refuses an effect with no transitions', () => {
    withSubject((s) => {
      const waiter = jest.fn()

      expect(s.controller.addEffectUnblockedNameWithCallback('empty', EMPTY, waiter)).toBe(false)
      expect(s.controller.addEffectUnblockedName('empty', EMPTY)).toBe(false)
      expect(s.controller.replaceEffectWithCallback('empty', EMPTY, waiter)).toBe(false)
      s.controller.addEffect('empty', EMPTY)
      s.frame()

      expect(s.controller.addEffectUnblockedName('empty', s.effect())).toBe(true)
      expect(waiter).not.toHaveBeenCalled()
    })
  })

  it('refuses an effect with no transitions under a name already running', () => {
    withSubject((s) => {
      const running = jest.fn()
      const refused = jest.fn()
      s.controller.addEffectUnblockedNameWithCallback('held', s.effect(), running)
      s.frame()

      expect(s.controller.addEffectUnblockedNameWithCallback('held', EMPTY, refused)).toBe(false)
      s.controller.removeEffect('held', 0)
      s.frame()

      expect(running).toHaveBeenCalledWith(true)
      expect(refused).not.toHaveBeenCalled()
    })
  })

  it('keeps other effects running when a set repeats the last layer-0 name', () => {
    withSubject((s) => {
      const other = jest.fn()
      s.controller.setEffect('scene', s.effect())
      s.frame()
      s.controller.addEffectUnblockedNameWithCallback('other', s.effect({ layer: 1 }), other)
      s.frame()

      s.controller.setEffect('scene', s.effect())
      s.frame()

      expect(other).not.toHaveBeenCalled()
    })
  })

  it('clears other effects when a set names a different layer-0 effect', () => {
    withSubject((s) => {
      const other = jest.fn()
      s.controller.setEffect('scene', s.effect())
      s.frame()
      s.controller.addEffectUnblockedNameWithCallback('other', s.effect({ layer: 1 }), other)
      s.frame()

      s.controller.setEffect('next', s.effect())
      s.frame()

      expect(other).toHaveBeenCalledWith(true)
    })
  })

  it('refuses a submission on the blackout layer', () => {
    withSubject((s) => {
      const waiter = jest.fn()

      expect(
        s.controller.addEffectUnblockedName('overlay', s.effect({ layer: BLACKOUT_LAYER })),
      ).toBe(false)
      expect(
        s.controller.addEffectUnblockedNameWithCallback(
          'held',
          s.effect({ layer: BLACKOUT_LAYER }),
          waiter,
        ),
      ).toBe(false)
      s.frame()
      expect(waiter).not.toHaveBeenCalled()
    })
  })

  it('refuses an unblocked-name submission on the top cue layer while a blackout fades', () => {
    withSubject((s) => {
      void s.controller.blackout(500)
      s.frame()

      expect(
        s.controller.addEffectUnblockedName('overlay', s.effect({ layer: MAX_NODE_LAYER })),
      ).toBe(false)
      expect(s.controller.isBlackoutActive()).toBe(true)
    })
  })
})
