/**
 * The `ipcApi` stand-in every renderer suite that touches main needs.
 *
 * `jest.mock` is hoisted and its factory cannot close over an import, so each suite still writes
 * its own registration. The factory reaches this object through `jest.requireActual`:
 *
 *   jest.mock('../ipcApi', () =>
 *     jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
 *       '@renderer/tests/helpers/ipcApiMock',
 *     ).ipcApiMock,
 *   )
 *
 * and reads a channel typed from the real module with `jest.mocked(ipcApi.savePrefs)`.
 *
 * Jest gives each suite its own module registry, so the object is per-suite despite being a
 * module singleton.
 */
import { jest } from '@jest/globals'
import type * as ipcApi from '../../ipcApi'
import { DEFAULT_PREFERENCES } from '../../../../services/configuration/configurationDefaults'
import { DEFAULT_AUDIO_GAME_MODE } from '../../../../photonics-dmx/listeners/Audio/AudioTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../../../photonics-dmx/listeners/Audio/AudioConfig'
import { DEFAULT_MASTER_DIMMER_PERCENT } from '../../../../photonics-dmx/controllers/MasterOutputState'
import { ConfigStrobeType } from '../../../../photonics-dmx/types'

/** What main answers when it accepted a write. */
export const accepted = { success: true } as const

/** What main answers when it refused one. */
export function refused(error = 'refused'): { success: false; error: string } {
  return { success: false, error }
}

type Api = typeof ipcApi

/** What main answers when the user dismisses a file dialog. */
function dismissed(action: 'import' | 'export'): {
  success: false
  error: string
  cancelled: true
} {
  return { success: false, error: `User cancelled ${action}.`, cancelled: true }
}

/** The file an export writes, named after what it exports. */
function exportedPath(source: string): { success: true; path: string } {
  return { success: true, path: `/exports/${source.replace(/^.*[\\/]/, '')}` }
}

const MASTER_OUTPUT = {
  dimmerPercent: DEFAULT_MASTER_DIMMER_PERCENT,
  blackout: false,
  strobeOutputEnabled: true,
}

/**
 * Each export's default answer, typed as the module itself, so a missing export or an answer
 * outside an export's declared type fails to compile here. Writes are accepted, settings are
 * echoed back, getters answer as a fresh install does, a file dialog that would hand back content
 * is dismissed, and a read of a file this table does not hold is refused.
 */
