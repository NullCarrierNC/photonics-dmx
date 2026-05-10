/**
 * Visual and motion cue policies share the same entry events (cue-started, cue-called, beat, etc.).
 * Motion differs only by useInitialClearPolicy (no setEffect clear on first submission).
 */

import { describe, expect, it } from '@jest/globals'
import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler'
import type {
  YargMotionNodeCueDefinition,
  YargEventNode,
  ActionNode,
} from '../../../cues/types/nodeCueTypes'
import type { CueData } from '../../../cues/types/cueTypes'
import {
  cueGraphPolicy,
  motionCueGraphPolicy,
} from '../../../cues/node/runtime/GraphExecutionPolicy'

const minimalParams = (): CueData => ({
  datagramVersion: 1,
  platform: 'Windows',
  currentScene: 'Gameplay',
  pauseState: 'Unpaused',
  venueSize: 'Large',
  beatsPerMinute: 120,
  songSection: 'Verse',
  guitarNotes: [],
  bassNotes: [],
  drumNotes: [],
  keysNotes: [],
  vocalNote: 0,
  harmony0Note: 0,
  harmony1Note: 0,
  harmony2Note: 0,
  lightingCue: 'Default',
  postProcessing: 'Default',
  fogState: false,
  strobeState: 'Strobe_Off',
  performer: 0,
  trackMode: 'tracked',
  beat: 'Strong',
  keyframe: 'Off',
  bonusEffect: false,
  cueHistory: [],
  executionCount: 1,
  cueStartTime: Date.now(),
  timeSinceLastCue: 0,
})

function dualLifecycleCue(): YargMotionNodeCueDefinition {
  const evStart: YargEventNode = { id: 'ev-start', type: 'event', eventType: 'cue-started' }
  const evCalled: YargEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
  const action: ActionNode = {
    id: 'a1',
    type: 'action',
    effectType: 'set-position',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    position: {
      mode: 'direction',
      bearing: { source: 'literal', value: 'downstage' },
      angle: { source: 'literal', value: 10 },
    },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 200 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 120 },
  }
  return {
    kind: 'motion',
    id: 'm1',
    name: 'Motion',
    nodes: { events: [evStart, evCalled], actions: [action], logic: [] },
    connections: [
      { from: 'ev-start', to: 'a1' },
      { from: 'ev-called', to: 'a1' },
    ],
  }
}

describe('GraphExecutionPolicy motion vs visual', () => {
  it('visual cue policy includes cue-called when cue-started has already fired', () => {
    const compiled = NodeCueCompiler.compileYargCue(dualLifecycleCue())
    const policy = cueGraphPolicy('g', 'c')
    const nodes = policy.getEntryNodes(compiled, minimalParams(), { hasCueStartedFired: true })
    const types = nodes.map((n) => (n as YargEventNode).eventType)
    expect(types).toContain('cue-called')
    expect(types).not.toContain('cue-started')
  })

  it('motion cue policy includes cue-called when cue-started has already fired (same as visual)', () => {
    const compiled = NodeCueCompiler.compileYargCue(dualLifecycleCue())
    const policy = motionCueGraphPolicy('g', 'c')
    const nodes = policy.getEntryNodes(compiled, minimalParams(), { hasCueStartedFired: true })
    const types = nodes.map((n) => (n as YargEventNode).eventType)
    expect(types).toContain('cue-called')
    expect(types).not.toContain('cue-started')
  })

  it('motion cue policy entryEventTypes includes cue-started and cue-called', () => {
    const policy = motionCueGraphPolicy('g', 'c')
    expect(policy.entryEventTypes).toContain('cue-called')
    expect(policy.entryEventTypes).toContain('cue-started')
  })

  it('getEntryNodes orders cue-started, then cue-called, then other triggered events', () => {
    const evStart: YargEventNode = { id: 'ev-start', type: 'event', eventType: 'cue-started' }
    const evCalled: YargEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
    const evBeat: YargEventNode = { id: 'ev-beat', type: 'event', eventType: 'beat' }
    const action: ActionNode = {
      id: 'a1',
      type: 'action',
      effectType: 'set-position',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' },
      },
      position: {
        mode: 'direction',
        bearing: { source: 'literal', value: 'downstage' },
        angle: { source: 'literal', value: 10 },
      },
      timing: {
        waitForCondition: { source: 'literal', value: 'none' },
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 200 },
        waitUntilCondition: { source: 'literal', value: 'none' },
        waitUntilTime: { source: 'literal', value: 0 },
      },
      layer: { source: 'literal', value: 0 },
    }
    const def: YargMotionNodeCueDefinition = {
      kind: 'motion',
      id: 'm-order',
      name: 'Motion order',
      nodes: { events: [evBeat, evCalled, evStart], actions: [action], logic: [] },
      connections: [
        { from: 'ev-start', to: 'a1' },
        { from: 'ev-called', to: 'a1' },
        { from: 'ev-beat', to: 'a1' },
      ],
    }
    const compiled = NodeCueCompiler.compileYargCue(def)
    const policy = cueGraphPolicy('g', 'c')
    const params = minimalParams()
    const nodes = policy.getEntryNodes(compiled, params, { hasCueStartedFired: false })
    const types = nodes.map((n) => (n as YargEventNode).eventType)
    expect(types).toEqual(['cue-started', 'cue-called', 'beat'])
  })
})
