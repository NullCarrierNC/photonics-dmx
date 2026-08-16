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
import { DrumNoteType, type CueData } from '../../../cues/types/cueTypes'
import {
  cueGraphPolicy,
  motionCueGraphPolicy,
} from '../../../cues/node/runtime/GraphExecutionPolicy'
import { monotonicNowMs } from '../../../../shared/time'

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
  cueStartTime: monotonicNowMs(),
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

/** Motion cue carrying only vocal event nodes (plus a held cue-started, used as a noise check). */
function vocalEventCue(): YargMotionNodeCueDefinition {
  const evStart: YargEventNode = { id: 'ev-start', type: 'event', eventType: 'cue-started' }
  const evOn: YargEventNode = { id: 'ev-on', type: 'event', eventType: 'vocal-note' }
  const evOff: YargEventNode = { id: 'ev-off', type: 'event', eventType: 'vocal-note-off' }
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
  return {
    kind: 'motion',
    id: 'm-vocal',
    name: 'Vocal',
    nodes: { events: [evStart, evOn, evOff], actions: [action], logic: [] },
    connections: [
      { from: 'ev-start', to: 'a1' },
      { from: 'ev-on', to: 'a1' },
      { from: 'ev-off', to: 'a1' },
    ],
  }
}

describe('GraphExecutionPolicy vocal events', () => {
  const triggeredVocalTypes = (params: CueData): string[] => {
    const compiled = NodeCueCompiler.compileYargCue(vocalEventCue())
    const policy = cueGraphPolicy('g', 'c')
    // cue-started has already fired, so only the vocal edges can appear.
    const nodes = policy.getEntryNodes(compiled, params, { hasCueStartedFired: true })
    return nodes.map((n) => (n as YargEventNode).eventType)
  }

  const frame = (vocalNote: number, previousFrame?: Partial<CueData>): CueData => ({
    ...minimalParams(),
    vocalNote,
    previousFrame,
  })

  it('fires vocal-note on a rising edge only', () => {
    const types = triggeredVocalTypes(frame(1, { vocalNote: 0 }))
    expect(types).toContain('vocal-note')
    expect(types).not.toContain('vocal-note-off')
  })

  it('fires vocal-note-off on a falling edge only', () => {
    const types = triggeredVocalTypes(frame(0, { vocalNote: 1 }))
    expect(types).toContain('vocal-note-off')
    expect(types).not.toContain('vocal-note')
  })

  it('fires neither edge while singing is held active across frames', () => {
    const types = triggeredVocalTypes(frame(1, { vocalNote: 1 }))
    expect(types).not.toContain('vocal-note')
    expect(types).not.toContain('vocal-note-off')
  })

  it('fires neither edge while silence is held across frames', () => {
    const types = triggeredVocalTypes(frame(0, { vocalNote: 0 }))
    expect(types).not.toContain('vocal-note')
    expect(types).not.toContain('vocal-note-off')
  })

  it('treats a harmony part as singing for edge detection', () => {
    const rising: CueData = {
      ...minimalParams(),
      vocalNote: 0,
      harmony1Note: 1,
      previousFrame: { vocalNote: 0, harmony1Note: 0 },
    }
    expect(triggeredVocalTypes(rising)).toContain('vocal-note')
  })

  it('treats a missing previousFrame as not-singing (first-frame rising edge)', () => {
    const types = triggeredVocalTypes(frame(1, undefined))
    expect(types).toContain('vocal-note')
    expect(types).not.toContain('vocal-note-off')
  })
})

/** Motion cue carrying RB3 LED (position 3) and fog event nodes. When `colorChange` is set, the
 *  led-3 / led-3-off nodes carry `triggerOnColorChange`. */
function ledFogEventCue(colorChange = false): YargMotionNodeCueDefinition {
  const ev = (
    id: string,
    eventType: YargEventNode['eventType'],
    onColorChange = false,
  ): YargEventNode => ({
    id,
    type: 'event',
    eventType,
    ...(onColorChange ? { triggerOnColorChange: true } : {}),
  })
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
  const events = [
    ev('ev-on', 'led-3', colorChange),
    ev('ev-off', 'led-3-off', colorChange),
    ev('ev-fog-on', 'fog-on'),
    ev('ev-fog-off', 'fog-off'),
  ]
  return {
    kind: 'motion',
    id: 'm-led',
    name: 'Led',
    nodes: { events, actions: [action], logic: [] },
    connections: events.map((e) => ({ from: e.id, to: 'a1' })),
  }
}

