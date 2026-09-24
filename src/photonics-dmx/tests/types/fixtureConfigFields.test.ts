import { describe, expect, it } from '@jest/globals'
import {
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  FIXTURE_CONFIG_FIELDS,
  isFixtureConfigFlagField,
} from '../../types'

describe('fixture config fields', () => {
  it('lists every config field once', () => {
    expect([...FIXTURE_CONFIG_FIELDS].sort()).toEqual(
      Object.keys(DEFAULT_MOVING_HEAD_FIXTURE_CONFIG).sort(),
    )
  })

  it('treats exactly the boolean fields as flags', () => {
    for (const key of FIXTURE_CONFIG_FIELDS) {
      expect(isFixtureConfigFlagField(key)).toBe(
        typeof DEFAULT_MOVING_HEAD_FIXTURE_CONFIG[key] === 'boolean',
      )
    }
  })
})
