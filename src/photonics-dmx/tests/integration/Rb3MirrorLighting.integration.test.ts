/**
 * End-to-end render test for the bundled RB3 "Mirror" cue. Drives the compiled cue against a real
 * Sequencer with mock StageKit LED-bank frames and asserts the ring folds onto four columns: the
 * back row copies its mirrored front partner (ring cell c pairs with 7 - c), LEDs 1-4 run across
 * the columns left to right, and LEDs 5-8 run back across them right to left.
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

  it('runs LEDs 5-8 back across the columns right to left', () => {
    const cue = createRb3Cue('rb3-mirror')

    // LED 5 (bit 4) takes the rightmost column: front light 4 and the back light behind it.
    const right = createSequencerHarness()
    renderFrames(right, cue, { blue: 0b00010000 })
    const rightStates = right.allLightIds.map((id) => right.getLightState(id)!)
    expect(rightStates[3].blue).toBeGreaterThan(0)
    expect(rightStates[4].blue).toBeGreaterThan(0)
    for (const i of [0, 1, 2, 5, 6, 7]) {
      expect(rightStates[i].intensity).toBe(0)
    }
    right.cleanup()

    // LED 8 (bit 7) takes the leftmost column, the opposite end from LED 5.
    const left = createSequencerHarness()
    renderFrames(left, cue, { blue: 0b10000000 })
    const leftStates = left.allLightIds.map((id) => left.getLightState(id)!)
    expect(leftStates[0].blue).toBeGreaterThan(0)
    expect(leftStates[7].blue).toBeGreaterThan(0)
    for (const i of [1, 2, 3, 4, 5, 6]) {
      expect(leftStates[i].intensity).toBe(0)
    }
    left.cleanup()
  })

  it('lights a column once when both of its LEDs are on', () => {
    const cue = createRb3Cue('rb3-mirror')

    // Column 1 carries LED 1 and LED 8. Lighting both must read the same as lighting one, not
    // stack into a brighter dot.
    const one = createSequencerHarness()
    renderFrames(one, cue, { red: 0b00000001 })
    const alone = one.getLightState(one.allLightIds[0])!.intensity
    one.cleanup()

    const both = createSequencerHarness()
    renderFrames(both, cue, { red: 0b10000001 })
    const states = both.allLightIds.map((id) => both.getLightState(id)!)
    expect(states[0].intensity).toBe(alone)
    expect(states[7].intensity).toBe(alone)
    for (const i of [1, 2, 3, 4, 5, 6]) {
      expect(states[i].intensity).toBe(0)
    }
    both.cleanup()
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
