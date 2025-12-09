import type { NodeCueMode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { WaitCondition } from '../../../../../photonics-dmx/types';
import {
  AUDIO_EVENT_OPTIONS as AUDIO_EVENTS_BASE,
  BLEND_MODE_OPTIONS,
  BRIGHTNESS_OPTIONS,
  COLOR_OPTIONS,
  LIGHT_TARGET_OPTIONS,
  LOCATION_OPTIONS,
  YARG_EVENT_OPTIONS as YARG_EVENTS_BASE
} from '../../../../../photonics-dmx/constants/options';

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

const ACTION_OPTIONS = ['single-color', 'sweep', 'cycle', 'blackout'] as const;

const YARG_WAIT_CONDITIONS: WaitCondition[] = [...YARG_EVENTS_BASE];
const YARG_EVENT_OPTIONS = withDefaultLabels(YARG_WAIT_CONDITIONS);
const AUDIO_EVENT_OPTIONS = withDefaultLabels(AUDIO_EVENTS_BASE);

const ACTION_WAIT_OPTIONS_YARG = [
  { value: 'none', label: 'None' },
  { value: 'delay', label: 'Delay' },
  ...withDefaultLabels(YARG_WAIT_CONDITIONS)
] as const;

const ACTION_WAIT_OPTIONS_AUDIO = [
  { value: 'none', label: 'None' },
  { value: 'delay', label: 'Delay' },
  ...withDefaultLabels(AUDIO_EVENTS_BASE)
] as const;

const getActionWaitOptions = (mode: NodeCueMode) =>
  mode === 'yarg' ? ACTION_WAIT_OPTIONS_YARG : ACTION_WAIT_OPTIONS_AUDIO;

const getDefaultEventOption = (mode: NodeCueMode) => {
  if (mode === 'yarg') {
    const beat = YARG_EVENT_OPTIONS.find(option => option.value === 'beat');
    return beat ?? YARG_EVENT_OPTIONS[0];
  }
  return AUDIO_EVENT_OPTIONS[0];
};

export {
  ACTION_OPTIONS,
  ACTION_WAIT_OPTIONS_AUDIO,
  ACTION_WAIT_OPTIONS_YARG,
  AUDIO_EVENT_OPTIONS,
  BLEND_MODE_OPTIONS,
  BRIGHTNESS_OPTIONS,
  COLOR_OPTIONS,
  EASING_OPTIONS,
  LIGHT_TARGET_OPTIONS,
  LOCATION_OPTIONS,
  YARG_EVENT_OPTIONS,
  getActionWaitOptions,
  getDefaultEventOption,
  withDefaultLabels
};

