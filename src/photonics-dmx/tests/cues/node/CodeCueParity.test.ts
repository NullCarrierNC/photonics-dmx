/**
 * Parity tests: compare sequencer call patterns of code-based cues (StrobeSlowCue,
 * StageKitFrenzyCue) with node cues under V2. Ensures reauthored StageKit strobe/Frenzy
 * sustain behaviour matches the original code cues (one effect submission per execute).
 */

import { beforeEach, describe, expect, it } from '@jest/globals'
import { StrobeSlowCue } from '../../../cues/yarg/handlers/stagekit/StrobeSlowCue'
import { StageKitFrenzyCue } from '../../../cues/yarg/handlers/stagekit/StageKitFrenzyCue'
import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler'
import type {
  YargNodeCueDefinition,
  YargEventNode,
  ActionNode,
} from '../../../cues/types/nodeCueTypes'
import { CueType } from '../../../cues/types/cueTypes'
import { YargNodeCue } from '../../../cues/node/runtime/YargNodeCue'
import { EffectRegistry } from '../../../cues/node/runtime/EffectRegistry'
import type { NodeRuntimeCallbacks } from '../../../cues/node/runtime/executionTypes'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { createMockLightingConfig } from '../../helpers/testFixtures'
import type { ILightingController } from '../../../controllers/sequencer/interfaces'
import type { CueData } from '../../../cues/types/cueTypes'

type RecordedCall = { method: 'addEffectUnblockedName' | 'setEffect' | 'addEffect'; name: string }

function createRecordingSequencer(): { sequencer: ILightingController; recorded: RecordedCall[] } {
  const recorded: RecordedCall[] = []
  const sequencer = {
    addEffect: (name: string) => {
      recorded.push({ method: 'addEffect', name })
    },
    setEffect: (name: string) => {
      recorded.push({ method: 'setEffect', name })
    },
    addEffectUnblockedName: (name: string) => {
      recorded.push({ method: 'addEffectUnblockedName', name })
      recorded.push({ method: 'addEffect', name })
      return true
    },
    setEffectUnblockedName: (name: string) => {
      recorded.push({ method: 'setEffect', name })
      return true
    },
    removeEffect: () => {},
    addEffectWithCallback: (_name: string, _e: unknown, cb: () => void) => {
      recorded.push({ method: 'addEffect', name: _name })
      if (cb) setTimeout(cb, 0)
    },
    setEffectWithCallback: (name: string, _e: unknown, cb: () => void) => {
      recorded.push({ method: 'setEffect', name })
      if (cb) setTimeout(cb, 0)
    },
    addEffectUnblockedNameWithCallback: (_name: string, _e: unknown, cb: () => void) => {
      recorded.push({ method: 'addEffect', name: _name })
      if (cb) setTimeout(cb, 0)
    },
    setEffectUnblockedNameWithCallback: (name: string, _e: unknown, cb: () => void) => {
      recorded.push({ method: 'setEffect', name })
      if (cb) setTimeout(cb, 0)
    },
    removeEffectCallback: () => {},
    blackout: () => Promise.resolve(),
    onBeat: () => {},
    onMeasure: () => {},
    onKeyframe: () => {},
    removeEffectByLayer: () => {},
  }
  return { sequencer: sequencer as unknown as ILightingController, recorded }
}

/** Sustain pattern: cue-started = setup, cue-called = action (like reauthored StageKit strobe). */
function sustainPatternCueDefinition(): YargNodeCueDefinition {
  const eventStart: YargEventNode = { id: 'ev-start', type: 'event', eventType: 'cue-started' }
  const eventCalled: YargEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
  const actionNode: ActionNode = {
    id: 'action1',
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: { source: 'literal', value: 'red' },
      brightness: { source: 'literal', value: 'high' },
      blendMode: { source: 'literal', value: 'replace' },
    },
    layer: { source: 'literal', value: 0 },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 0 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
      easing: { source: 'literal', value: 'linear' },
    },
  }
  return {
    id: 'parity-sustain',
    name: 'Parity Sustain',
    cueType: CueType.Strobe_Slow,
    style: 'primary',
    nodes: {
      events: [eventStart, eventCalled],
      actions: [actionNode],
      logic: [],
    },
    connections: [
      { from: 'ev-start', to: 'action1' },
      { from: 'ev-called', to: 'action1' },
    ],
  }
}

