/**
 * Cue and effect files, and the summaries main lists them by, for the cue editor's hook suites.
 * Every builder returns the full type, so a suite states only what its case turns on.
 */
import type { NodeCueFileSummary } from '../../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type { EffectFileSummary } from '../../../../photonics-dmx/cues/node/loader/EffectLoader'
import type {
  NetNodeCueDefinition,
  NetNodeCueFile,
  NodeCueKind,
  YargEffectDefinition,
  YargEffectFile,
} from '../../../../photonics-dmx/cues/types/nodeCueTypes'
import { CueType } from '../../../../photonics-dmx/cues/types/cueTypes'

/** An empty cue graph of `kind`, a primary Chorus cue when it lights. */
export const cue = (id: string, kind: NodeCueKind, name: string): NetNodeCueDefinition => {
  const graph = { id, name, nodes: { events: [], actions: [] }, connections: [] }
  return kind === 'motion'
    ? { ...graph, kind }
    : { ...graph, kind, cueType: CueType.Chorus, style: 'primary' }
}

/** An empty YARG effect graph. */
export const effect = (id: string, name: string): YargEffectDefinition => ({
  id,
  name,
  mode: 'yarg',
  nodes: { events: [], actions: [] },
  connections: [],
})

/** A YARG cue file in group `g` holding `cues`. */
export const cueFileOf = (...cues: NetNodeCueDefinition[]): NetNodeCueFile => ({
  version: 1,
  mode: 'yarg',
  group: { id: 'g', name: 'Group' },
  cues,
})

/** A YARG effect file in group `g` holding `effects`. */
export const effectFileOf = (...effects: YargEffectDefinition[]): YargEffectFile => ({
  version: 1,
  mode: 'yarg',
  group: { id: 'g', name: 'Group' },
  effects,
})

type SummaryKey = Pick<NodeCueFileSummary, 'mode' | 'groupId' | 'path'>

/** How main lists an empty cue file, named after its group. */
export const cueSummary = (
  key: SummaryKey,
  rest: Partial<NodeCueFileSummary> = {},
): NodeCueFileSummary => ({
  groupName: key.groupId,
  cueCount: 0,
  lightingCueCount: 0,
  motionCueCount: 0,
  updatedAt: 0,
  ...key,
  ...rest,
})

/** How main lists an empty effect file, named after its group. */
export const effectSummary = (
  key: Pick<EffectFileSummary, 'mode' | 'groupId' | 'path'>,
): EffectFileSummary => ({ groupName: key.groupId, effectCount: 0, updatedAt: 0, ...key })
