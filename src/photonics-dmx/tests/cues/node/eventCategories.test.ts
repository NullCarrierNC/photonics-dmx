import { describe, expect, it } from '@jest/globals'
import { getYargEventCategories, getRb3EventCategories } from '../../../cues/node/utils/eventUtils'
import { YARG_EVENT_TYPES } from '../../../types'

describe('getYargEventCategories', () => {
  it('excludes the RB3 StageKit LED/fog events (they never fire under YARG)', () => {
    const categories = getYargEventCategories()
    expect(categories.find((c) => c.category === 'RB3 StageKit')).toBeUndefined()
    const values = categories.flatMap((c) => c.events.map((e) => e.value))
    for (let i = 1; i <= 8; i++) {
      expect(values).not.toContain(`led-${i}`)
      expect(values).not.toContain(`led-${i}-off`)
    }
    expect(values).not.toContain('fog-on')
    expect(values).not.toContain('fog-off')
  })

  it('only lists events that are valid YARG event types', () => {
    const values = getYargEventCategories().flatMap((c) => c.events.map((e) => e.value))
    for (const v of values) {
      expect(YARG_EVENT_TYPES as readonly string[]).toContain(v)
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
