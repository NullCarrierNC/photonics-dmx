/**
 * End-to-end render test for the bundled RB3 "Glow" cue. Asserts every lit LED keeps its faithful
 * Stage Kit light and spills a dimmer halo of the same colour onto its two ring neighbours, that
 * the halo wraps the ring, and that a lit cell never takes a halo itself.
 */
import { createSequencerHarness } from '../helpers/sequencerHarness'
import {
  RB3_LIBRARY_CUE_TYPES,
  createRb3Cue,
  loadRb3CueFile,
  renderFrames,
} from '../helpers/rb3CueFile'

describe('RB3 Glow cue', () => {
  it('ships only its gameplay cue, leaving strobes to the Stage Kit group', () => {
    const file = loadRb3CueFile('rb3-glow')
    expect(file.group.id).toBe('rb3-glow')
    expect(file.cues.flatMap((c) => (c.kind === 'lighting' ? [c.cueType] : []))).toEqual(
      RB3_LIBRARY_CUE_TYPES,
    )
  })

  it('spills a dimmer halo of the same colour onto both ring neighbours', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-glow')

    // LED 3 (bit 2) lit: neighbours are cells 1 and 3.
    renderFrames(h, cue, { red: 0b00000100 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    expect(states[2].red).toBeGreaterThan(0)
    for (const i of [1, 3]) {
      expect(states[i].red).toBeGreaterThan(0)
      expect(states[i].green).toBe(0)
      expect(states[i].blue).toBe(0)
      expect(states[i].intensity).toBeGreaterThan(0)
      expect(states[2].intensity).toBeGreaterThan(states[i].intensity)
    }
    for (const i of [0, 4, 5, 6, 7]) {
      expect(states[i].intensity).toBe(0)
    }
    h.cleanup()
  })

  it('wraps the halo around the ring', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-glow')

    // LED 1 (cell 0): the neighbour below wraps to cell 7, the last light on the rig.
    renderFrames(h, cue, { yellow: 0b00000001 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    expect(states[7].intensity).toBeGreaterThan(0)
    expect(states[1].intensity).toBeGreaterThan(0)
    expect(states[0].intensity).toBeGreaterThan(states[7].intensity)
    h.cleanup()
  })

  it('leaves a solid fill untouched', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-glow')

    renderFrames(h, cue, { blue: 0b11111111 })

    // Every cell is lit, so no cell takes a halo and they all read at the same dot level.
    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    const first = states[0].intensity
    expect(first).toBeGreaterThan(0)
    for (const s of states) {
      expect(s.blue).toBeGreaterThan(0)
      expect(s.intensity).toBe(first)
    }
    h.cleanup()
  })

  it('mixes halos from two banks the way the dots mix', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-glow')

    // Red on cell 0 and blue on cell 2 both glow onto cell 1.
    renderFrames(h, cue, { red: 0b00000001, blue: 0b00000100 })

    const s = h.getLightState(h.allLightIds[1])!
    expect(s.red).toBeGreaterThan(0)
    expect(s.blue).toBeGreaterThan(0)
    h.cleanup()
  })

  it('goes dark when no LEDs are lit', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-glow')

    renderFrames(h, cue, { red: 0b00000001 })
    renderFrames(h, cue, {})

    for (const id of h.allLightIds) {
      expect(h.getLightState(id)!.intensity).toBe(0)
    }
    h.cleanup()
  })
})
