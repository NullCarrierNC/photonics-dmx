/**
 * End-to-end render test for the bundled RB3 "Stage Kit Reversed" cue. Asserts the Stage Kit render
 * with the ring turned around: LED 1 lands on light 8, LED 8 on light 1, colours and additive
 * blending unchanged.
 */
import { createSequencerHarness } from '../helpers/sequencerHarness'
import {
  RB3_LIBRARY_CUE_TYPES,
  createRb3Cue,
  loadRb3CueFile,
  renderFrames,
} from '../helpers/rb3CueFile'

describe('RB3 Stage Kit Reversed cue', () => {
  it('ships only its gameplay cue, leaving strobes to the Stage Kit group', () => {
    const file = loadRb3CueFile('rb3-stagekit-reversed')
    expect(file.group.id).toBe('rb3-stagekit-reversed')
    expect(file.cues.flatMap((c) => (c.kind === 'lighting' ? [c.cueType] : []))).toEqual(
      RB3_LIBRARY_CUE_TYPES,
    )
  })

  it('renders LED 1 on light 8 and LED 8 on light 1', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-stagekit-reversed')

    renderFrames(h, cue, { red: 0b00000001 })
    let states = h.allLightIds.map((id) => h.getLightState(id)!)
    expect(states[7].red).toBeGreaterThan(0)
    for (let i = 0; i < 7; i++) {
      expect(states[i].intensity).toBe(0)
    }

    renderFrames(h, cue, { red: 0b10000000 })
    states = h.allLightIds.map((id) => h.getLightState(id)!)
    expect(states[0].red).toBeGreaterThan(0)
    for (let i = 1; i < 8; i++) {
      expect(states[i].intensity).toBe(0)
    }
    h.cleanup()
  })

  it('reverses a whole chase without changing its colours', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-stagekit-reversed')

    // LEDs 1-4 (the front row in Stage Kit) render on the back row here.
    renderFrames(h, cue, { green: 0b00001111 })

    const states = h.allLightIds.map((id) => h.getLightState(id)!)
    for (const i of [4, 5, 6, 7]) {
      expect(states[i].green).toBeGreaterThan(0)
      expect(states[i].red).toBe(0)
    }
    for (const i of [0, 1, 2, 3]) {
      expect(states[i].intensity).toBe(0)
    }
    h.cleanup()
  })

  it('blends overlapping banks additively on the reversed position', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-stagekit-reversed')

    // LED 1 red and yellow: yellow carries green, so the reversed light reads red plus green.
    renderFrames(h, cue, { red: 0b00000001, yellow: 0b00000001 })

    const s = h.getLightState(h.allLightIds[7])!
    expect(s.red).toBeGreaterThan(0)
    expect(s.green).toBeGreaterThan(0)
    expect(s.blue).toBe(0)
    h.cleanup()
  })

  it('clears a cell when its LED turns off', () => {
    const h = createSequencerHarness()
    const cue = createRb3Cue('rb3-stagekit-reversed')

    renderFrames(h, cue, { red: 0b00000001 })
    renderFrames(h, cue, {})
    expect(h.getLightState(h.allLightIds[7])!.intensity).toBe(0)
    h.cleanup()
  })
})
