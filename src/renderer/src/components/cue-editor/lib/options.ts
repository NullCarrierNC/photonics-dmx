import type { NodeCueMode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { WaitCondition, YargEventType } from '../../../../../photonics-dmx/types';
import {
  AUDIO_EVENT_OPTIONS as AUDIO_EVENTS_BASE,
  YARG_EVENT_OPTIONS as YARG_EVENTS_BASE,
  WAIT_CONDITIONS_WITH_NONE_DELAY
} from '../../../../../photonics-dmx/constants/options';
import { getYargEventCategories } from '../../../../../photonics-dmx/cues/node/utils/eventUtils';

const withDefaultLabels = <T extends string>(values: T[]) =>
  values.map(value => ({ value, label: value }));

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
  'cubicInOut'
] as const;

// Event options for EVENT NODES - includes system events (cue-started, cue-called)
const YARG_EVENT_TYPES: YargEventType[] = [...YARG_EVENTS_BASE];
const YARG_EVENT_OPTIONS = withDefaultLabels(YARG_EVENT_TYPES);
const AUDIO_EVENT_OPTIONS = withDefaultLabels(AUDIO_EVENTS_BASE);

// Categorized YARG event options - derived from shared constants
const YARG_EVENT_OPTIONS_CATEGORIZED = getYargEventCategories();

// Wait options for ACTION TIMING - song events only (no system events)
const ACTION_WAIT_CONDITIONS: WaitCondition[] = [...WAIT_CONDITIONS_WITH_NONE_DELAY];
const ACTION_WAIT_OPTIONS_YARG = [
  { value: 'none', label: 'None' },
  { value: 'delay', label: 'Delay' },
  ...withDefaultLabels(ACTION_WAIT_CONDITIONS.filter(c => c !== 'none' && c !== 'delay'))
] as const;

const ACTION_WAIT_OPTIONS_AUDIO = [
  { value: 'none', label: 'None' },
  { value: 'delay', label: 'Delay' },
  ...withDefaultLabels(AUDIO_EVENTS_BASE)
] as const;

const getActionWaitOptions = (mode: NodeCueMode) =>
  mode === 'yarg' ? ACTION_WAIT_OPTIONS_YARG : ACTION_WAIT_OPTIONS_AUDIO;

const getEventOptionsForMode = (mode: NodeCueMode) =>
  mode === 'yarg' ? YARG_EVENT_OPTIONS_CATEGORIZED : AUDIO_EVENT_OPTIONS;

const getDefaultEventOption = (mode: NodeCueMode) => {
  if (mode === 'yarg') {
    const beat = YARG_EVENT_OPTIONS.find(option => option.value === 'beat');
    return beat ?? YARG_EVENT_OPTIONS[0];
  }
  return AUDIO_EVENT_OPTIONS[0];
};

export {
  ACTION_WAIT_OPTIONS_AUDIO,
  ACTION_WAIT_OPTIONS_YARG,
  AUDIO_EVENT_OPTIONS,
  EASING_OPTIONS,
  YARG_EVENT_OPTIONS,
  YARG_EVENT_OPTIONS_CATEGORIZED,
  getEventOptionsForMode,
  getActionWaitOptions,
  getDefaultEventOption,
  withDefaultLabels
};

