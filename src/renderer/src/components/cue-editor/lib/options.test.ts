import { describe, expect, it } from '@jest/globals'
import { ACTION_WAIT_OPTIONS_AUDIO } from './options'

describe('cue-editor action wait options (audio)', () => {
  it('exposes only none, delay, and beat for audio mode', () => {
    expect(ACTION_WAIT_OPTIONS_AUDIO.map((o) => o.value)).toEqual(['none', 'delay', 'beat'])
  })
})
