import type { Color } from '../../../photonics-dmx/types'
import { DEFAULT_AUDIO_BANDS } from '../../../photonics-dmx/listeners/Audio/AudioConfig'

/**
 * Fixed palette for graphic EQ bands (by index, 8 bands) — same order as
 * {@link DEFAULT_AUDIO_BANDS} / CuePreviewAudio.
 */
export const EQ_BAND_COLORS: Color[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'purple',
  'magenta',
]

const EQ_COLOR_HEX: Partial<Record<Color, string>> = {
  red: '#ff0000',
  orange: '#ff7f00',
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  blue: '#0000ff',
  purple: '#800080',
  magenta: '#ff00ff',
  white: '#ffffff',
}

/** Which default EQ band index (0–7) best matches a trigger Hz range (by centre frequency). */
export function eqBandIndexForTriggerHzRange(minHz: number, maxHz: number): number {
  const bands = DEFAULT_AUDIO_BANDS
  const c = (minHz + maxHz) / 2
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]!
    if (c >= b.minHz && c <= b.maxHz) return i
  }
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < bands.length; i++) {
    const bc = (bands[i]!.minHz + bands[i]!.maxHz) / 2
    const d = Math.abs(c - bc)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

export function triggerHzRangeToEqBandColorHex(minHz: number, maxHz: number): string {
  const idx = eqBandIndexForTriggerHzRange(minHz, maxHz)
  const color = EQ_BAND_COLORS[idx] ?? 'white'
  return EQ_COLOR_HEX[color] ?? '#ffffff'
}

export function normalizeHexForCompare(hex: string): string {
  const h = hex.trim().toLowerCase()
  if (h.length === 4 && h.startsWith('#')) {
    return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`
  }
  return h
}

/** Hex colour for a trigger preset range, aligned with the graphic EQ band palette. */
export function getInstrumentPresetEqBandColorHex(preset: {
  frequencyRange: { minHz: number; maxHz: number }
}): string {
  return triggerHzRangeToEqBandColorHex(preset.frequencyRange.minHz, preset.frequencyRange.maxHz)
}
