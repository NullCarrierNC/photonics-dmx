import { jest } from '@jest/globals'
import type { ILightingController } from '../../controllers/sequencer/interfaces'

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
  setEffect: () => Promise.resolve(),
  replaceEffect: () => {},
  replaceEffectWithCallback: () => true,
  addEffectUnblockedName: () => true,
  setEffectUnblockedName: () => true,
  addEffectUnblockedNameWithCallback: () => {},
  setEffectUnblockedNameWithCallback: () => {},
  removeEffectByLayer: () => {},
  removeEffect: () => {},
  removeAllEffects: () => {},
  holdOcclusion: () => {},
  getActiveEffectsForLight: () => new Map(),
  isLayerFreeForLight: () => true,
  setState: () => {},
  schedulePanTiltClear: () => {},
  cancelPanTiltClear: () => {},
  addMotionPattern: () => {},
  removeMotionPattern: () => {},
  getMotionPattern: () => undefined,
  updateMotionPatternConfig: () => {},
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
