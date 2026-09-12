/**
 * RB3 StageKit LED bank reads: masks, per-position state, and the colour at a position.
 */
import type { CueData } from './cueData'

/**
 * The aggregate RB3 StageKit LED mask: bit i (0..7) set when position i is lit in ANY colour bank.
 * RB3 sends one colour bank per packet, so the cue-mode processor ORs each bank's 8-bit mask into
 * `ledBanks`. This collapses them to "which positions are lit at all", used by the led-N events and
 * the led-states / led-N-on cue-data properties.
 */
export function ledAggregateMask(frame: Partial<CueData> | undefined): number {
  const b = frame?.ledBanks
  if (!b) return 0
  return (b.red | b.green | b.blue | b.yellow) & 0xff
}

/**
 * Whether two frames carry the same StageKit LED state across ALL FOUR colour banks (absent `ledBanks` =
 * all-zero). Stricter than comparing `ledAggregateMask`, which is colour-blind: a position that swaps banks
 * (red→green) leaves the aggregate unchanged but changes a per-bank mask, so this returns false. Used to
 * detect an un-ticked LED/colour edge the aggregate would miss (led-N triggerOnColorChange).
 */
export function ledBanksEqual(
  a: Partial<CueData> | undefined,
  b: Partial<CueData> | undefined,
): boolean {
  const x = a?.ledBanks
  const y = b?.ledBanks
  return (
    ((x?.red ?? 0) & 0xff) === ((y?.red ?? 0) & 0xff) &&
    ((x?.green ?? 0) & 0xff) === ((y?.green ?? 0) & 0xff) &&
    ((x?.blue ?? 0) & 0xff) === ((y?.blue ?? 0) & 0xff) &&
    ((x?.yellow ?? 0) & 0xff) === ((y?.yellow ?? 0) & 0xff)
  )
}

/** Whether LED position `index` (0..7) is lit in any colour bank of `frame`. */
export function isLedOn(frame: Partial<CueData> | undefined, index: number): boolean {
  if (index < 0 || index > 7) return false
  return (ledAggregateMask(frame) & (1 << index)) !== 0
}

/**
 * The set of colour banks lighting LED position `index` (0..7), as a 4-bit nibble
 * (bit0 red, bit1 green, bit2 blue, bit3 yellow), `0` when unlit or `ledBanks` is absent.
 * Used by the led-N `triggerOnColorChange` gate to detect a colour change at a still-lit position.
 */
export function ledBankNibbleAt(frame: Partial<CueData> | undefined, index: number): number {
  const b = frame?.ledBanks
  if (!b || index < 0 || index > 7) return 0
  const bit = 1 << index
  return (
    (b.red & bit ? 1 : 0) |
    (b.green & bit ? 2 : 0) |
    (b.blue & bit ? 4 : 0) |
    (b.yellow & bit ? 8 : 0)
  )
}

/** Bitmask (bit i = position i lit) from a list of LED positions 0..7. Inverse of maskToPositions. */
export function positionsToMask(positions: number[]): number {
  let mask = 0
  for (const p of positions) {
    if (p >= 0 && p < 8) mask |= 1 << p
  }
  return mask
}

/**
 * The colour of LED position `index` (0..7) as a palette name - the per-position analogue of the global
 * `led-color` (which reports only the dominant bank across all positions). Priority red > green > blue >
 * yellow when a position is lit in more than one bank (the rare overlap case), `'transparent'` when unlit,
 * so binding it to a laser/effect colour lets a dark position show through rather than paint black.
 */
export function ledColorAt(
  frame: Partial<CueData> | undefined,
  index: number,
): 'red' | 'green' | 'blue' | 'yellow' | 'transparent' {
  const nibble = ledBankNibbleAt(frame, index)
  if (nibble & 1) return 'red'
  if (nibble & 2) return 'green'
  if (nibble & 4) return 'blue'
  if (nibble & 8) return 'yellow'
  return 'transparent'
}

// Import RB3E types
