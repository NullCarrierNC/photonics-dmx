/**
 * End-to-end loop test for the bundled Stage Kit "Harmony" cue.
 *
 * Harmony raises the clockwise rotation effect from its cue-called event and steps by being
 * re-called every forwarded frame. When a run finishes, the raiser's idle callback releases the
 * tracking slot and the next call raises a fresh run, so the lit light travels around the rig for
 * as long as the cue is held.
 *
 * Frames are driven in the order YargNetworkListener.processCueData uses. The beat and the cue
 * dispatch run in one synchronous pass, then the microtask queue drains, then the clock advances.
 */
import fs from 'fs'
import path from 'path'
import { createSequencerHarness } from '../helpers/sequencerHarness'
import { loadCoreEffectRegistry } from '../helpers/effectRegistry'
import { LightingNodeCue } from '../../cues/node/runtime/LightingNodeCue'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { validateYargNodeCueFile } from '../../cues/node/schema/validation'
import { createMockCueData } from '../../../main/ipc/mockCueData'
import { CueType } from '../../cues/types/cueTypes'
import type { CueData } from '../../cues/types/cueTypes'
import type { NodeRuntimeCallbacks } from '../../cues/node/runtime/executionTypes'

const LIGHT_COUNT = 4

function loadHarmonyDefinition() {
  const filePath = path.join(
    __dirname,
    '../../../../resources/defaults/node-data/cues/yarg/yarg-stagekit.json',
  )
  const result = validateYargNodeCueFile(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  if (!result.valid) throw new Error('yarg-stagekit.json failed validation')
  const def = result.data.cues.find((c) => c.id === 'cue-sk-harmony')
  if (!def) throw new Error('cue-sk-harmony not found')
  return def
}

/** Small venue, so only the cyan rotation runs and exactly one light is lit per step. */
const harmonyFrame = (): CueData => ({
  ...createMockCueData({ venueSize: 'Small', bpm: 120 }),
  lightingCue: CueType.Harmony,
})

const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

describe('Stage Kit Harmony', () => {
  it('keeps stepping around the rig for as long as the cue is held', async () => {
    const h = createSequencerHarness({ frontCount: LIGHT_COUNT, backCount: 0 })
    const cue = new LightingNodeCue(
      'yarg-stagekit',
      NodeCueCompiler.compileCue(loadHarmonyDefinition(), 'yarg'),
      loadCoreEffectRegistry(['effect-rotation-cw']),
      noopCallbacks,
    )

    /** One forwarded frame, in the listener's order. */
    const runFrame = async (isBeat: boolean): Promise<void> => {
      if (isBeat) h.sequencer.onBeat()
      cue.execute(harmonyFrame(), h.sequencer, h.lightManager)
      // The raiser's idle callback is queued, so let it land before the clock blends.
      await Promise.resolve()
      h.advanceBy(16)
    }

    /** Index of the single lit light, or null when none or more than one is lit. */
    const litIndex = (): number | null => {
      const lit = h.allLightIds
        .map((id, index) => ({ index, state: h.getLightState(id) }))
        .filter(({ state }) => (state?.intensity ?? 0) > 0)
      return lit.length === 1 ? lit[0].index : null
    }

    // Start the cue and let the first step land.
    await runFrame(false)
    await runFrame(false)

    const observed: Array<number | null> = []
    // Three full cycles. Each beat advances the chase by one light. The beatless frame after it
    // stands in for the frames between beats, where the cue is still called every frame.
    for (let beat = 0; beat < LIGHT_COUNT * 3; beat++) {
      await runFrame(true)
      await runFrame(false)
      observed.push(litIndex())
    }

    const expected = Array.from({ length: LIGHT_COUNT * 3 }, (_, i) => (i + 1) % LIGHT_COUNT)
    expect(observed).toEqual(expected)

    h.cleanup()
  })
})
