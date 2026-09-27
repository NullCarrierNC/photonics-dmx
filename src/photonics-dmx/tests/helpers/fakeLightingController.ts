import { jest } from '@jest/globals'
import type { ILightingController } from '../../controllers/sequencer/interfaces'
import type { Effect } from '../../types'
import { CLOCK_RATE_MS_DEFAULT } from '../../../shared/clockRate'
import { drawsOnBlackoutLayer } from '../../controllers/sequencer/effectSubmission'

type Member = keyof ILightingController

/** A lighting controller whose members are all jest mocks, typed from the real interface. */
export type FakeLightingController = {
  [K in Member]: jest.Mock<ILightingController[K]>
}

/**
 * How the real controller answers when it accepts an effect: the unblocked-name and replace calls
 * report true, the async calls resolve, and completion callbacks are never fired. Typed as the
 * interface, so a member added there fails to compile here rather than in whichever suite calls it.
 */
const accepting: ILightingController = {
  addEffect: () => {},
  setEffect: () => {},
  replaceEffect: () => {},
  replaceEffectWithCallback: () => true,
  updateEffect: () => {},
  updateEffectWithCallback: () => true,
  addEffectUnblockedName: () => true,
  setEffectUnblockedName: () => true,
  addEffectUnblockedNameWithCallback: () => true,
  setEffectUnblockedNameWithCallback: () => true,
  removeEffectByLayer: () => {},
  removeEffect: () => {},
  removeAllEffects: () => {},
  holdOcclusion: () => {},
  getActiveEffectsForLight: () => new Map(),
  isLayerFreeForLight: () => true,
  getFrameIntervalMs: () => CLOCK_RATE_MS_DEFAULT,
  setState: () => {},
  schedulePanTiltClear: () => {},
  cancelPanTiltClear: () => {},
  addMotionPattern: () => {},
  removeMotionPattern: () => {},
  getMotionPattern: () => undefined,
  updateMotionPatternConfig: () => {},
  onMotionPatternsCleared: () => () => {},
  removeEffectCallback: () => {},
  onBeat: () => {},
  onMeasure: () => {},
  onKeyframe: () => {},
  onKeyframeFirst: () => {},
  onKeyframeNext: () => {},
  onKeyframePrevious: () => {},
  onDrumNote: () => {},
  onGuitarNote: () => {},
  onBassNote: () => {},
  onKeysNote: () => {},
  onVocalNote: () => {},
  handleSongEvent: () => {},
  blackout: () => Promise.resolve(),
  cancelBlackout: () => {},
  isBlackoutActive: () => false,
  shutdown: () => {},
}

function setMember<K extends Member>(
  fake: FakeLightingController,
  key: K,
  impl: ILightingController[K],
): void {
  fake[key] = (jest.isMockFunction(impl) ? impl : jest.fn(impl)) as FakeLightingController[K]
}

/**
 * A lighting controller for suites that drive cues and processors without a real sequencer.
 * Every member is a mock answering as the real controller does when it accepts an effect. A suite
 * that needs a callback fired or a different answer passes its own implementation, and a mock it
 * passes is used as it is.
 */
export function fakeLightingController(
  overrides: Partial<ILightingController> = {},
): FakeLightingController {
  const members: ILightingController = { ...accepting, ...overrides }
  const fake = {} as FakeLightingController
  for (const key of Object.keys(members) as Member[]) {
    setMember(fake, key, members[key])
  }
  return fake
}

/** A fake whose completions wait for the suite, as the real sequencer's wait for a later frame. */
export type CompletingLightingController = FakeLightingController & {
  /**
   * Ends a pending blackout fade, cancelling every held effect as the fade's closing wipe does.
   * With no fade pending it finishes every running effect at once, telling their waiters oldest
   * first.
   */
  tick(): void
  /** The names whose completion callbacks are held, oldest first. */
  heldCompletions(): string[]
}

/**
 * A fake that holds every completion callback and blackout until the suite calls `tick`, so a
 * suite can order a completion against a cue change. Each effect runs on the layer and light slots
 * its transitions name, and takes those slots from any other name, as in the real sequencer. Queues
 * are not modelled, so a name submitted onto slots it already holds keeps them.
 * lightingControllerContract.test.ts runs each case it lists against this fake and the real
 * sequencer. `removeAllEffects` also tells the motion-wipe subscribers.
 */
