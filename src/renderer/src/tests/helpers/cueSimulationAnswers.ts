import { CONFIG, LIFECYCLE, LIGHT } from '../../../../shared/ipcChannels'
import { CueType } from '../../../../photonics-dmx/cues/types/cueTypes'
import {
  DEFAULT_PREFERENCES,
  type AppPreferences,
} from '../../../../services/configuration/configurationDefaults'
import type { WindowApiAnswers } from './windowApiStub'

export type SimulationSettings = NonNullable<AppPreferences['simulationSettings']>

export type CueGroupListing = { id: string; name: string; description: string; cueTypes: CueType[] }

/** A cue group listing one Verse cue. */
export function verseGroup(id: string, name: string): CueGroupListing {
  return { id, name, description: '', cueTypes: [CueType.Verse] }
}

/**
 * What main answers on every channel the Cue Simulation page and its children invoke, as on a
 * running app with default preferences, no rigs and no cue groups. A suite replaces an entry to
 * set up what it checks.
 */
export function cueSimulationAnswers(): WindowApiAnswers {
  return {
    [LIFECYCLE.GET_PHASE]: () => 'running',
    [CONFIG.GET_PREFS]: () => DEFAULT_PREFERENCES,
    [CONFIG.SAVE_PREFS]: () => ({ success: true }),
    [CONFIG.GET_ACTIVE_RIGS]: () => [],
    [CONFIG.GET_ENABLED_CUE_GROUPS]: () => [],
    [CONFIG.GET_MOTION_ENABLED]: () => false,
    [LIGHT.GET_CUE_GROUPS]: () => [],
    [LIGHT.GET_AVAILABLE_CUES]: () => [],
    [LIGHT.GET_YARG_MOTION_CUE_GROUPS]: () => [],
    [LIGHT.STOP_TEST_EFFECT]: () => true,
    [LIGHT.STOP_MOTION_CUE_SIMULATION]: () => ({ success: true }),
    [LIGHT.SIMULATE_BEAT]: () => true,
    [LIGHT.SIMULATE_MEASURE]: () => true,
    [LIGHT.SIMULATE_KEYFRAME]: () => true,
    [LIGHT.SIMULATE_POST_PROCESSING]: () => true,
  }
}

/** Lists `groups` as loaded and enabled. */
export function listingGroups(answers: WindowApiAnswers, groups: CueGroupListing[]): void {
  answers[LIGHT.GET_CUE_GROUPS] = () => groups
  answers[CONFIG.GET_ENABLED_CUE_GROUPS] = () => groups.map((group) => group.id)
}

/** Offers the Verse cue in whichever group the page asks about. */
export function offeringVerse(answers: WindowApiAnswers): void {
  answers[LIGHT.GET_AVAILABLE_CUES] = () => [
    { id: CueType.Verse, yargDescription: 'Verse', rb3Description: '', groupName: '' },
  ]
}

/** Answers the stored preferences with `settings` as the last simulation. */
export function storingSettings(answers: WindowApiAnswers, settings: SimulationSettings): void {
  answers[CONFIG.GET_PREFS] = () => ({ ...DEFAULT_PREFERENCES, simulationSettings: settings })
}