const ANSWERS: Api = {
  // App shell
  getLifecyclePhase: async () => 'running',
  retryControllerInit: async () => accepted,
  openCueEditorWindow: async () => accepted,
  openAudioPreviewWindow: async () => accepted,
  reportUnsavedChanges: () => {},
  getAppVersion: async () => '0.0.0',
  getValidationErrors: async () => [],
  getCorruptRecoveryEvents: async () => ({ files: [] }),
  getSystemStatus: async () => ({
    success: true,
    isYargEnabled: false,
    isRb3Enabled: false,
    senderStatus: { sacn: false, artnet: false, enttecpro: false, opendmx: false, ipc: false },
  }),
  showItemInFolder: async () => accepted,
  openPath: async () => accepted,

  // Audio and the cue registries
  getAudioConfig: async () => DEFAULT_AUDIO_CONFIG,
  saveAudioConfig: async () => accepted,
  getAudioEnabled: async () => false,
  setAudioEnabled: async () => accepted,
  getEnabledAudioCueGroups: async () => [],
  setEnabledAudioCueGroups: async () => accepted,
  getDisabledYargCues: async () => ({}),
  setDisabledYargCues: async () => accepted,
  getDisabledAudioCues: async () => ({}),
  setDisabledAudioCues: async () => accepted,
  getEnabledYargMotionCueGroups: async () => [],
  setEnabledYargMotionCueGroups: async () => accepted,
  getDisabledYargMotionCues: async () => ({}),
  setDisabledYargMotionCues: async () => accepted,
  getEnabledAudioMotionCueGroups: async () => [],
  setEnabledAudioMotionCueGroups: async () => accepted,
  getDisabledAudioMotionCues: async () => ({}),
  setDisabledAudioMotionCues: async () => accepted,
  getRb3CueGroups: async () => [],
  getRb3MotionCueGroups: async () => [],
  getEnabledRb3CueGroups: async () => [],
  setEnabledRb3CueGroups: async () => accepted,
  getDisabledRb3Cues: async () => ({}),
  setDisabledRb3Cues: async () => accepted,
  getEnabledRb3MotionCueGroups: async () => [],
  setEnabledRb3MotionCueGroups: async () => accepted,
  getDisabledRb3MotionCues: async () => ({}),
  setDisabledRb3MotionCues: async () => accepted,
  getAudioReactiveCues: async () => ({
    success: true,
    activeCueType: '',
    secondaryCueType: null,
    cues: [],
  }),
  setActiveAudioCue: async () => accepted,
  getAudioGameMode: async () => DEFAULT_AUDIO_GAME_MODE,
  setAudioGameMode: async (updates) => ({
    success: true,
    config: { ...DEFAULT_AUDIO_GAME_MODE, ...updates },
  }),
  getMotionEnabled: async () => true,
  setMotionEnabled: async () => accepted,
  getActiveAudioMotionCue: async () => null,
  setActiveAudioMotionCue: async () => accepted,
  getActiveYargMotionCue: async () => null,
  setActiveYargMotionCue: async () => accepted,
  getActiveRb3MotionCue: async () => null,
  setActiveRb3MotionCue: async () => accepted,
  sendAudioData: () => {},

  // Light library, layout, preferences and rigs
  getLightLibrary: async () => [],
  getMyLights: async () => [],
  saveMyLights: async () => accepted,
  getLightLayout: async () => ({
    numLights: 0,
    lightLayout: { id: '', label: '' },
    strobeType: ConfigStrobeType.None,
    frontLights: [],
    backLights: [],
    strobeLights: [],
  }),
  saveLightLayout: async () => accepted,
  getPrefs: async () => DEFAULT_PREFERENCES,
  savePrefs: async () => accepted,
  getDmxRigs: async () => [],
  getDmxRig: async () => undefined,
  getActiveRigs: async () => [],
  saveDmxRig: async () => accepted,
  deleteDmxRig: async () => accepted,
  exportRig: async (rigId) => exportedPath(`${rigId}.json`),
  pickRigImportFile: async () => dismissed('import'),

  // Cue selection
  setCueConsistencyWindow: async (windowMs) => ({ success: true, windowMs }),
  getCueConsistencyWindow: async () => ({
    success: true,
    windowMs: DEFAULT_PREFERENCES.cueConsistencyWindow,
  }),
  getMotionCueMinHoldMs: async () => ({ success: true, minHoldMs: 5000 }),
  setMotionCueMinHoldMs: async (minHoldMs) => ({ success: true, minHoldMs }),
  getYargFallbackCueTimeMs: async () => ({
    success: true,
    fallbackMs: DEFAULT_PREFERENCES.yargFallbackCueTimeMs,
  }),
  setYargFallbackCueTimeMs: async (fallbackMs) => ({ success: true, fallbackMs }),
  getMotionCueProbabilityPercent: async () => ({ success: true, percent: 50 }),
  setMotionCueProbabilityPercent: async (percent) => ({ success: true, percent }),
  getAudioMotionCueProbabilityPercent: async () => ({ success: true, percent: 50 }),
  setAudioMotionCueProbabilityPercent: async (percent) => ({ success: true, percent }),
  getRb3MotionCueProbabilityPercent: async () => ({ success: true, percent: 50 }),
  setRb3MotionCueProbabilityPercent: async (percent) => ({ success: true, percent }),
  getRb3MotionCueMinHoldMs: async () => ({ success: true, minHoldMs: 5000 }),
  setRb3MotionCueMinHoldMs: async (minHoldMs) => ({ success: true, minHoldMs }),
  getRb3MotionCueDuration: async () => ({ success: true, min: 5, max: 20 }),
  setRb3MotionCueDuration: async (range) => ({ success: true, ...range }),
  getCueGroupSelectionMode: async () => ({ success: true, mode: 'withinSong' }),
  setCueGroupSelectionMode: async (mode) => ({ success: true, mode }),
  getRb3CueGroupSelectionMode: async () => ({ success: true, mode: 'withinSong' }),
  setRb3CueGroupSelectionMode: async (mode) => ({ success: true, mode }),
  getYargMotionGroupSelectionMode: async () => ({ success: true, mode: 'perCueChange' }),
  setYargMotionGroupSelectionMode: async (mode) => ({ success: true, mode }),
  getAudioMotionGroupSelectionMode: async () => ({ success: true, mode: 'perCueChange' }),
  setAudioMotionGroupSelectionMode: async (mode) => ({ success: true, mode }),
  getRb3MotionGroupSelectionMode: async () => ({ success: true, mode: 'perCueChange' }),
  setRb3MotionGroupSelectionMode: async (mode) => ({ success: true, mode }),
  getYargMotionCueGroups: async () => [],
  getAudioMotionCueGroups: async () => [],
  getAvailableYargMotionCues: async () => [],
  getAvailableAudioMotionCues: async () => [],
  getAvailableRb3MotionCues: async () => [],
  startYargMotionCueSimulation: async () => accepted,
  startAudioMotionCueSimulation: async () => accepted,
  startRb3MotionCueSimulation: async () => accepted,
  stopMotionCueSimulation: async () => accepted,
  getConsistencyStatus: async () => ({ success: true, status: null }),
  getCueGroups: async () => [],
  getEnabledCueGroups: async () => [],
  setEnabledCueGroups: async () => accepted,
  getCueSourceGroup: async (cueType) => refused(`No state found for cue: ${cueType}`),
  getAvailableCues: async () => [],
  getAudioCueGroups: async () => [],
  getAvailableAudioCues: async () => [],
  getAvailableRb3Cues: async () => [],

  // Node cue and effect files
  setNodeCueDebug: async (enabled) => ({ success: true, enabled }),
  listNodeCueFiles: async () => ({ yarg: [], audio: [], rb3: [] }),
  reloadNodeCueFiles: async () => ({ loaded: 0, failed: 0, errors: [], migrations: [] }),
  readNodeCueFile: async (filePath) => {
    throw new Error(`No node cue file at ${filePath}`)
  },
  saveNodeCueFile: async ({ filename }) => ({ success: true, path: filename }),
  deleteNodeCueFile: async (filePath) => ({ success: true, path: filePath }),
  validateNodeCue: async ({ path, content }) =>
    content
      ? { valid: true, data: content, errors: [], mode: content.mode }
      : { valid: false, errors: [`No node cue file at ${path}`] },
  getNodeCueTypes: async () => [],
  pickNodeCueImportFile: async () => dismissed('import'),
  exportNodeCueFile: async (filePath) => exportedPath(filePath),
  listEffectFiles: async () => ({ yarg: [], audio: [] }),
  reloadEffectFiles: async () => ({ loaded: 0, failed: 0, errors: [], migrations: [] }),
  readEffectFile: async (filePath) => {
    throw new Error(`No effect file at ${filePath}`)
  },
  saveEffectFile: async ({ filename }) => ({ success: true, path: filename }),
  deleteEffectFile: async (filePath) => ({ success: true, path: filePath }),
  validateEffect: async ({ path, content }) =>
    content
      ? { valid: true, data: content, errors: [], mode: content.mode }
      : { valid: false, errors: [`No effect file at ${path}`] },
  pickEffectImportFile: async () => dismissed('import'),
  exportEffectFile: async (filePath) => exportedPath(filePath),

  // Direct lighting control
  getRunningMotionCue: async () => ({ ref: null, source: 'cleared', manualFallback: false }),
  getStageKitPriority: async () => 'random',
  setStageKitPriority: async () => accepted,
  getClockRate: async () => ({ success: true, clockRate: DEFAULT_PREFERENCES.clockRate }),
  setClockRate: async () => accepted,
  getMasterOutput: async () => MASTER_OUTPUT,
  setMasterOutput: async (update) => ({ success: true, state: { ...MASTER_OUTPUT, ...update } }),
  enableConsole: async () => accepted,
  disableConsole: async () => accepted,
  sendConsoleDmx: () => {},
  setConsoleFixtureConfig: async () => accepted,

  // Game listeners
  getRb3Mode: async () => 'cue',
  getRb3Stats: async () => null,
  enableYarg: () => {},
  disableYarg: () => {},
  enableRb3: () => {},
  disableRb3: () => {},
  setListenCueData: () => {},
  setCueStyle: () => {},

  // Senders
  getNetworkInterfaces: async () => ({ success: true, interfaces: [] }),
  updateSacnConfig: async () => accepted,
  updateArtNetConfig: async () => accepted,
  updateEnttecConfig: async () => accepted,
  enableSender: async () => accepted,
  disableSender: async () => accepted,

  // Test effects and simulation
  startTestEffect: async () => accepted,
  startRb3TestEffect: async () => accepted,
  setRb3SimLedState: async () => accepted,
  stopTestEffect: async () => true,
  simulatePostProcessing: async () => true,
  simulateBeat: async () => true,
  simulateKeyframe: async () => true,
  simulateMeasure: async () => true,
  simulateInstrumentNote: async () => accepted,
}