export function completingLightingController(
  overrides: Partial<ILightingController> = {},
): CompletingLightingController {
  /** The name running on each slot, keyed by layer and light id. */
  const slots = new Map<string, { name: string; layer: number }>()
  /** Completion callbacks held per name, in the order they were registered. */
  const waiters = new Map<string, Array<(cancelled: boolean) => void>>()
  let blackouts: Array<() => void> = []
  let lastLayer0Name = ''
  const wipeListeners = new Set<() => void>()

  const isRunning = (name: string): boolean =>
    Array.from(slots.values()).some((slot) => slot.name === name)
  const hold = (name: string, onComplete: (cancelled: boolean) => void): void => {
    waiters.set(name, [...(waiters.get(name) ?? []), onComplete])
  }
  const fire = (name: string, cancelled: boolean): void => {
    const held = waiters.get(name) ?? []
    waiters.delete(name)
    for (const waiter of held) waiter(cancelled)
  }
  /** Tells the waiters of each name that no longer holds a slot that its run was cancelled. */
  const fireUnscheduled = (names: Iterable<string>): void => {
    for (const name of names) if (!isRunning(name)) fire(name, true)
  }
  /** Frees the slots that match, then tells the waiters of the names left with none. */
  const vacate = (matches: (name: string, layer: number) => boolean): void => {
    const evicted = new Set<string>()
    for (const [key, slot] of Array.from(slots)) {
      if (!matches(slot.name, slot.layer)) continue
      slots.delete(key)
      evicted.add(slot.name)
    }
    fireUnscheduled(evicted)
  }
  /** Runs `name` on the effect's slots, displacing any other name running there. */
  const place = (name: string, effect: Effect): void => {
    const displaced = new Set<string>()
    for (const transition of effect.transitions) {
      if (transition.layer === 0) lastLayer0Name = name
      for (const light of transition.lights) {
        const key = `${transition.layer}:${light.id}`
        const current = slots.get(key)
        if (current && current.name !== name) displaced.add(current.name)
        slots.set(key, { name, layer: transition.layer })
      }
    }
    fireUnscheduled(displaced)
  }
  const blackoutPending = (): boolean => blackouts.length > 0
  const settleBlackouts = (): void => {
    const due = blackouts
    blackouts = []
    for (const resolve of due) resolve()
  }
  /** Drops every effect and cancels every held waiter, as a wipe or a set's clearing step does. */
  const wipe = (): void => {
    slots.clear()
    lastLayer0Name = ''
    const held = Array.from(waiters.values()).flat()
    waiters.clear()
    for (const waiter of held) waiter(true)
  }
  const clearForSet = (): void => {
    settleBlackouts()
    wipe()
  }
  /** An effect with nothing to draw, or one drawing on the blackout's layer, is refused. */
  const refused = (effect: Effect): boolean =>
    effect.transitions.length === 0 || drawsOnBlackoutLayer(effect)
  /** Whether an unblocked-name submission is refused before the duplicate-name check. */
  const refusedUnblocked = (effect: Effect): boolean => refused(effect) || blackoutPending()
  /** An add or replace cancels a fading blackout. */
  const add = (name: string, effect: Effect): boolean => {
    if (refused(effect)) return false
    settleBlackouts()
    place(name, effect)
    return true
  }

  const fake = fakeLightingController({
    addEffect: (name, effect) => {
      add(name, effect)
    },
    replaceEffect: (name, effect) => {
      add(name, effect)
    },
    setEffect: (name, effect) => {
      if (drawsOnBlackoutLayer(effect)) return
      settleBlackouts()
      if (effect.transitions.length === 0) return
      const onLayer0 = effect.transitions.some((transition) => transition.layer === 0)
      if (onLayer0 && lastLayer0Name === name) {
        vacate((running, layer) => running === name && layer === 0)
      } else {
        wipe()
      }
      place(name, effect)
    },
    replaceEffectWithCallback: (name, effect, onComplete) => {
      if (!add(name, effect)) return false
      fire(name, true)
      hold(name, onComplete)
      return true
    },
    updateEffectWithCallback: (name, effect, onComplete) => {
      if (blackoutPending() || refused(effect)) return false
      place(name, effect)
      fire(name, true)
      hold(name, onComplete)
      return true
    },
    addEffectUnblockedName: (name, effect) => {
      if (refusedUnblocked(effect) || isRunning(name)) return false
      place(name, effect)
      return true
    },
    setEffectUnblockedName: (name, effect) => {
      if (refusedUnblocked(effect) || isRunning(name)) return false
      clearForSet()
      place(name, effect)
      return true
    },
    addEffectUnblockedNameWithCallback: (name, effect, onComplete) => {
      if (refusedUnblocked(effect)) return false
      if (!isRunning(name)) place(name, effect)
      hold(name, onComplete)
      return true
    },
    setEffectUnblockedNameWithCallback: (name, effect, onComplete) => {
      if (refusedUnblocked(effect)) return false
      if (!isRunning(name)) {
        clearForSet()
        place(name, effect)
      }
      hold(name, onComplete)
      return true
    },
    removeEffect: (name, layer) => vacate((running, at) => running === name && at === layer),
    removeEffectByLayer: (layer) => vacate((_name, at) => at === layer),
    removeEffectCallback: (name) => {
      waiters.delete(name)
    },
    removeAllEffects: () => {
      clearForSet()
      for (const listener of Array.from(wipeListeners)) listener()
    },
    onMotionPatternsCleared: (listener) => {
      wipeListeners.add(listener)
      return () => {
        wipeListeners.delete(listener)
      }
    },
    blackout: (duration) => {
      if (duration <= 0) {
        clearForSet()
        return Promise.resolve()
      }
      if (blackoutPending()) return Promise.resolve()
      return new Promise<void>((resolve) => blackouts.push(resolve))
    },
    cancelBlackout: settleBlackouts,
    isBlackoutActive: () => blackouts.length > 0,
    ...overrides,
  })
  return Object.assign(fake, {
    tick: () => {
      if (blackoutPending()) {
        wipe()
        settleBlackouts()
        return
      }
      const finished = new Set(Array.from(slots.values(), (slot) => slot.name))
      slots.clear()
      for (const name of Array.from(waiters.keys())) {
        if (finished.has(name) && !isRunning(name)) fire(name, false)
      }
    },
    heldCompletions: () => Array.from(waiters.keys()),
  })
}
