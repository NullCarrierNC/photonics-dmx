/**
 * End-to-end render test for the bundled RB3 "Stage Kit Wash" cue. Asserts the faithful Stage Kit
 * lights sit over a dim per-row bed in the colours that row is showing, that the bed never crosses
 * rows, and that an idle frame still goes fully dark.
 */
import { createSequencerHarness } from '../helpers/sequencerHarness'
import {
  RB3_LIBRARY_CUE_TYPES,
  createRb3Cue,
  loadRb3CueFile,
  renderFrames,
} from '../helpers/rb3CueFile'

describe('RB3 Stage Kit Wash cue', () => {
  it('ships only its gameplay cue, leaving strobes to the Stage Kit group', () => {
    const file = loadRb3CueFile('rb3-stagekit-wash')
    expect(file.group.id).toBe('rb3-stagekit-wash')
    expect(file.cues.flatMap((c) => (c.kind === 'lighting' ? [c.cueType] : []))).toEqual(
      RB3_LIBRARY_CUE_TYPES,
    )
  })

  it('washes the rest of the front row behind a single front LED', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-stagekit-wash')

    renderFrames(h, cue, { red: 0b00000001 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    // The lit LED is the brightest thing on the row, and the rest of the row washes in its colour.
    for (const i of [1, 2, 3]) {
      expect(states[i].red).toBeGreaterThan(0)
      expect(states[i].intensity).toBeGreaterThan(0)
      expect(states[0].intensity).toBeGreaterThan(states[i].intensity)
    }
    // The back row has no LEDs lit, so it stays dark.
    for (const i of [4, 5, 6, 7]) {
      expect(states[i].intensity).toBe(0)
    }
    h.cleanup()
  })

  it('washes the back row from back LEDs without touching the front', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-stagekit-wash')

    // LED 5 (bit 4) is the first back-row cell.
    renderFrames(h, cue, { blue: 0b00010000 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    expect(states[4].blue).toBeGreaterThan(0)
    for (const i of [5, 6, 7]) {
      expect(states[i].blue).toBeGreaterThan(0)
      expect(states[4].intensity).toBeGreaterThan(states[i].intensity)
    }
    for (const i of [0, 1, 2, 3]) {
      expect(states[i].intensity).toBe(0)
    }
    h.cleanup()
  })

  it('carries each bank colour into its own row bed', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-stagekit-wash')

    // Red on the front row, blue on the back row.
    renderFrames(h, cue, { red: 0b00000001, blue: 0b00010000 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    expect(states[1].red).toBeGreaterThan(0)
    expect(states[1].blue).toBe(0)
    expect(states[5].blue).toBeGreaterThan(0)
    expect(states[5].red).toBe(0)
    h.cleanup()
  })

  it('goes dark when no LEDs are lit', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-stagekit-wash')

    renderFrames(h, cue, { red: 0b00000001 })
    renderFrames(h, cue, {})

    for (const id of h.allLightIds) {
      expect(h.getLightState(id)!.intensity).toBe(0)
    }
    h.cleanup()
  })
})
