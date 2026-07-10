import { describe, expect, it } from '@jest/globals'
import {
  ACTION_WAIT_OPTIONS_AUDIO,
  ACTION_WAIT_OPTIONS_RB3,
  RB3_EVENT_OPTIONS,
  RB3_EVENT_OPTIONS_CATEGORIZED,
  getActionWaitOptions,
  getEventOptionsForMode,
  getDefaultEventOption,
} from './options'

describe('cue-editor action wait options (audio)', () => {
  it('exposes only none, delay, and beat for audio mode', () => {
    expect(ACTION_WAIT_OPTIONS_AUDIO.map((o) => o.value)).toEqual(['none', 'delay', 'beat'])
  })
})

describe('cue-editor options routing for rb3 (curated StageKit vocabulary)', () => {
  it('gives rb3 its curated event set, not the full YARG set', () => {
    expect(getEventOptionsForMode('rb3')).toBe(RB3_EVENT_OPTIONS_CATEGORIZED)
    const values = RB3_EVENT_OPTIONS.map((o) => o.value)
    expect(values).toEqual([
      'cue-started',
      'cue-called',
      'led-1',
      'led-2',
      'led-3',
      'led-4',
      'led-5',
      'led-6',
      'led-7',
      'led-8',
      'led-1-off',
      'led-2-off',
      'led-3-off',
      'led-4-off',
      'led-5-off',
      'led-6-off',
      'led-7-off',
      'led-8-off',
      'fog-on',
      'fog-off',
    ])
  })

  it('exposes only none, delay, and the LED/fog wait conditions (unsuffixed) for rb3 timing', () => {
    expect(getActionWaitOptions('rb3')).toBe(ACTION_WAIT_OPTIONS_RB3)
    const values = ACTION_WAIT_OPTIONS_RB3.map((o) => o.value)
    expect(values.slice(0, 2)).toEqual(['none', 'delay'])
    expect(values).toContain('led-1')
    expect(values).toContain('fog-on')
    // No beat/measure/instrument conditions (they never fire under RB3).
    expect(values).not.toContain('beat')
    expect(values).not.toContain('measure')
    // The "(RB3)" warning suffix is dropped in rb3 mode (every condition IS an RB3 one).
    expect(ACTION_WAIT_OPTIONS_RB3.every((o) => !o.label.includes('(RB3)'))).toBe(true)
  })

  it('defaults an rb3 event node to cue-called (beat never fires under RB3)', () => {
    expect(getDefaultEventOption('rb3').value).toBe('cue-called')
  })
})
