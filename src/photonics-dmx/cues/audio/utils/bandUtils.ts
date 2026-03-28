import type { Brightness } from '../../../types'
import { getGlobalBrightnessConfig } from '../../../helpers'

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const DEFAULT_BRIGHTNESS_MAP = {
  low: 40,
  medium: 100,
  high: 180,
  max: 255,
}

const DISCRETE_LEVELS: Brightness[] = ['low', 'medium', 'high', 'max']

/**
 * Map a normalized value (0–1) to an intensity scale.
 * When linearResponse is false, quantizes to discrete brightness steps.
 */
export const getIntensityScale = (value: number, linearResponse: boolean): number => {
  const normalized = clamp01(value)
  if (linearResponse) {
    return normalized
  }

  const step = Math.min(4, Math.floor(normalized * 5))
  if (step === 0) {
    return 0
  }

  const brightnessMap = getGlobalBrightnessConfig() || DEFAULT_BRIGHTNESS_MAP
  const level = DISCRETE_LEVELS[step - 1]
  const maxValue = brightnessMap.max || DEFAULT_BRIGHTNESS_MAP.max
  const levelValue = brightnessMap[level] || DEFAULT_BRIGHTNESS_MAP[level]

  return levelValue / maxValue
}
