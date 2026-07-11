/**
 * The bundled RB3 "Pulse" interpretive cue lights the whole rig as one brightness bed whose level
 * tracks led-count and whose colour follows led-color. This validates + compiles the bundled file and
 * drives the real cue against a Sequencer with rising led-count, asserting the bed brightness is
 * monotone (the §6 minimum assertion) and that execution never throws (all variables are declared).
 */
import fs from 'fs'
import path from 'path'
import { createSequencerHarness } from '../helpers/sequencerHarness'
import { loadCoreEffectRegistry } from '../helpers/effectRegistry'
import { YargNodeCue } from '../../cues/node/runtime/YargNodeCue'
import { EffectRegistry } from '../../cues/node/runtime/EffectRegistry'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { validateRb3NodeCueFile } from '../../cues/node/schema/validation'
import { createMockCueData } from '../../../main/ipc/mockCueData'
import { CueType } from '../../cues/types/cueTypes'
import type { CueData } from '../../cues/types/cueTypes'
import type { NodeRuntimeCallbacks } from '../../cues/node/runtime/executionTypes'

const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

function loadPulseFile() {
  const filePath = path.join(
    __dirname,
    '../../../../resources/defaults/node-data/cues/rb3/rb3-pulse.json',
  )
  const result = validateRb3NodeCueFile(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  if (!result.valid) throw new Error(`rb3-pulse.json failed validation: ${JSON.stringify(result)}`)
  return result.data
}

function pulseCueDef() {
  const def = loadPulseFile().cues.find((c) => c.kind === 'lighting' && c.cueType === CueType.RB3)
  if (!def) throw new Error('Pulse RB3 cue not found')
  return def
}

/** A gameplay frame with the given red-bank mask. Mirrors the processor's buildFrame: led-count is
 *  the popcount of ledBanks, and led-color is the lit bank ('red' here, 'off' when dark). */
function frame(redMask: number): CueData {
  return createMockCueData({
    ledBanks: { red: redMask, green: 0, blue: 0, yellow: 0 },
    ledColor: redMask > 0 ? 'red' : 'off',
  })
}

/** Run the bed to steady state on a fresh rig and return a front light's merged intensity. The
 *  initial LED on-edges fire a one-shot flash; the ~400ms of keepalives let it decay so only the
 *  held bed remains. */
function bedIntensity(redMask: number): number {
  const h = createSequencerHarness({ frontCount: 4, backCount: 4 })
  const cue = new YargNodeCue(
    'rb3-pulse',
    NodeCueCompiler.compileYargCue(pulseCueDef()),
    new EffectRegistry(),
    noopCallbacks,
  )
  for (let k = 0; k < 12; k++) {
    cue.execute(frame(redMask), h.sequencer, h.lightManager)
    h.advanceBy(33)
  }
  const intensity = h.getLightState(h.frontLightIds[0])!.intensity
  h.cleanup()
  return intensity
}

describe('RB3 Pulse interpretive cue', () => {
  it('validates and compiles the bundled file', () => {
    expect(() => NodeCueCompiler.compileYargCue(pulseCueDef())).not.toThrow()
    // Group ships the Pulse primary plus the four cloned strobes.
    const cueTypes = loadPulseFile()
      .cues.flatMap((c) => (c.kind === 'lighting' ? [c.cueType] : []))
      .sort()
    expect(cueTypes).toEqual(
      ['RB3', 'Strobe_Fast', 'Strobe_Fastest', 'Strobe_Medium', 'Strobe_Slow'].sort(),
    )
  })

  it('bed brightness is monotone in led-count (0 lit = off, 8 = full)', () => {
    const i0 = bedIntensity(0b00000000) // 0 LEDs
    const i2 = bedIntensity(0b00000011) // 2 LEDs
    const i4 = bedIntensity(0b00001111) // 4 LEDs
    const i8 = bedIntensity(0b11111111) // 8 LEDs

    expect(i0).toBe(0)
    expect(i2).toBeGreaterThan(i0)
    expect(i4).toBeGreaterThan(i2)
    expect(i8).toBeGreaterThan(i4)
    expect(i8).toBeGreaterThan(200) // near full at 8 LEDs
  })

  it('fires a white flash impulse on an LED on-edge', () => {
    const h = createSequencerHarness({ frontCount: 4, backCount: 4 })
    const cue = new YargNodeCue(
      'rb3-pulse',
      NodeCueCompiler.compileYargCue(pulseCueDef()),
      loadCoreEffectRegistry(['effect-flash-color']),
      noopCallbacks,
    )
    // Dark first (runs cue-started so allLights resolves), then a led-1 on-edge fires the flash.
    const dark = frame(0)
    cue.execute(dark, h.sequencer, h.lightManager)
    h.advanceBy(33)
    cue.execute({ ...frame(0b00000001), previousFrame: dark }, h.sequencer, h.lightManager)

    // The white flash (brightness high) on layer 101 spikes well above the dim single-LED bed.
    let maxFront = 0
    for (let k = 0; k < 8; k++) {
      h.advanceBy(30)
      for (const id of h.frontLightIds) {
        maxFront = Math.max(maxFront, h.getLightState(id)!.intensity)
      }
    }
    expect(maxFront).toBeGreaterThan(120)
  })
})
