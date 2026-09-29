import { describe, expect, it } from '@jest/globals'
import { FixtureTypes, isMovingHead, type DmxFixture } from '../../types'

describe('isMovingHead', () => {
  it.each([
    [FixtureTypes.RGBMH, true],
    [FixtureTypes.RGB, false],
    [FixtureTypes.STROBE, false],
  ])('reports %s as a moving head: %s', (fixture, expected) => {
    expect(isMovingHead({ fixture } as DmxFixture)).toBe(expected)
  })
})