function isExport(name: string): name is keyof Api {
  return Object.prototype.hasOwnProperty.call(ANSWERS, name)
}

/** A mock and the step that puts it back to its default answer. */
interface Created {
  fn: unknown
  reset: () => void
}

/** A mock of one export, answering from the table. */
function mockOfExport<K extends keyof Api>(name: K): Created {
  const fn = jest.fn(ANSWERS[name])
  return {
    fn,
    reset: () => {
      fn.mockReset()
      fn.mockImplementation(ANSWERS[name])
    },
  }
}

/** A mock of any other name, such as the module flags Jest's interop reads, with no answer. */
function unlistedMock(): Created {
  const fn = jest.fn()
  return { fn, reset: () => fn.mockReset() }
}

/**
 * Every `ipcApi` export a suite might reach for, as a jest.fn made on first read. Each name yields
 * the same fn every time it is read, which is what lets a suite assert on it.
 */
const created = new Map<string, Created>()

function mockFor(name: string): unknown {
  const existing = created.get(name)
  if (existing) {
    return existing.fn
  }
  const entry = isExport(name) ? mockOfExport(name) : unlistedMock()
  created.set(name, entry)
  return entry.fn
}

export const ipcApiMock = new Proxy({} as Record<string, jest.Mock>, {
  get: (_target, prop: string | symbol) => {
    if (typeof prop !== 'string') {
      return undefined
    }
    return mockFor(prop)
  },
  has: () => true,
  ownKeys: () => [...created.keys()],
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
})

/**
 * Put every mock back to its default answer.
 *
 * The shared setup only clears calls after each test, so an answer one test sets, a
 * `mockResolvedValueOnce` it never consumed included, would carry into the next. A suite calls
 * this in `beforeEach`.
 */
export function resetIpcApiMock(): void {
  for (const entry of created.values()) {
    entry.reset()
  }
}
