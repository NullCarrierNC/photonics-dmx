import { jest } from '@jest/globals'
import type { ILightingController } from '../../controllers/sequencer/interfaces'
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
 * suite can order a completion against a cue change. `removeAllEffects` cancels what is held and
 * tells the motion-wipe subscribers, as the real sequencer does. A later submission of a held name
 * does not displace the earlier one.
 */
export function completingLightingController(
  overrides: Partial<ILightingController> = {},
): CompletingLightingController {
  let held: Array<{ name: string; onComplete: (cancelled: boolean) => void }> = []
  let blackouts: Array<() => void> = []
  const wipeListeners = new Set<() => void>()
  const hold = (name: string, onComplete: (cancelled: boolean) => void): void => {
    held.push({ name, onComplete })
  }
  const release = (cancelled: boolean): void => {
    const due = held
    held = []
    for (const { onComplete } of due) onComplete(cancelled)
  }
  const settleBlackouts = (): void => {
    const due = blackouts
    blackouts = []
    for (const resolve of due) resolve()
  }
  const fake = fakeLightingController({
    addEffectWithCallback: (name, _effect, onComplete) => hold(name, onComplete),
    setEffectWithCallback: (name, _effect, onComplete) => hold(name, onComplete),
    replaceEffectWithCallback: (name, _effect, onComplete) => {
      hold(name, onComplete)
      return true
    },
    addEffectUnblockedNameWithCallback: (name, _effect, onComplete) => {
      hold(name, onComplete)
      return true
    },
    setEffectUnblockedNameWithCallback: (name, _effect, onComplete) => {
      hold(name, onComplete)
      return true
    },
    removeEffectCallback: (name) => {
      held = held.filter((entry) => entry.name !== name)
    },
    removeAllEffects: () => {
      settleBlackouts()
      release(true)
      for (const listener of Array.from(wipeListeners)) listener()
    },
    onMotionPatternsCleared: (listener) => {
      wipeListeners.add(listener)
      return () => {
        wipeListeners.delete(listener)
      }
    },
    blackout: () => new Promise<void>((resolve) => blackouts.push(resolve)),
    cancelBlackout: settleBlackouts,
    isBlackoutActive: () => blackouts.length > 0,
    ...overrides,
  })
  return Object.assign(fake, {
    tick: () => {
      settleBlackouts()
      release(false)
    },
    heldCompletions: () => held.map((entry) => entry.name),
  })
}
