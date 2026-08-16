/**
 * End-to-end render test for the bundled RB3 "Mirror" cue. Drives the compiled cue against a real
 * Sequencer with mock StageKit LED-bank frames and asserts the front row renders its own LEDs while
 * the back row copies its mirrored front partner (ring cell c pairs with 7 - c) and the rear LED
 * data is ignored.
 */
import { createSequencerHarness } from '../helpers/sequencerHarness'
import {
  RB3_LIBRARY_CUE_TYPES,
  createRb3Cue,
  loadRb3CueFile,
  renderFrames,
} from '../helpers/rb3CueFile'

describe('RB3 Mirror cue', () => {
  it('ships only its gameplay cue, leaving strobes to the Stage Kit group', () => {
    const file = loadRb3CueFile('rb3-mirror')
    expect(file.group.id).toBe('rb3-mirror')
    expect(file.cues.flatMap((c) => (c.kind === 'lighting' ? [c.cueType] : []))).toEqual(
      RB3_LIBRARY_CUE_TYPES,
    )
  })

  it('lights a front LED on its own light and on the mirrored back light', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-mirror')

    // LED 1 (bit 0) red: front light 1 and its mirror, back light 8 (the last ring cell).
    renderFrames(h, cue, { red: 0b00000001 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    expect(states[0].red).toBeGreaterThan(0)
    expect(states[7].red).toBeGreaterThan(0)
    expect(states[7].intensity).toBe(states[0].intensity)
    for (const i of [1, 2, 3, 4, 5, 6]) {
      expect(states[i].intensity).toBe(0)
    }
    h.cleanup()
  })

  it('mirrors the inner pair (LED 4 lights ring cells 3 and 4)', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-mirror')

    renderFrames(h, cue, { green: 0b00001000 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    expect(states[3].green).toBeGreaterThan(0)
    expect(states[4].green).toBeGreaterThan(0)
    for (const i of [0, 1, 2, 5, 6, 7]) {
      expect(states[i].intensity).toBe(0)
    }
    h.cleanup()
  })

  it('ignores the rear LED data entirely', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-mirror')

    renderFrames(h, cue, { blue: 0b11110000 })

    for (const id of h.allLightIds) {
      expect(h.getLightState(id)!.intensity).toBe(0)
    }
    h.cleanup()
  })

  it('blends overlapping banks additively on both lights of a pair', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-mirror')

    renderFrames(h, cue, { red: 0b00000001, blue: 0b00000001 })

    for (const index of [0, 7]) {
      const s = h.getLightState(h.allLightIds[index])!
      expect(s.red).toBeGreaterThan(0)
      expect(s.blue).toBeGreaterThan(0)
      expect(s.green).toBe(0)
    }
    h.cleanup()
  })

  it('holds a lit cell across keepalives and clears it when the LED turns off', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-mirror')

    renderFrames(h, cue, { red: 0b00000001 }, 3)
    let everDark = false
    for (let k = 0; k < 8; k++) {
      renderFrames(h, cue, { red: 0b00000001 }, 1)
      if (h.getLightState(h.allLightIds[0])!.red === 0) everDark = true
    }
    expect(everDark).toBe(false)

    renderFrames(h, cue, {})
    expect(h.getLightState(h.allLightIds[0])!.intensity).toBe(0)
    expect(h.getLightState(h.allLightIds[7])!.intensity).toBe(0)
    h.cleanup()
  })

  it('folds onto a 4-light rig without leaving a cell dark', () => {
    const h = createSequencerHarness({ frontCount: 2, backCount: 2 })
    const cue = createRb3Cue('rb3-mirror')

    // Ring cells 0 and 7 both read LED 1 and fold onto lights 1 and 4 of the smaller rig.
    renderFrames(h, cue, { red: 0b00000001 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    expect(states[0].red).toBeGreaterThan(0)
    expect(states[3].red).toBeGreaterThan(0)
    h.cleanup()
  })
})