describe('GraphExecutionPolicy LED and fog events (RB3 StageKit)', () => {
  const LED3 = 1 << 2 // position 3 → bit index 2
  const LED1 = 1 << 0

  const triggered = (params: CueData): string[] => {
    const compiled = NodeCueCompiler.compileYargCue(ledFogEventCue())
    const policy = cueGraphPolicy('g', 'c')
    const nodes = policy.getEntryNodes(compiled, params, { hasCueStartedFired: true })
    return nodes.map((n) => (n as YargEventNode).eventType)
  }

  const bank = (mask: number): { red: number; green: number; blue: number; yellow: number } => ({
    red: mask,
    green: 0,
    blue: 0,
    yellow: 0,
  })

  const frame = (over: Partial<CueData>): CueData => ({ ...minimalParams(), ...over })

  it('fires led-3 on a rising edge only', () => {
    const t = triggered(frame({ ledBanks: bank(LED3), previousFrame: { ledBanks: bank(0) } }))
    expect(t).toContain('led-3')
    expect(t).not.toContain('led-3-off')
  })

  it('fires led-3-off on a falling edge only', () => {
    const t = triggered(frame({ ledBanks: bank(0), previousFrame: { ledBanks: bank(LED3) } }))
    expect(t).toContain('led-3-off')
    expect(t).not.toContain('led-3')
  })

  it('fires neither edge while the LED is held lit across frames', () => {
    const t = triggered(frame({ ledBanks: bank(LED3), previousFrame: { ledBanks: bank(LED3) } }))
    expect(t).not.toContain('led-3')
    expect(t).not.toContain('led-3-off')
  })

  it('ignores a change on a different position', () => {
    const t = triggered(frame({ ledBanks: bank(LED1), previousFrame: { ledBanks: bank(0) } }))
    expect(t).not.toContain('led-3')
    expect(t).not.toContain('led-3-off')
  })

  it('detects the edge across colour banks (aggregate any-bank mask)', () => {
    // Lit in blue now, was lit in green before → still on in the aggregate, so no edge.
    const held = triggered(
      frame({
        ledBanks: { red: 0, green: 0, blue: LED3, yellow: 0 },
        previousFrame: { ledBanks: { red: 0, green: LED3, blue: 0, yellow: 0 } },
      }),
    )
    expect(held).not.toContain('led-3')
    expect(held).not.toContain('led-3-off')
  })

  it('treats a missing previousFrame as unlit (first-frame rising edge)', () => {
    const t = triggered(frame({ ledBanks: bank(LED3), previousFrame: undefined }))
    expect(t).toContain('led-3')
    expect(t).not.toContain('led-3-off')
  })

  it('fires fog edges against the previous frame', () => {
    const on = triggered(frame({ fogState: true, previousFrame: { fogState: false } }))
    expect(on).toContain('fog-on')
    expect(on).not.toContain('fog-off')
    const off = triggered(frame({ fogState: false, previousFrame: { fogState: true } }))
    expect(off).toContain('fog-off')
    expect(off).not.toContain('fog-on')
    const held = triggered(frame({ fogState: true, previousFrame: { fogState: true } }))
    expect(held).not.toContain('fog-on')
    expect(held).not.toContain('fog-off')
  })
})

