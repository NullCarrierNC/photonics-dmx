import { jest } from '@jest/globals'
import type { ILightingController } from '../../controllers/sequencer/interfaces'
import type { Effect } from '../../types'
import { CLOCK_RATE_MS_DEFAULT } from '../../../shared/clockRate'

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
  addEffectWithCallback: () => {},
  setEffectWithCallback: () => {},
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
  enableDebug: () => {},
  debugLightLayers: () => {},
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
  /** Finishes every held effect, oldest first, and settles a pending blackout. */
  tick(): void
  /** The names whose completion callbacks are held, oldest first. */
  heldCompletions(): string[]
}

/**
 * A fake that holds every completion callback and blackout until the suite calls `tick`, so a
 * suite can order a completion against a cue change. It answers waiters as the real sequencer does,
 * which lightingControllerContract.test.ts checks against both, and `removeAllEffects` also tells
 * the motion-wipe subscribers.
 */
export function completingLightingController(
  overrides: Partial<ILightingController> = {},
): CompletingLightingController {
  /** A submission still running: its layer, and its completion callback when it has one. */
  type Run = { name: string; layer: number; onComplete?: (cancelled: boolean) => void }
  let runs: Run[] = []
  let blackouts: Array<() => void> = []
  const wipeListeners = new Set<() => void>()
  const start = (name: string, effect: Effect, onComplete?: (cancelled: boolean) => void): void => {
    runs.push({ name, layer: effect.transitions[0]?.layer ?? 0, onComplete })
  }
  const end = (matches: (run: Run) => boolean, cancelled: boolean): void => {
    const due = runs.filter(matches)
    runs = runs.filter((run) => !matches(run))
    for (const run of due) run.onComplete?.(cancelled)
  }
  const cancelAll = (): void => end(() => true, true)
  const named =
    (name: string) =>
    (run: Run): boolean =>
      run.name === name
  const blackoutPending = (): boolean => blackouts.length > 0
  const settleBlackouts = (): void => {
    const due = blackouts
    blackouts = []
    for (const resolve of due) resolve()
  }
  const fake = fakeLightingController({
    addEffect: (name, effect) => start(name, effect),
    setEffect: (name, effect) => {
      cancelAll()
      start(name, effect)
    },
    addEffectWithCallback: (name, effect, onComplete) => start(name, effect, onComplete),
    setEffectWithCallback: (name, effect, onComplete) => {
      cancelAll()
      start(name, effect, onComplete)
    },
    replaceEffectWithCallback: (name, effect, onComplete) => {
      end(named(name), true)
      start(name, effect, onComplete)
      return true
    },
    addEffectUnblockedName: (name, effect) => {
      if (blackoutPending() || runs.some(named(name))) return false
      start(name, effect)
      return true
    },
    setEffectUnblockedName: (name, effect) => {
      if (blackoutPending()) return false
      cancelAll()
      start(name, effect)
      return true
    },
    addEffectUnblockedNameWithCallback: (name, effect, onComplete) => {
      if (blackoutPending()) return false
      start(name, effect, onComplete)
      return true
    },
    setEffectUnblockedNameWithCallback: (name, effect, onComplete) => {
      if (blackoutPending()) return false
      cancelAll()
      start(name, effect, onComplete)
      return true
    },
    removeEffect: (name, layer) => end((run) => run.name === name && run.layer === layer, true),
    removeEffectCallback: (name) => {
      for (const run of runs.filter(named(name))) run.onComplete = undefined
    },
    removeAllEffects: () => {
      settleBlackouts()
      cancelAll()
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
        cancelAll()
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => blackouts.push(resolve))
    },
    cancelBlackout: settleBlackouts,
    isBlackoutActive: () => blackouts.length > 0,
    ...overrides,
  })
  return Object.assign(fake, {
    tick: () => {
      settleBlackouts()
      end(() => true, false)
    },
    heldCompletions: () => runs.filter((run) => run.onComplete).map((run) => run.name),
  })
}
