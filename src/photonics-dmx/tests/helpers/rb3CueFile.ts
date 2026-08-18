import fs from 'fs'
import path from 'path'
import { validateRb3NodeCueFile } from '../../cues/node/schema/validation'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { LightingNodeCue } from '../../cues/node/runtime/LightingNodeCue'
import { EffectRegistry } from '../../cues/node/runtime/EffectRegistry'
import { createMockCueData } from '../../../main/ipc/mockCueData'
import { CueType } from '../../cues/types/cueTypes'
import type { CueData } from '../../cues/types/cueTypes'
import type { NetNodeCueFile } from '../../cues/types/nodeCueTypes'
import type { NodeRuntimeCallbacks } from '../../cues/node/runtime/executionTypes'
import type { SequencerHarness } from './sequencerHarness'

const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

/** Load and validate a bundled RB3 library. Tests drive the shipped JSON, not a fixture. */
export function loadRb3CueFile(groupId: string): NetNodeCueFile {
  const filePath = path.join(
    __dirname,
    `../../../../resources/defaults/node-data/cues/rb3/${groupId}.json`,
  )
  const result = validateRb3NodeCueFile(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  if (!result.valid) {
    throw new Error(`${groupId}.json failed validation: ${result.errors.join('; ')}`)
  }
  return result.data
}

/** The group's always-active gameplay cue, compiled and ready to execute. */
export function createRb3Cue(groupId: string): LightingNodeCue {
  const def = loadRb3CueFile(groupId).cues.find(
    (c) => c.kind === 'lighting' && c.cueType === CueType.RB3,
  )
  if (!def) throw new Error(`${groupId}: no CueType.RB3 lighting cue`)
  return new LightingNodeCue(
    groupId,
    NodeCueCompiler.compileCue(def, 'rb3'),
    new EffectRegistry(),
    noopCallbacks,
  )
}

/** What an RB3 lighting library ships: its gameplay cue. The strobes live once, in rb3-stagekit. */
export const RB3_LIBRARY_CUE_TYPES = [CueType.RB3]

/** A StageKit frame with the given bank masks lit (bit i = LED i + 1). `cueStartTime` is pinned so
 *  `time-since-cue-start` advances; the handler stamps it in production. */
export function rb3Frame(
  banks: Partial<{ red: number; green: number; blue: number; yellow: number }>,
): CueData {
  return {
    ...createMockCueData({ ledBanks: { red: 0, green: 0, blue: 0, yellow: 0, ...banks } }),
    cueStartTime: 0,
  }
}

/** Run `frames` keepalives 33ms apart, like the ~30Hz RB3E stream. A re-submitted effect queues
 *  behind the running transition, so levels need a few frames to settle before comparing. */
export function renderFrames(
  h: SequencerHarness,
  cue: LightingNodeCue,
  banks: Partial<{ red: number; green: number; blue: number; yellow: number }>,
  frames = 6,
): void {
  for (let k = 0; k < frames; k++) {
    cue.execute(rb3Frame(banks), h.sequencer, h.lightManager)
    h.advanceBy(33)
  }
}
