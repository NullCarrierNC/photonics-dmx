/**
 * The bundled RB3 "Ripple" interpretive cue keeps a dim led-color bed and launches a colour sweep
 * across the rig on every LED on-edge. This validates + compiles the bundled file and drives the real
 * cue against a Sequencer, asserting a front light lights up well above the dim bed after a led-1
 * on-edge (the §6 "fires a sweep on an on-edge" assertion) and that execution never throws.
 */
import fs from 'fs'
import path from 'path'
import { createSequencerHarness } from '../helpers/sequencerHarness'
import { loadCoreEffectRegistry } from '../helpers/effectRegistry'
import { YargNodeCue } from '../../cues/node/runtime/YargNodeCue'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { validateRb3NodeCueFile } from '../../cues/node/schema/validation'
import { createMockCueData } from '../../../main/ipc/mockCueData'
import { CueType } from '../../cues/types/cueTypes'
import type { CueData } from '../../cues/types/cueTypes'
import type { NodeRuntimeCallbacks } from '../../cues/node/runtime/executionTypes'

const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

function loadRippleFile() {
  const filePath = path.join(
    __dirname,
    '../../../../resources/defaults/node-data/cues/rb3/rb3-ripple.json',
  )
  const result = validateRb3NodeCueFile(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  if (!result.valid) throw new Error(`rb3-ripple.json failed validation: ${JSON.stringify(result)}`)
  return result.data
}

function rippleCueDef() {
  const def = loadRippleFile().cues.find((c) => c.kind === 'lighting' && c.cueType === CueType.RB3)
  if (!def) throw new Error('Ripple RB3 cue not found')
  return def
}

function frame(redMask: number): CueData {
  return createMockCueData({
    ledBanks: { red: redMask, green: 0, blue: 0, yellow: 0 },
    ledColor: redMask > 0 ? 'red' : 'off',
  })
}

describe('RB3 Ripple interpretive cue', () => {
  it('validates and compiles the bundled file', () => {
    expect(() => NodeCueCompiler.compileYargCue(rippleCueDef())).not.toThrow()
    const cueTypes = loadRippleFile()
      .cues.flatMap((c) => (c.kind === 'lighting' ? [c.cueType] : []))
      .sort()
    expect(cueTypes).toEqual(
      ['RB3', 'Strobe_Fast', 'Strobe_Fastest', 'Strobe_Medium', 'Strobe_Slow'].sort(),
    )
  })

  it('launches a sweep across the front row on a led-1 on-edge', () => {
    const h = createSequencerHarness({ frontCount: 4, backCount: 4 })
    const cue = new YargNodeCue(
      'rb3-ripple',
      NodeCueCompiler.compileYargCue(rippleCueDef()),
      loadCoreEffectRegistry(['effect-sweep-color', 'effect-flash-color']),
      noopCallbacks,
    )

    // Dark first (runs cue-started so the light rows resolve), then Light 1 on. The led-1 edge is
    // detected against previousFrame (the handler stamps it in production), so wire it here.
    const dark = frame(0)
    cue.execute(dark, h.sequencer, h.lightManager)
    h.advanceBy(33)
    cue.execute({ ...frame(0b00000001), previousFrame: dark }, h.sequencer, h.lightManager)

    // The sweep is staggered white (brightness high) over ~700ms and adds well above the dim bed.
    let maxFront = 0
    for (let k = 0; k < 20; k++) {
      h.advanceBy(40)
      for (const id of h.frontLightIds) {
        maxFront = Math.max(maxFront, h.getLightState(id)!.intensity)
      }
    }
    expect(maxFront).toBeGreaterThan(120)
  })

  it('launches a sweep when all LEDs stay lit but the colour changes', () => {
    const h = createSequencerHarness({ frontCount: 4, backCount: 4 })
    const cue = new YargNodeCue(
      'rb3-ripple',
      NodeCueCompiler.compileYargCue(rippleCueDef()),
      loadCoreEffectRegistry(['effect-sweep-color', 'effect-flash-color']),
      noopCallbacks,
    )
    const allRed = createMockCueData({
      ledBanks: { red: 0xff, green: 0, blue: 0, yellow: 0 },
      ledColor: 'red',
    })
    const allBlue = createMockCueData({
      ledBanks: { red: 0, green: 0, blue: 0xff, yellow: 0 },
      ledColor: 'blue',
    })

    // Steady all-red first (previousFrame all-red = no on-edge, no colour change) so cue-started runs
    // and the light rows resolve without launching a sweep yet.
    cue.execute(
      { ...allRed, previousFrame: { ledBanks: { red: 0xff, green: 0, blue: 0, yellow: 0 } } },
      h.sequencer,
      h.lightManager,
    )
    h.advanceBy(33)
    // Flip every position red -> blue: the aggregate mask is unchanged (all lit, no on-edge), so only
    // the triggerOnColorChange gate fires the sweeps.
    cue.execute({ ...allBlue, previousFrame: allRed }, h.sequencer, h.lightManager)

    // Capture the brightest front-light state over the sweep window.
    let peak = { intensity: 0, red: 0, green: 0, blue: 0 }
    for (let k = 0; k < 20; k++) {
      h.advanceBy(40)
      for (const id of h.frontLightIds) {
        const s = h.getLightState(id)!
        if (s.intensity > peak.intensity) peak = { ...s }
      }
    }
    expect(peak.intensity).toBeGreaterThan(120)
    // The sweep carries the LED's colour (blue), not a white flash: blue present, red absent.
    expect(peak.blue).toBeGreaterThan(120)
    expect(peak.red).toBeLessThan(40)
  })
})
