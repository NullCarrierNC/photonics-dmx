import { describe, expect, it } from '@jest/globals'
import { getYargEventCategories } from '../../../cues/node/utils/eventUtils'
import { WAIT_CONDITIONS } from '../../../types'

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
