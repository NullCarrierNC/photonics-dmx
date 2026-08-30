/**
 * End-to-end render test for the bundled RB3 "Trail" cue. Asserts a lit LED renders as plain Stage
 * Kit, that clearing it decays the light over the tail window rather than snapping to black, and
 * that a cell whose LED never lit stays dark.
 */
import { createSequencerHarness } from '../helpers/sequencerHarness'
import {
  RB3_LIBRARY_CUE_TYPES,
  createRb3Cue,
  loadRb3CueFile,
  renderFrames,
} from '../helpers/rb3CueFile'

describe('RB3 Trail cue', () => {
  it('ships only its gameplay cue, leaving strobes to the Stage Kit group', () => {
    const file = loadRb3CueFile('rb3-trail')
    expect(file.group.id).toBe('rb3-trail')
    expect(file.cues.flatMap((c) => (c.kind === 'lighting' ? [c.cueType] : []))).toEqual(
      RB3_LIBRARY_CUE_TYPES,
    )
  })

  it('renders a lit LED as the faithful Stage Kit dot', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-trail')

    renderFrames(h, cue, { red: 0b00000001 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    expect(states[0].red).toBeGreaterThan(0)
    expect(states[0].intensity).toBeGreaterThan(0)
    for (let i = 1; i < 8; i++) {
      expect(states[i].intensity).toBe(0)
    }
    h.cleanup()
  })

  it('fades a cleared LED out over the tail instead of snapping to black', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-trail')

    renderFrames(h, cue, { red: 0b00000001 })
    const lit = h.getLightState(h.allLightIds[0])!.intensity

    // Partway through the tail the light is dimmer but still burning in the LED's colour.
    renderFrames(h, cue, {}, 5)
    const tail = h.getLightState(h.allLightIds[0])!
    expect(tail.intensity).toBeGreaterThan(0)
    expect(tail.intensity).toBeLessThan(lit)
    expect(tail.red).toBeGreaterThan(0)

    // Further along it is dimmer still, and well past the tail the cell is out.
    renderFrames(h, cue, {}, 4)
    expect(h.getLightState(h.allLightIds[0])!.intensity).toBeLessThan(tail.intensity)
    renderFrames(h, cue, {}, 12)
    expect(h.getLightState(h.allLightIds[0])!.intensity).toBe(0)
    h.cleanup()
  })

  it('never lights a cell whose LED has not been lit', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-trail')

    for (let k = 0; k < 12; k++) {
      renderFrames(h, cue, { red: 0b00000001 }, 1)
      for (let i = 1; i < 8; i++) {
        expect(h.getLightState(h.allLightIds[i])!.intensity).toBe(0)
      }
    }
    h.cleanup()
  })

  it('holds a lit cell at full while the LED stays on', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-trail')

    renderFrames(h, cue, { red: 0b00000001 })
    const settled = h.getLightState(h.allLightIds[0])!.intensity
    renderFrames(h, cue, { red: 0b00000001 }, 20)
    expect(h.getLightState(h.allLightIds[0])!.intensity).toBe(settled)
    h.cleanup()
  })

  it('keeps each bank tail independent', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-trail')

    // Red and blue both on cell 0, then only blue clears: red must stay at full.
    renderFrames(h, cue, { red: 0b00000001, blue: 0b00000001 })
    renderFrames(h, cue, { red: 0b00000001 }, 20)

    const s = h.getLightState(h.allLightIds[0])!
    expect(s.red).toBeGreaterThan(0)
    expect(s.blue).toBe(0)
    h.cleanup()
  })
})
