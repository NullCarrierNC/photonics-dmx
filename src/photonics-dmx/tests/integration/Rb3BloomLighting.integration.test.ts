/**
 * End-to-end render test for the bundled RB3 "Bloom" cue. Asserts the three density treatments: a
 * sparse bank punches brighter and glows onto its ring neighbours, a mid-count bank renders as
 * plain Stage Kit, and a dense bank floods the whole rig in its colour.
 */
import { createSequencerHarness } from '../helpers/sequencerHarness'
import {
  RB3_LIBRARY_CUE_TYPES,
  createRb3Cue,
  loadRb3CueFile,
  renderFrames,
} from '../helpers/rb3CueFile'

describe('RB3 Bloom cue', () => {
  it('ships only its gameplay cue, leaving strobes to the Stage Kit group', () => {
    const file = loadRb3CueFile('rb3-bloom')
    expect(file.group.id).toBe('rb3-bloom')
    expect(file.cues.flatMap((c) => (c.kind === 'lighting' ? [c.cueType] : []))).toEqual(
      RB3_LIBRARY_CUE_TYPES,
    )
  })

  it('punches a lone LED and glows onto its ring neighbours', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-bloom')

    renderFrames(h, cue, { red: 0b00000001 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    // Cell 0 is the head; cells 1 and 7 are its ring neighbours and take the low glow.
    expect(states[0].red).toBeGreaterThan(0)
    for (const i of [1, 7]) {
      expect(states[i].red).toBeGreaterThan(0)
      expect(states[0].intensity).toBeGreaterThan(states[i].intensity)
      expect(states[i].intensity).toBeGreaterThan(0)
    }
    for (const i of [2, 3, 4, 5, 6]) {
      expect(states[i].intensity).toBe(0)
    }
    h.cleanup()
  })

  it('renders a mid-count bank as plain Stage Kit', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-bloom')

    // Four LEDs lit: no sparse glow, no flood, just the faithful dots.
    renderFrames(h, cue, { green: 0b00001111 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    for (const i of [0, 1, 2, 3]) {
      expect(states[i].green).toBeGreaterThan(0)
    }
    for (const i of [4, 5, 6, 7]) {
      expect(states[i].intensity).toBe(0)
    }
    h.cleanup()
  })

  it('floods the whole rig when a bank is dense', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-bloom')

    // Six LEDs lit: the two dark cells still take the flood, the lit ones read brighter.
    renderFrames(h, cue, { blue: 0b00111111 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    for (const s of states) {
      expect(s.blue).toBeGreaterThan(0)
      expect(s.intensity).toBeGreaterThan(0)
    }
    expect(states[0].intensity).toBeGreaterThan(states[6].intensity)
    h.cleanup()
  })

  it('treats each bank independently', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-bloom')

    // Dense red floods everything; a lone blue LED still punches on its own cell.
    renderFrames(h, cue, { red: 0b11111111, blue: 0b00000100 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    for (const s of states) {
      expect(s.red).toBeGreaterThan(0)
    }
    expect(states[2].blue).toBeGreaterThan(0)
    expect(states[5].blue).toBe(0)
    h.cleanup()
  })

  it('goes dark when no LEDs are lit', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-bloom')

    renderFrames(h, cue, { red: 0b00000001 })
    renderFrames(h, cue, {})

    for (const id of h.allLightIds) {
      expect(h.getLightState(id)!.intensity).toBe(0)
    }
    h.cleanup()
  })
})
