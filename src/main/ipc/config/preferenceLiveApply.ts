import type { DmxPublisher } from '../../../photonics-dmx/controllers/DmxPublisher'
import type { MasterOutputState } from '../../../photonics-dmx/controllers/MasterOutputState'
import type { VenueFrameProcessor } from '../../../photonics-dmx/controllers/VenueFrameProcessor'
import type { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'
import type { AppPreferences } from '../../../services/configuration/configurationDefaults'
import {
  normalizeBlackoutShortcutKey,
  normalizeBlackoutShortcutScope,
} from '../../../services/configuration/configurationDefaults'
import type { BlackoutShortcutBinding } from '../../../shared/blackoutShortcut'
import { setGlobalBrightnessConfig } from '../../../photonics-dmx/helpers/dmxHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { sendToAllWindows } from '../../utils/windowUtils'

/** The parts of ControllerManager a live apply reaches. */
export interface LiveApplyTargets {
  getConfig(): Pick<ConfigurationManager, 'getAllPreferences'>
  getDmxPublisher(): Pick<
    DmxPublisher,
    'setOutputRateHz' | 'setWhiteChannelMixMode' | 'refreshOutput'
  > | null
  getVenueFrameProcessor(): Pick<VenueFrameProcessor, 'setVenuePostProcessingEnabled'>
  getMasterOutput(): Pick<MasterOutputState, 'setDimmerPercent' | 'setStrobeOutputEnabled'>
}

export interface LiveApplyContext {
  controllerManager: LiveApplyTargets
  /** Rebinds the application's system-wide blackout shortcut. */
  onBlackoutShortcutChanged: (binding: BlackoutShortcutBinding) => void
}

/**
 * Brings the running app in line with a SAVE_PREFS write. Runs once per save, after the write,
 * with the save's payload, however many of its keys the payload carries.
 */
type LiveApply = (saved: Partial<AppPreferences>, ctx: LiveApplyContext) => void

/**
 * A preference the running app reads where it uses it, applies through a channel of its own, or
 * picks up at the next controller restart, so a SAVE_PREFS write has nothing more to do.
 */
export const PERSIST_ONLY = 'persistOnly'

const applyBrightness: LiveApply = (_saved, { controllerManager }) => {
  const brightnessConfig = controllerManager.getConfig().getAllPreferences().brightness
  if (brightnessConfig) {
    setGlobalBrightnessConfig(brightnessConfig)
  }
}

// The publisher's settings are swapped in place, so the senders and DMX output run on through
// the change.
const applyOutputRate: LiveApply = (saved, { controllerManager }) => {
  if (typeof saved.globalDmxPublishingRateHz === 'number') {
    controllerManager.getDmxPublisher()?.setOutputRateHz(saved.globalDmxPublishingRateHz)
  }
}

const applyWhiteChannelMixMode: LiveApply = (saved, { controllerManager }) => {
  if (typeof saved.whiteChannelMixMode === 'string') {
    controllerManager.getDmxPublisher()?.setWhiteChannelMixMode(saved.whiteChannelMixMode)
  }
}

const applyVenuePostProcessing: LiveApply = (saved, { controllerManager }) => {
  if (typeof saved.venuePostProcessingEnabled === 'boolean') {
    controllerManager
      .getVenueFrameProcessor()
      .setVenuePostProcessingEnabled(saved.venuePostProcessingEnabled)
  }
}

// The persisted half of the master output controls. The sidebar applies them live through
// SET_MASTER_OUTPUT before it saves, and a save from any other writer of these prefs applies here.
const applyMasterOutput: LiveApply = (saved, { controllerManager }) => {
  const master = controllerManager.getMasterOutput()
  if (typeof saved.masterDimmerPercent === 'number') {
    master.setDimmerPercent(saved.masterDimmerPercent)
  }
  if (typeof saved.strobeOutputEnabled === 'boolean') {
    master.setStrobeOutputEnabled(saved.strobeOutputEnabled)
  }
  controllerManager.getDmxPublisher()?.refreshOutput()
}

// Both halves of the blackout shortcut rebind from here: the OS hook in this process, and the
// renderer listener in every window, including the one that just saved. The pair is read back from
// the merged preferences, since a save may carry only one of them.
const applyBlackoutShortcut: LiveApply = (
  _saved,
  { controllerManager, onBlackoutShortcutChanged },
) => {
  const saved = controllerManager.getConfig().getAllPreferences()
  const binding = {
    key: normalizeBlackoutShortcutKey(saved.blackoutShortcutKey),
    scope: normalizeBlackoutShortcutScope(saved.blackoutShortcutScope),
  }
  onBlackoutShortcutChanged(binding)
  sendToAllWindows(RENDERER_RECEIVE.BLACKOUT_SHORTCUT_CHANGED, binding)
}

/**
 * What a SAVE_PREFS write of each preference does to the running app. `Record` over the full key
 * union makes every preference declare one or the other, so one added without an entry fails the
 * compile.
 */
export const PREFERENCE_LIVE_APPLY: Record<keyof AppPreferences, LiveApply | typeof PERSIST_ONLY> =
  {
    brightness: applyBrightness,
    globalDmxPublishingRateHz: applyOutputRate,
    whiteChannelMixMode: applyWhiteChannelMixMode,
    venuePostProcessingEnabled: applyVenuePostProcessing,
    masterDimmerPercent: applyMasterOutput,
    strobeOutputEnabled: applyMasterOutput,
    blackoutShortcutKey: applyBlackoutShortcut,
    blackoutShortcutScope: applyBlackoutShortcut,

    // Read where they are used.
    effectDebounce: PERSIST_ONLY,
    complex: PERSIST_ONLY,
    stageKitPrefs: PERSIST_ONLY,
    rb3Prefs: PERSIST_ONLY,
    allowMultipleActiveRigs: PERSIST_ONLY,
    advancedModeEnabled: PERSIST_ONLY,
    videoLagCompensationMs: PERSIST_ONLY,
    audioLagCompensationMs: PERSIST_ONLY,
    simulationSettings: PERSIST_ONLY,
    leftMenuCollapsed: PERSIST_ONLY,
    windowState: PERSIST_ONLY,
    cueEditorWindowState: PERSIST_ONLY,
    audioPreviewWindowState: PERSIST_ONLY,
    dmxSettingsPrefs: PERSIST_ONLY,
    activeAudioCueType: PERSIST_ONLY,

    // Applied to the running senders through the sender channels.
    enttecProConfig: PERSIST_ONLY,
    openDmxConfig: PERSIST_ONLY,
    artNetConfig: PERSIST_ONLY,
    sacnConfig: PERSIST_ONLY,
    dmxOutputConfig: PERSIST_ONLY,

    // Applied through channels of their own.
    cueDomains: PERSIST_ONLY,
    cueConsistencyWindow: PERSIST_ONLY,
    clockRate: PERSIST_ONLY,
    yargFallbackCueTimeMs: PERSIST_ONLY,
    audioConfig: PERSIST_ONLY,
    audioGameMode: PERSIST_ONLY,
    motionEnabled: PERSIST_ONLY,
  }

/** Runs each live apply the saved keys call for, once, after the write has landed. */
export function applySavedPreferences(saved: Partial<AppPreferences>, ctx: LiveApplyContext): void {
  const applies = new Set<LiveApply>()
  for (const key of Object.keys(saved) as (keyof AppPreferences)[]) {
    const entry = PREFERENCE_LIVE_APPLY[key]
    if (entry !== PERSIST_ONLY && entry !== undefined) {
      applies.add(entry)
    }
  }
  for (const apply of applies) {
    apply(saved, ctx)
  }
}
