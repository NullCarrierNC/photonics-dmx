/**
 * Repro for the RB3 motion-freeze bug: in cue simulation the RB3 colour "base" cue
 * (CueType.RB3) is always active and re-dispatched every keepalive. A concurrently running
 * RB3 motion cue must still animate the moving heads' pan/tilt — the same rig animates under a
 * YARG motion cue. This drives the real base cue + a real motion cue against one Sequencer and
 * asserts the head's pan changes over ~1s.
 */
import fs from 'fs'
import path from 'path'
import { createSequencerHarness } from '../helpers/sequencerHarness'
import { YargNodeCue } from '../../cues/node/runtime/YargNodeCue'
import { YargMotionNodeCue } from '../../cues/node/runtime/YargMotionNodeCue'
import { EffectRegistry } from '../../cues/node/runtime/EffectRegistry'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { validateRb3NodeCueFile } from '../../cues/node/schema/validation'
import { createMockCueData } from '../../../main/ipc/mockCueData'
import { CueType } from '../../cues/types/cueTypes'
import type { CueData } from '../../cues/types/cueTypes'
import type { NodeRuntimeCallbacks } from '../../cues/node/runtime/executionTypes'

const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

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

function loadMotionCue(id: string) {
  const filePath = path.join(
    __dirname,
    '../../../../resources/defaults/node-data/cues/rb3/rb3-motion-default.json',
  )
  const result = validateRb3NodeCueFile(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  if (!result.valid) throw new Error('rb3-motion-default.json failed validation')
  const def = result.data.cues.find((c) => c.id === id)
  if (!def) throw new Error(`motion cue ${id} not found`)
  return def
}

function litFrame(): CueData {
  // A couple of lit banks so the base cue paints real colour layers (like live StageKit).
  return createMockCueData({ ledBanks: { red: 0b00000011, green: 0, blue: 0, yellow: 0 } })
}

describe('RB3 motion animates alongside the base cue', () => {
  it('control: a motion cue alone animates the head pan (no base cue)', () => {
    const h = createSequencerHarness({ frontCount: 4, backCount: 4, movingHead: true })
    const motion = new YargMotionNodeCue(
      'rb3-motion-default',
      NodeCueCompiler.compileYargCue(loadMotionCue('rb3-motion-wave')),
    )
    motion.execute(createMockCueData({}), h.sequencer, h.lightManager)

    const pans = new Set<number>()
    for (let k = 0; k < 30; k++) {
      h.advanceBy(33)
      const p = h.getLightState(h.frontLightIds[0])!.pan
      if (p !== undefined) pans.add(Math.round(p * 100) / 100)
    }
    expect(pans.size).toBeGreaterThan(1)
    h.cleanup()
  })

  it('the head pan animates while the RB3 base cue re-dispatches every keepalive', () => {
    const h = createSequencerHarness({ frontCount: 4, backCount: 4, movingHead: true })
    const base = new YargNodeCue(
      'rb3-stagekit',
      NodeCueCompiler.compileYargCue(loadBaseCueDefinition()),
      new EffectRegistry(),
      noopCallbacks,
    )
    const motion = new YargMotionNodeCue(
      'rb3-motion-default',
      NodeCueCompiler.compileYargCue(loadMotionCue('rb3-motion-wave')),
    )

    // Base cue first (its initial submission clears), then the motion cue — the sim order.
    base.execute(litFrame(), h.sequencer, h.lightManager)
    h.advanceBy(16)
    motion.execute(createMockCueData({}), h.sequencer, h.lightManager)
    h.advanceBy(16)

    const pans = new Set<number>()
    for (let k = 0; k < 30; k++) {
      base.execute(litFrame(), h.sequencer, h.lightManager) // ~30Hz colour keepalive
      h.advanceBy(33)
      const p = h.getLightState(h.frontLightIds[0])!.pan
      if (p !== undefined) pans.add(Math.round(p * 100) / 100)
    }

    // The head must move: more than one distinct pan value across ~1s.
    expect(pans.size).toBeGreaterThan(1)
    h.cleanup()
  })
})
