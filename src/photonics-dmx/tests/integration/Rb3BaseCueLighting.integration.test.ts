/**
 * End-to-end render test for the bundled RB3 StageKit "base" cue (CueType.RB3).
 * Drives the compiled cue against a real Sequencer + LightTransitionController with mock
 * StageKit LED-bank frames and asserts the resulting per-light colours mirror the direct
 * processor's fold and additive blending, on both an 8-light and a 4-light rig.
 */
import fs from 'fs'
import path from 'path'
import { createSequencerHarness } from '../helpers/sequencerHarness'
import { YargNodeCue } from '../../cues/node/runtime/YargNodeCue'
import { EffectRegistry } from '../../cues/node/runtime/EffectRegistry'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { validateRb3NodeCueFile } from '../../cues/node/schema/validation'
import { createMockCueData } from '../../../main/ipc/mockCueData'
import { CueType } from '../../cues/types/cueTypes'
import type { CueData } from '../../cues/types/cueTypes'
import type { NodeRuntimeCallbacks } from '../../cues/node/runtime/executionTypes'

function loadBaseCueDefinition() {
  const filePath = path.join(
    __dirname,
    '../../../../resources/defaults/node-data/cues/rb3/rb3-stagekit.json',
  )
  const result = validateRb3NodeCueFile(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  if (!result.valid) throw new Error('rb3-stagekit.json failed validation')
  const def = result.data.cues.find((c) => c.kind === 'lighting' && c.cueType === CueType.RB3)
  if (!def) throw new Error('CueType.RB3 base cue not found')
  return def
}

function frame(
  banks: Partial<{ red: number; green: number; blue: number; yellow: number }>,
): CueData {
  return createMockCueData({
    ledBanks: { red: 0, green: 0, blue: 0, yellow: 0, ...banks },
  })
}

const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

describe('RB3 base cue lighting', () => {
  it('renders single-bank LED masks onto the matching lights (8-light rig)', () => {
    const h = createSequencerHarness({ frontCount: 4, backCount: 4 })
    const cue = new YargNodeCue(
      'rb3-stagekit',
      NodeCueCompiler.compileCue(loadBaseCueDefinition(), 'rb3'),
      new EffectRegistry(),
      noopCallbacks,
    )

    // Red LEDs 0 and 2 lit (mask 0b00000101).
    cue.execute(frame({ red: 0b00000101 }), h.sequencer, h.lightManager)
    h.advanceBy(16)
    h.advanceBy(16)

    const lit = h.allLightIds.map((id) => h.getLightState(id))
    // Lights 0 and 2 are red; every other light is dark.
    for (let i = 0; i < 8; i++) {
      const s = lit[i]!
      if (i === 0 || i === 2) {
        expect(s.red).toBeGreaterThan(0)
        expect(s.green).toBe(0)
        expect(s.blue).toBe(0)
        expect(s.intensity).toBeGreaterThan(0)
      } else {
        expect(s.red).toBe(0)
        expect(s.green).toBe(0)
        expect(s.blue).toBe(0)
      }
    }
    h.cleanup()
  })

  it('additively blends overlapping colour banks on a shared light (8-light rig)', () => {
    const h = createSequencerHarness({ frontCount: 4, backCount: 4 })
    const cue = new YargNodeCue(
      'rb3-stagekit',
      NodeCueCompiler.compileCue(loadBaseCueDefinition(), 'rb3'),
      new EffectRegistry(),
      noopCallbacks,
    )

    // Light 2: red AND yellow. Light 0: red only.
    cue.execute(frame({ red: 0b00000101, yellow: 0b00000100 }), h.sequencer, h.lightManager)
    h.advanceBy(16)
    h.advanceBy(16)

    const l0 = h.getLightState(h.allLightIds[0])!
    const l2 = h.getLightState(h.allLightIds[2])!
    // Light 0 is red only (yellow adds green — absent here).
    expect(l0.red).toBeGreaterThan(0)
    expect(l0.green).toBe(0)
    // Light 2 is red + yellow = red and green both present (additive), no blue.
    expect(l2.red).toBeGreaterThan(0)
    expect(l2.green).toBeGreaterThan(0)
    expect(l2.blue).toBe(0)
    // The shared light's intensity exceeds a single bank's (additive).
    expect(l2.intensity).toBeGreaterThan(l0.intensity)
    h.cleanup()
  })

  it('clears a cell when its LED turns off', () => {
    const h = createSequencerHarness({ frontCount: 4, backCount: 4 })
    const cue = new YargNodeCue(
      'rb3-stagekit',
      NodeCueCompiler.compileCue(loadBaseCueDefinition(), 'rb3'),
      new EffectRegistry(),
      noopCallbacks,
    )

    cue.execute(frame({ red: 0b00000001 }), h.sequencer, h.lightManager)
    h.advanceBy(33)
    h.advanceBy(33)
    expect(h.getLightState(h.allLightIds[0])!.red).toBeGreaterThan(0)

    // All banks dark: after a couple of keepalives the cell returns to black.
    for (let k = 0; k < 3; k++) {
      cue.execute(frame({}), h.sequencer, h.lightManager)
      h.advanceBy(33)
    }
    const s = h.getLightState(h.allLightIds[0])!
    expect(s.red).toBe(0)
    expect(s.green).toBe(0)
    expect(s.blue).toBe(0)
    h.cleanup()
  })

  it('folds an 8-LED mask onto a 4-light rig (LED i -> light i&3)', () => {
    const h = createSequencerHarness({ frontCount: 2, backCount: 2 })
    const cue = new YargNodeCue(
      'rb3-stagekit',
      NodeCueCompiler.compileCue(loadBaseCueDefinition(), 'rb3'),
      new EffectRegistry(),
      noopCallbacks,
    )

    // LED bit 4 lit -> folds to light 0 (4 & 3).
    cue.execute(frame({ red: 0b00010000 }), h.sequencer, h.lightManager)
    h.advanceBy(16)
    h.advanceBy(16)
    expect(h.getLightState(h.allLightIds[0])!.red).toBeGreaterThan(0)
    for (let i = 1; i < 4; i++) {
      expect(h.getLightState(h.allLightIds[i])!.red).toBe(0)
    }
    h.cleanup()
  })

  it('holds a lit cell continuously across keepalive frames (no dark gap)', () => {
    const h = createSequencerHarness({ frontCount: 4, backCount: 4 })
    const cue = new YargNodeCue(
      'rb3-stagekit',
      NodeCueCompiler.compileCue(loadBaseCueDefinition(), 'rb3'),
      new EffectRegistry(),
      noopCallbacks,
    )

    let everDark = false
    for (let k = 0; k < 8; k++) {
      cue.execute(frame({ red: 0b00000001 }), h.sequencer, h.lightManager) // ~30Hz keepalive
      h.advanceBy(33)
      if (h.getLightState(h.allLightIds[0])!.red === 0) everDark = true
    }
    expect(everDark).toBe(false)
    h.cleanup()
  })
})
