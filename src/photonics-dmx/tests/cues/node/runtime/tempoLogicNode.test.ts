import {
  evaluateLogicNode,
  type LogicNodeEvaluatorContext,
} from '../../../../cues/node/runtime/logicNodeEvaluator'
import type { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import type { TempoLogicNode } from '../../../../cues/types/nodeCueTypes'

/**
 * Harness with a YARG-mode cueData carrying a bpm. The beat-duration-ms extractor derives the beat from
 * bpm (round(60000/bpm), or 500 when bpm <= 0), which is exactly what the tempo node reads.
 */
function harness(bpm: number, declared: string[]) {
  const cueStore = new Map<string, VariableValue>()
  const groupStore = new Map<string, VariableValue>()
  const variableDefinitions = declared.map((name) => ({
    name,
    type: 'number' as const,
    scope: 'cue' as const,
    initialValue: 0,
  }))
  // 'lightingCue' presence selects the YARG extractor; beatsPerMinute drives beat-duration-ms and bpm.
  const context = {
    cueLevelVarStore: cueStore,
    groupLevelVarStore: groupStore,
    cueData: { lightingCue: 'Chorus', beatsPerMinute: bpm },
  } as unknown as ExecutionContext
  const evalCtx: LogicNodeEvaluatorContext = {
    cueId: 'g:c',
    lightManager: {} as never,
    cueLevelVarStore: cueStore,
    groupLevelVarStore: groupStore,
    variableDefinitions,
    executeNode: () => {},
  }
  const run = (node: TempoLogicNode) => evaluateLogicNode(node, node.id, [], context, evalCtx)
  const num = (name: string): number | undefined => cueStore.get(name)?.value as number | undefined
  return { run, num }
}

const fullNode = (over: Partial<TempoLogicNode> = {}): TempoLogicNode => ({
  id: 't1',
  type: 'logic',
  logicType: 'tempo',
  assignBeatMs: 'beat_ms',
  assignBarMs: 'bar_ms',
  assignPhraseMs: 'phrase_ms',
  assignCycles: 'cycles',
  ...over,
})

describe('tempo logic node', () => {
  it('derives beat / bar / phrase from bpm with the default 4-beat bar and 2-bar phrase', () => {
    const { run, num } = harness(120, ['beat_ms', 'bar_ms', 'phrase_ms', 'cycles'])
    run(fullNode())
    expect(num('beat_ms')).toBe(500) // 60000/120
    expect(num('bar_ms')).toBe(2000) // beat * 4
    expect(num('phrase_ms')).toBe(4000) // bar * 2
  })

  it('bands the cycle count by bpm (slow / medium / fast)', () => {
    // Defaults: bands [110, 150], values [2, 3, 5].
    const slow = harness(90, ['beat_ms', 'cycles'])
    slow.run(fullNode())
    expect(slow.num('cycles')).toBe(2) // below both bands

    const mid = harness(120, ['beat_ms', 'cycles'])
    mid.run(fullNode())
    expect(mid.num('cycles')).toBe(3) // >= 110, < 150

    const fast = harness(160, ['beat_ms', 'cycles'])
    fast.run(fullNode())
    expect(fast.num('cycles')).toBe(5) // >= 150
  })

  it('clamps the beat and falls back when the tempo is implausibly fast (no-tempo guard)', () => {
    // 2000 bpm -> beat-duration-ms 30ms, below the 60ms guard, so the node uses fallbackBeatMs (461).
    const { run, num } = harness(2000, ['beat_ms'])
    run(fullNode({ assignBarMs: undefined, assignPhraseMs: undefined, assignCycles: undefined }))
    expect(num('beat_ms')).toBe(461)
  })

  it('honours custom beatsPerBar / barsPerPhrase / clamp / fallback', () => {
    const { run, num } = harness(120, ['beat_ms', 'bar_ms', 'phrase_ms'])
    run(
      fullNode({
        assignCycles: undefined,
        beatsPerBar: { source: 'literal', value: 3 },
        barsPerPhrase: { source: 'literal', value: 4 },
      }),
    )
    expect(num('beat_ms')).toBe(500)
    expect(num('bar_ms')).toBe(1500) // beat * 3
    expect(num('phrase_ms')).toBe(6000) // bar * 4
  })

  it('only writes the optional outputs that are configured', () => {
    const { run, num } = harness(120, ['beat_ms', 'bar_ms', 'phrase_ms', 'cycles'])
    run(fullNode({ assignBarMs: undefined, assignPhraseMs: undefined, assignCycles: undefined }))
    expect(num('beat_ms')).toBe(500)
    expect(num('bar_ms')).toBeUndefined()
    expect(num('phrase_ms')).toBeUndefined()
    expect(num('cycles')).toBeUndefined()
  })
})
