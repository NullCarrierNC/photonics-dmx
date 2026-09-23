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
  effect(): Effect
  cleanup(): void
}

function realSequencer(): Subject {
  const h = createSequencerHarness({ frontCount: 2, backCount: 0 })
  return {
    controller: h.sequencer,
    frame: () => h.advanceBy(10),
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
  return {
    controller: completingLightingController(),
    frame: () => {},
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
})
