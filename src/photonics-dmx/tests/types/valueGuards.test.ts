import { describe, expect, it } from '@jest/globals'
import {
  BLEND_MODE_OPTIONS,
  BRIGHTNESS_OPTIONS,
  COLOR_OPTIONS,
  isBlendMode,
  isBrightness,
  isColor,
  isLightTarget,
  isLocationGroup,
  isWaitCondition,
  LIGHT_TARGET_OPTIONS,
  LOCATION_OPTIONS,
  WAIT_CONDITIONS,
} from '../../types'
import { EasingType, isEasingType } from '../../easing'

const guards: [string, (value: unknown) => boolean, readonly string[]][] = [
  ['isColor', isColor, COLOR_OPTIONS],
  ['isBrightness', isBrightness, BRIGHTNESS_OPTIONS],
  ['isBlendMode', isBlendMode, BLEND_MODE_OPTIONS],
  ['isLocationGroup', isLocationGroup, LOCATION_OPTIONS],
  ['isLightTarget', isLightTarget, LIGHT_TARGET_OPTIONS],
  ['isWaitCondition', isWaitCondition, WAIT_CONDITIONS],
  ['isEasingType', isEasingType, Object.values(EasingType)],
]

describe.each(guards)('%s', (_name, guard, values) => {
  it('accepts every value in its list', () => {
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) {
      expect(guard(value)).toBe(true)
    }
  })

  it('rejects a misspelling, a different case and padding', () => {
    const sample = values[0]
    expect(guard(`${sample}x`)).toBe(false)
    expect(guard(sample.toUpperCase())).toBe(false)
    expect(guard(` ${sample}`)).toBe(false)
  })

  it('rejects anything that is not a string', () => {
    for (const value of [undefined, null, 0, 1, true, [values[0]], { value: values[0] }]) {
      expect(guard(value)).toBe(false)
    }
  })
})
