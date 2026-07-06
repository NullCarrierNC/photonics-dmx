import { describe, expect, it } from '@jest/globals'
import {
  ACTION_WAIT_OPTIONS_AUDIO,
  ACTION_WAIT_OPTIONS_YARG,
  YARG_EVENT_OPTIONS_CATEGORIZED,
  getActionWaitOptions,
  getEventOptionsForMode,
  getDefaultEventOption,
} from './options'

describe('cue-editor action wait options (audio)', () => {
  it('exposes only none, delay, and beat for audio mode', () => {
    expect(ACTION_WAIT_OPTIONS_AUDIO.map((o) => o.value)).toEqual(['none', 'delay', 'beat'])
  })
})

describe('cue-editor options routing for rb3 (YARG-shaped)', () => {
  it('routes rb3 wait/event option sets to the YARG sets', () => {
    expect(getActionWaitOptions('rb3')).toBe(ACTION_WAIT_OPTIONS_YARG)
    expect(getEventOptionsForMode('rb3')).toBe(YARG_EVENT_OPTIONS_CATEGORIZED)
  })

  it('gives rb3 the YARG default event (beat), not the audio default', () => {
    expect(getDefaultEventOption('rb3')).toEqual(getDefaultEventOption('yarg'))
    expect(getDefaultEventOption('rb3').value).toBe('beat')
  })
})