describe('GraphExecutionPolicy instrument note events', () => {
  function drumKickCue(): YargMotionNodeCueDefinition {
    const evKick: YargEventNode = { id: 'ev-kick', type: 'event', eventType: 'drum-kick' }
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
      id: 'drum-kick-cue',
      name: 'Drum Kick',
      nodes: { events: [evKick], actions: [action], logic: [] },
      connections: [{ from: 'ev-kick', to: 'a1' }],
    }
  }

  const triggered = (params: CueData): string[] => {
    const compiled = NodeCueCompiler.compileYargCue(drumKickCue())
    const policy = cueGraphPolicy('g', 'c')
    const nodes = policy.getEntryNodes(compiled, params, { hasCueStartedFired: true })
    return nodes.map((n) => (n as YargEventNode).eventType)
  }

  const frame = (over: Partial<CueData>): CueData => ({ ...minimalParams(), ...over })

  it('fires drum-kick on a rising edge only', () => {
    const kick = triggered(
      frame({
        drumNotes: [DrumNoteType.Kick],
        previousFrame: { drumNotes: [] },
      }),
    )
    expect(kick).toContain('drum-kick')
  })

  it('does not fire drum-kick while the note is held across keepalive frames', () => {
    const held = triggered(
      frame({
        drumNotes: [DrumNoteType.Kick],
        previousFrame: { drumNotes: [DrumNoteType.Kick] },
      }),
    )
    expect(held).not.toContain('drum-kick')
  })

  it('fires again after release and re-hit', () => {
    const release = triggered(
      frame({
        drumNotes: [],
        previousFrame: { drumNotes: [DrumNoteType.Kick] },
      }),
    )
    expect(release).not.toContain('drum-kick')

    const rehit = triggered(
      frame({
        drumNotes: [DrumNoteType.Kick],
        previousFrame: { drumNotes: [] },
      }),
    )
    expect(rehit).toContain('drum-kick')
  })

  it('treats a missing previousFrame as empty (first-frame rising edge)', () => {
    const first = triggered(
      frame({
        drumNotes: [DrumNoteType.Kick],
        previousFrame: undefined,
      }),
    )
    expect(first).toContain('drum-kick')
  })
})

describe('GraphExecutionPolicy led-N triggerOnColorChange', () => {
  const LED3 = 1 << 2 // position 3 → bit index 2

  const triggeredCC = (params: CueData): string[] => {
    const compiled = NodeCueCompiler.compileYargCue(ledFogEventCue(true))
    const policy = cueGraphPolicy('g', 'c')
    const nodes = policy.getEntryNodes(compiled, params, { hasCueStartedFired: true })
    return nodes.map((n) => (n as YargEventNode).eventType)
  }
  const frame = (over: Partial<CueData>): CueData => ({ ...minimalParams(), ...over })
  const inBank = (
    b: 'red' | 'green' | 'blue' | 'yellow',
    mask: number,
  ): { red: number; green: number; blue: number; yellow: number } => ({
    red: 0,
    green: 0,
    blue: 0,
    yellow: 0,
    [b]: mask,
  })

  it('fires led-3 when the position stays lit but its bank colour changes', () => {
    // green→blue at position 3: aggregate is held on, so the plain edge would not fire.
    const t = triggeredCC(
      frame({ ledBanks: inBank('blue', LED3), previousFrame: { ledBanks: inBank('green', LED3) } }),
    )
    expect(t).toContain('led-3')
    expect(t).not.toContain('led-3-off')
  })

  it('does not fire when the bank colour is unchanged (held on same colour)', () => {
    const t = triggeredCC(
      frame({ ledBanks: inBank('blue', LED3), previousFrame: { ledBanks: inBank('blue', LED3) } }),
    )
    expect(t).not.toContain('led-3')
  })

  it('still fires on the plain on-edge (off→on)', () => {
    const t = triggeredCC(
      frame({ ledBanks: inBank('red', LED3), previousFrame: { ledBanks: inBank('red', 0) } }),
    )
    expect(t).toContain('led-3')
  })

  it('led-3-off still fires only on the falling edge (flag does not affect off gates)', () => {
    const off = triggeredCC(
      frame({ ledBanks: inBank('red', 0), previousFrame: { ledBanks: inBank('green', LED3) } }),
    )
    expect(off).toContain('led-3-off')
    expect(off).not.toContain('led-3')

    // A colour change while lit must NOT fire led-3-off (the position never cleared).
    const colourSwap = triggeredCC(
      frame({ ledBanks: inBank('blue', LED3), previousFrame: { ledBanks: inBank('green', LED3) } }),
    )
    expect(colourSwap).not.toContain('led-3-off')
  })

  it('without the flag, a colour change while lit does NOT fire (default behaviour)', () => {
    const compiled = NodeCueCompiler.compileYargCue(ledFogEventCue(false))
    const nodes = cueGraphPolicy('g', 'c').getEntryNodes(
      compiled,
      frame({ ledBanks: inBank('blue', LED3), previousFrame: { ledBanks: inBank('green', LED3) } }),
      { hasCueStartedFired: true },
    )
    expect(nodes.map((n) => (n as YargEventNode).eventType)).not.toContain('led-3')
  })
})
