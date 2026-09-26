import { describe, expect, it, jest } from '@jest/globals'
import type { ILightingController } from '../../controllers/sequencer/interfaces'
import type { Effect, RGBIO } from '../../types'
import { getEffectSingleColor } from '../../effects/effectSingleColor'
import { completingLightingController } from './fakeLightingController'
import { createSequencerHarness } from './sequencerHarness'

const RED: RGBIO = { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1, blendMode: 'replace' }

/**
 * A controller under the contract, with a frame step and an effect long enough to still be running.
 */
interface Subject {
  controller: ILightingController
  frame(): void
  /** Runs frames until a 500 ms blackout fade has ended. */
  settle(): void
  effect(): Effect
  cleanup(): void
}

function realSequencer(): Subject {
  const h = createSequencerHarness({ frontCount: 2, backCount: 0 })
  return {
    controller: h.sequencer,
    frame: () => h.advanceBy(10),
    settle: () => h.advanceBy(800),
    effect: () =>
      getEffectSingleColor({
        color: RED,
        duration: 5000,
        lights: h.lightManager.getLights(['front'], 'all'),
        layer: 0,
      }),
    cleanup: () => h.cleanup(),
  }
}

function completingFake(): Subject {
  const fake = completingLightingController()
  return {
    controller: fake,
    frame: () => {},
    settle: () => fake.tick(),
    effect: () => ({ id: 'held', description: '', transitions: [] }) as unknown as Effect,
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
      s.controller.addEffectWithCallback('first', s.effect(), first)
      s.frame()

      s.controller.setEffectWithCallback('second', s.effect(), jest.fn())
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
      s.controller.addEffectWithCallback('removed', s.effect(), waiter)
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
      s.controller.addEffectWithCallback('held', s.effect(), waiter)
      s.frame()

      void s.controller.blackout(0)
      s.frame()

      expect(waiter).toHaveBeenCalledWith(true)
    })
  })

  it('leaves an effect running when it is removed by name from another layer', () => {
    withSubject((s) => {
      const waiter = jest.fn()
      s.controller.addEffectWithCallback('layered', s.effect(), waiter)
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
})
