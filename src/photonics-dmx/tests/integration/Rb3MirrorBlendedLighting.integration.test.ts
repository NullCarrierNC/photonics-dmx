/**
 * End-to-end render test for the bundled RB3 "Mirror Blended" cue. Asserts the Mirror base look
 * (back row copies its mirrored front partner) plus the rear overlay: each front light also carries
 * its partner's rear LED additively, while the back row stays a plain mirror.
 */
import { createSequencerHarness } from '../helpers/sequencerHarness'
import {
  RB3_LIBRARY_CUE_TYPES,
  createRb3Cue,
  loadRb3CueFile,
  renderFrames,
} from '../helpers/rb3CueFile'

describe('RB3 Mirror Blended cue', () => {
  it('ships only its gameplay cue, leaving strobes to the Stage Kit group', () => {
    const file = loadRb3CueFile('rb3-mirror-blended')
    expect(file.group.id).toBe('rb3-mirror-blended')
    expect(file.cues.flatMap((c) => (c.kind === 'lighting' ? [c.cueType] : []))).toEqual(
      RB3_LIBRARY_CUE_TYPES,
    )
  })

  it('adds the partner rear LED onto the front light only', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-mirror-blended')

    // LED 1 red (front light 1 and its mirror light 8) plus LED 8 blue (front light 1's partner).
    renderFrames(h, cue, { red: 0b00000001, blue: 0b10000000 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    // Front light 1 carries both ends of the ring.
    expect(states[0].red).toBeGreaterThan(0)
    expect(states[0].blue).toBeGreaterThan(0)
    // Back light 8 keeps the plain mirror of LED 1: red only, no rear overlay.
    expect(states[7].red).toBeGreaterThan(0)
    expect(states[7].blue).toBe(0)
    for (const i of [1, 2, 3, 4, 5, 6]) {
      expect(states[i].intensity).toBe(0)
    }
    h.cleanup()
  })

  it('renders rear-only LED data on the matching front light', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-mirror-blended')

    // LED 6 (bit 5) alone: its partner is front light 3 (ring cell 2).
    renderFrames(h, cue, { yellow: 0b00100000 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    expect(states[2].intensity).toBeGreaterThan(0)
    for (const i of [0, 1, 3, 4, 5, 6, 7]) {
      expect(states[i].intensity).toBe(0)
    }
    h.cleanup()
  })

  it('keeps the front row brighter than the back when both ends of a pair are lit', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-mirror-blended')

    // LED 1 and LED 8 both red: front light 1 gets both, back light 8 gets only the mirror.
    renderFrames(h, cue, { red: 0b10000001 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    expect(states[0].intensity).toBeGreaterThan(states[7].intensity)
    expect(states[7].intensity).toBeGreaterThan(0)
    h.cleanup()
  })

  it('clears everything when the LEDs turn off', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-mirror-blended')

    renderFrames(h, cue, { red: 0b10000001 })
    renderFrames(h, cue, {})

    for (const id of h.allLightIds) {
      expect(h.getLightState(id)!.intensity).toBe(0)
    }
    h.cleanup()
  })
})