/** Cue-called only (like Frenzy: each execute starts next cycle). */
function cueCalledOnlyDefinition(): YargNodeCueDefinition {
  const eventCalled: YargEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
  const actionNode: ActionNode = {
    id: 'action1',
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: { source: 'literal', value: 'red' },
      brightness: { source: 'literal', value: 'high' },
      blendMode: { source: 'literal', value: 'replace' },
    },
    layer: { source: 'literal', value: 0 },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 200 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
      easing: { source: 'literal', value: 'linear' },
    },
  }
  return {
    id: 'parity-frenzy',
    name: 'Parity Frenzy',
    cueType: CueType.Frenzy,
    style: 'primary',
    nodes: {
      events: [eventCalled],
      actions: [actionNode],
      logic: [],
    },
    connections: [{ from: 'ev-called', to: 'action1' }],
  }
}

const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

const baseCueData: CueData = {
  beat: 'Strong',
  strobeState: 'Strobe_Off',
  venueSize: 'Large',
  beatsPerMinute: 120,
} as CueData

describe('Parity with code cues', () => {
  let lightManager: DmxLightManager

  beforeEach(() => {
    lightManager = new DmxLightManager(createMockLightingConfig())
  })

  describe('Strobe (sustain: one flash per execute)', () => {
    it('code StrobeSlowCue: two executes produce two addEffectUnblockedName(strobe)', async () => {
      const { sequencer, recorded } = createRecordingSequencer()
      const codeCue = new StrobeSlowCue()
      await codeCue.execute(baseCueData, sequencer, lightManager)
      await codeCue.execute(baseCueData, sequencer, lightManager)
      const strobeCalls = recorded.filter(
        (c) => c.method === 'addEffectUnblockedName' && c.name === 'strobe',
      )
      expect(strobeCalls).toHaveLength(2)
    })

    it('node sustain-pattern cue (V2): first execute setEffect+addEffect, second execute addEffect', async () => {
      const { sequencer, recorded } = createRecordingSequencer()
      const def = sustainPatternCueDefinition()
      const compiled = NodeCueCompiler.compileYargCue(def)
      const nodeCue = new YargNodeCue('group1', compiled, new EffectRegistry(), noopCallbacks)
      await nodeCue.execute(baseCueData, sequencer, lightManager)
      await nodeCue.execute(baseCueData, sequencer, lightManager)
      const setCalls = recorded.filter((c) => c.method === 'setEffect')
      const addCalls = recorded.filter((c) => c.method === 'addEffect')
      expect(setCalls).toHaveLength(1)
      expect(addCalls).toHaveLength(2)
    })
  })

  describe('Frenzy (first execute setEffect, subsequent addEffect)', () => {
    it('code StageKitFrenzyCue: first execute setEffect, second execute addEffect', async () => {
      const { sequencer, recorded } = createRecordingSequencer()
      const codeCue = new StageKitFrenzyCue()
      await codeCue.execute(baseCueData, sequencer, lightManager)
      await codeCue.execute(baseCueData, sequencer, lightManager)
      const setCalls = recorded.filter(
        (c) => c.method === 'setEffect' && c.name === 'stagekit-frenzy',
      )
      const addCalls = recorded.filter(
        (c) => c.method === 'addEffect' && c.name === 'stagekit-frenzy',
      )
      expect(setCalls).toHaveLength(1)
      expect(addCalls).toHaveLength(1)
    })

    it('node cue-called-only (V2): first execute setEffect, second execute addEffect', async () => {
      const { sequencer, recorded } = createRecordingSequencer()
      const def = cueCalledOnlyDefinition()
      const compiled = NodeCueCompiler.compileYargCue(def)
      const nodeCue = new YargNodeCue('group1', compiled, new EffectRegistry(), noopCallbacks)
      await nodeCue.execute(baseCueData, sequencer, lightManager)
      await nodeCue.execute(baseCueData, sequencer, lightManager)
      const setCalls = recorded.filter((c) => c.method === 'setEffect')
      const addCalls = recorded.filter((c) => c.method === 'addEffect')
      expect(setCalls).toHaveLength(1)
      expect(addCalls).toHaveLength(1)
    })
  })
})
