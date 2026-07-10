import type {
  AudioEventType,
  NodeCueKind,
  NodeCueMode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { WaitCondition, YargEventType } from '../../../../../photonics-dmx/types'
import {
  AUDIO_EVENT_OPTIONS as AUDIO_EVENTS_BASE,
  YARG_EVENT_OPTIONS as YARG_EVENTS_BASE,
  WAIT_CONDITIONS_WITH_NONE_DELAY,
} from '../../../../../photonics-dmx/constants/options'
import {
  getYargEventCategories,
  getRb3EventCategories,
} from '../../../../../photonics-dmx/cues/node/utils/eventUtils'

const withDefaultLabels = <T extends string>(values: T[]) =>
  values.map((value) => ({ value, label: value }))

const EASING_OPTIONS = [
  'linear',
  'ease',
  'easeIn',
  'easeOut',
  'easeInOut',
  'sinIn',
  'sinOut',
  'sinInOut',
  'quadraticIn',
  'quadraticOut',
  'quadraticInOut',
  'cubicIn',
  'cubicOut',
  'cubicInOut',
] as const

// Event options for EVENT NODES - includes system events (cue-started, cue-called)
const YARG_EVENT_TYPES: YargEventType[] = [...YARG_EVENTS_BASE]
const YARG_EVENT_OPTIONS = withDefaultLabels(YARG_EVENT_TYPES)
const AUDIO_EVENT_LABELS: Partial<Record<AudioEventType, string>> = {
  'cue-started': 'Cue Started (once per lifecycle)',
  'cue-called': 'Cue Called (every call)',
  'beat': 'Beat (audio detected)',
}

const AUDIO_EVENT_OPTIONS = [...withDefaultLabels(AUDIO_EVENTS_BASE)]
  .map((o) => ({
    ...o,
    label: AUDIO_EVENT_LABELS[o.value as AudioEventType] ?? o.label,
  }))
  .sort((a, b) => a.label.localeCompare(b.label))

// Categorized YARG event options - derived from shared constants
const YARG_EVENT_OPTIONS_CATEGORIZED = getYargEventCategories()

// Curated RB3 event options: only the lifecycle events and LED/fog edges the StageKit stream emits.
// The values are all valid YargEventType (RB3 cues compile through the YARG path), so type them as
// such — consumers (addEventNode) expect a narrow event-type value, not a bare string.
const RB3_EVENT_OPTIONS_CATEGORIZED = getRb3EventCategories()
const RB3_EVENT_OPTIONS = RB3_EVENT_OPTIONS_CATEGORIZED.flatMap((c) => c.events).map((e) => ({
  value: e.value as YargEventType,
  label: e.label,
}))

/** Audio analysis only fires discrete beat edges today (no measure/keyframe). */
const AUDIO_ACTION_WAIT_CONDITIONS: WaitCondition[] = ['beat']

// RB3 StageKit LED / fog conditions only fire in RB3 cue mode; tag them so an author of a
// YARG-driven cue sees they won't fire from a normal song.
const RB3_CONDITION = /^(led-[1-8](-off)?|fog-(on|off))$/
const waitLabel = (value: string): string => (RB3_CONDITION.test(value) ? `${value} (RB3)` : value)

// Wait options for ACTION TIMING - song events only (no system events)
const ACTION_WAIT_CONDITIONS: WaitCondition[] = [...WAIT_CONDITIONS_WITH_NONE_DELAY]
const ACTION_WAIT_OPTIONS_YARG = [
  { value: 'none', label: 'None' },
  { value: 'delay', label: 'Delay' },
  ...ACTION_WAIT_CONDITIONS.filter((c) => c !== 'none' && c !== 'delay').map((value) => ({
    value,
    label: waitLabel(value),
  })),
] as const

const ACTION_WAIT_OPTIONS_AUDIO = [
  { value: 'none', label: 'None' },
  { value: 'delay', label: 'Delay' },
  ...withDefaultLabels(AUDIO_ACTION_WAIT_CONDITIONS),
] as const

// RB3 action timing: only the LED/fog edges actually fire under RB3, so the beat/keyframe/instrument
// conditions are omitted (an author picking one would wait forever) and the "(RB3)" suffix is dropped
// (it exists to warn YARG authors; here every listed condition IS an RB3 one).
const ACTION_WAIT_OPTIONS_RB3 = [
  { value: 'none', label: 'None' },
  { value: 'delay', label: 'Delay' },
  ...ACTION_WAIT_CONDITIONS.filter((c) => RB3_CONDITION.test(c)).map((value) => ({
    value,
    label: value,
  })),
] as const

// RB3 cues are YARG-shaped, but the StageKit stream only yields lifecycle + LED/fog events, so rb3
// gets a curated vocabulary rather than the full YARG set; only audio uses a different node shape.
const getActionWaitOptions = (platform: NodeCueMode) =>
  platform === 'audio'
    ? ACTION_WAIT_OPTIONS_AUDIO
    : platform === 'rb3'
      ? ACTION_WAIT_OPTIONS_RB3
      : ACTION_WAIT_OPTIONS_YARG

const getEventOptionsForMode = (platform: NodeCueMode) =>
  platform === 'audio'
    ? AUDIO_EVENT_OPTIONS
    : platform === 'rb3'
      ? RB3_EVENT_OPTIONS_CATEGORIZED
      : YARG_EVENT_OPTIONS_CATEGORIZED

const getDefaultEventOption = (platform: NodeCueMode, kind: NodeCueKind = 'lighting') => {
  if (platform === 'rb3') {
    // beat never fires under RB3; cue-called drives the always-active gameplay mirror.
    const cueCalled = RB3_EVENT_OPTIONS.find((option) => option.value === 'cue-called')
    return cueCalled ?? RB3_EVENT_OPTIONS[0]
  }
  if (platform !== 'audio') {
    const beat = YARG_EVENT_OPTIONS.find((option) => option.value === 'beat')
    return beat ?? YARG_EVENT_OPTIONS[0]
  }
  if (kind === 'motion') {
    const cueStarted = AUDIO_EVENT_OPTIONS.find((option) => option.value === 'cue-started')
    return cueStarted ?? AUDIO_EVENT_OPTIONS[0]
  }
  return AUDIO_EVENT_OPTIONS[0]
}

export {
  ACTION_WAIT_OPTIONS_AUDIO,
  ACTION_WAIT_OPTIONS_YARG,
  ACTION_WAIT_OPTIONS_RB3,
  AUDIO_EVENT_OPTIONS,
  EASING_OPTIONS,
  YARG_EVENT_OPTIONS,
  YARG_EVENT_OPTIONS_CATEGORIZED,
  RB3_EVENT_OPTIONS,
  RB3_EVENT_OPTIONS_CATEGORIZED,
  getEventOptionsForMode,
  getActionWaitOptions,
  getDefaultEventOption,
  withDefaultLabels,
}
