import { describe, expect, it } from '@jest/globals'
import { getYargEventCategories, getRb3EventCategories } from '../../../cues/node/utils/eventUtils'
import { WAIT_CONDITIONS, YARG_EVENT_TYPES } from '../../../types'

describe('getYargEventCategories', () => {
  it('exposes the RB3 StageKit LED/fog events so they are authorable as event nodes', () => {
    const categories = getYargEventCategories()
    const rb3 = categories.find((c) => c.category === 'RB3 StageKit')
    expect(rb3).toBeDefined()
    const values = rb3!.events.map((e) => e.value)
    // All 8 on-edges, 8 off-edges, and both fog edges are present.
    for (let i = 1; i <= 8; i++) {
      expect(values).toContain(`led-${i}`)
      expect(values).toContain(`led-${i}-off`)
    }
    expect(values).toContain('fog-on')
    expect(values).toContain('fog-off')
  })

  it('only lists events that are valid wait conditions', () => {
    const rb3 = getYargEventCategories().find((c) => c.category === 'RB3 StageKit')!
    for (const e of rb3.events) {
      expect(WAIT_CONDITIONS as readonly string[]).toContain(e.value)
    }
  })
})

describe('getRb3EventCategories', () => {
  it('curates exactly the lifecycle events plus the StageKit LED/fog edges', () => {
    const values = getRb3EventCategories().flatMap((c) => c.events.map((e) => e.value))
    const expected = [
      'cue-started',
      'cue-called',
      ...Array.from({ length: 8 }, (_, i) => `led-${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `led-${i + 1}-off`),
      'fog-on',
      'fog-off',
    ]
    expect(values).toEqual(expected)
  })

  it('lists only valid YARG event types (RB3 cues compile through the YARG path)', () => {
    const values = getRb3EventCategories().flatMap((c) => c.events.map((e) => e.value))
    for (const v of values) {
      expect(YARG_EVENT_TYPES as readonly string[]).toContain(v)
    }
  })

  it('omits the YARG-only events that never fire under RB3', () => {
    const values = getRb3EventCategories().flatMap((c) => c.events.map((e) => e.value))
    expect(values).not.toContain('beat')
    expect(values).not.toContain('measure')
    expect(values).not.toContain('guitar-green')
  })
})
