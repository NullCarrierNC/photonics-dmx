import { describe, expect, it } from '@jest/globals'
import {
  YARG_CUE_DATA_PROPERTY_META,
  RB3_CUE_DATA_PROPERTY_META,
  getNetCueDataPropertyMeta,
} from '../../constants/cueDataPropertyMeta'

const isLedId = (id: string) => /^led-/.test(id)

describe('cue-data property vocabulary separation', () => {
  it('the YARG dropdown list exposes no LED/StageKit properties', () => {
    expect(YARG_CUE_DATA_PROPERTY_META.some((m) => isLedId(m.id))).toBe(false)
  })

  it('the RB3 dropdown list exposes the LED masks but none of the YARG-song properties', () => {
    const ids = RB3_CUE_DATA_PROPERTY_META.map((m) => m.id)
    expect(ids).toContain('led-red-states')
    expect(ids).toContain('led-1-on')
    expect(ids).toContain('strobe-state')
    // YARG-song properties never populate under an RB3 frame.
    for (const yargOnly of [
      'bpm',
      'beat-duration-ms',
      'song-section',
      'beat-type',
      'keyframe',
      'venue-size',
      'guitar-note-count',
      'total-score',
      'performer',
      'bonus-effect',
    ]) {
      expect(ids).not.toContain(yargOnly)
    }
  })

  it('every RB3 property still resolves through the YARG lookup map (union intact)', () => {
    for (const m of RB3_CUE_DATA_PROPERTY_META) {
      expect(getNetCueDataPropertyMeta(m.id)).toBeDefined()
    }
  })
})
