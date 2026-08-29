/**
 * A motion cue whose move is longer than the gap between measures, driven against a real sequencer.
 *
 * Vogue Slow is the shape: a measure event fans out over every light and submits a blocking
 * set-position per light, layer 120, moving for longer than one measure lasts at a fast tempo. Each
 * measure therefore re-fires the action while the previous move is still running, which is the case
 * these tests cover: the newest move takes over, the lights keep tracking it, and the engine's
 * records still describe what is on the sequencer.
 */
import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals'

import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { MotionNodeCue } from '../../cues/node/runtime/MotionNodeCue'
import { monotonicNowMs } from '../../../shared/time'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'
import type { CueData } from '../../cues/types/cueTypes'
import type {
  ActionNode,
  LogicNode,
  NetEventNode,
  NetMotionNodeCueDefinition,
} from '../../cues/types/nodeCueTypes'

/** The move runs for four measures at the tempo below, so a re-fire always lands mid-move. */
const MOVE_DURATION_MS = 1600
const MEASURE_INTERVAL_MS = 400

const measureEvent: NetEventNode = {
  id: 'ev-measure',
  type: 'event',
  eventType: 'measure',
}

const allLights: LogicNode = {
  id: 'all-lights',
  type: 'logic',
  logicType: 'config-data',
  dataProperty: 'all-lights-array',
  assignTo: 'everyLight',
}

const forEach: LogicNode = {
  id: 'for-each',
  type: 'logic',
  logicType: 'for-each-light',
  sourceVariable: 'everyLight',
  currentLightVariable: 'currentLight',
  currentIndexVariable: 'lightIndex',
}

/** Bearing alternates per measure, so a re-fire resolves to a position the light is not at. */
const pickBearing: LogicNode = {
  id: 'pick-bearing',
  type: 'logic',
  logicType: 'select-from-list',
  list: [0, 180],
  index: { source: 'variable', name: 'measureCount' },
  assignTo: 'bearingDeg',
}

const countMeasure: LogicNode = {
  id: 'count-measure',
  type: 'logic',
  logicType: 'math',
  operator: 'add',
  left: { source: 'variable', name: 'measureCount' },
  right: { source: 'literal', value: 1 },
  assignTo: 'measureCount',
}

const positionAction: ActionNode = {
  id: 'action-pos',
  type: 'action',
  effectType: 'set-position',
  target: {
    groups: { source: 'variable', name: 'currentLight' },
    filter: { source: 'literal', value: 'all' },
  },
  position: {
    mode: 'direction',
    bearing: { source: 'variable', name: 'bearingDeg' },
    angle: { source: 'literal', value: 20 },
  },
  timing: {
    waitForCondition: { source: 'literal', value: 'none' },
    waitForTime: { source: 'literal', value: 0 },
    duration: { source: 'literal', value: MOVE_DURATION_MS },
    waitUntilCondition: { source: 'literal', value: 'measure' },
    waitUntilTime: { source: 'literal', value: 0 },
    easing: { source: 'literal', value: 'linear' },
    level: { source: 'literal', value: 1 },
  },
  layer: { source: 'literal', value: 120 },
}

const cueDefinition = (): NetMotionNodeCueDefinition => ({
  kind: 'motion',
  id: 'motion-long-move',
  name: 'Motion move longer than a measure',
  variables: [
    { name: 'everyLight', type: 'light-array', scope: 'cue', initialValue: [] },
    { name: 'currentLight', type: 'light-array', scope: 'cue', initialValue: [] },
    { name: 'lightIndex', type: 'number', scope: 'cue', initialValue: 0 },
    { name: 'bearingDeg', type: 'number', scope: 'cue', initialValue: 0 },
    { name: 'measureCount', type: 'number', scope: 'cue', initialValue: 0 },
  ],
  nodes: {
    events: [measureEvent],
    actions: [positionAction],
    logic: [allLights, forEach, pickBearing, countMeasure],
  },
  connections: [
    { from: 'ev-measure', to: 'count-measure' },
    { from: 'count-measure', to: 'all-lights' },
    { from: 'all-lights', to: 'for-each' },
    { from: 'for-each', to: 'pick-bearing', fromPort: 'each' },
    { from: 'pick-bearing', to: 'action-pos' },
  ],
  layout: { nodePositions: {} },
})

const cueData = (): CueData =>
  ({
    datagramVersion: 1,
    platform: 'Unknown',
    currentScene: 'Gameplay',
    pauseState: 'Unpaused',
    venueSize: 'Small',
    beatsPerMinute: 150,
    songSection: 'Verse',
    guitarNotes: [],
    bassNotes: [],
    drumNotes: [],
    keysNotes: [],
    vocalNote: 0,
    harmony0Note: 0,
    harmony1Note: 0,
    harmony2Note: 0,
    lightingCue: 'Chorus',
    postProcessing: 'Default',
    fogState: false,
    strobeState: 'Strobe_Off',
    performer: 1,
    keyframe: 'Off',
    bonusEffect: true,
    beat: 'Measure',
    previousCue: 'Intro',
    executionCount: 1,
    cueStartTime: monotonicNowMs() - 1000,
    timeSinceLastCue: 100,
    totalScore: 0,
  }) as unknown as CueData

describe('motion cue whose move outlasts the measure', () => {
  let harness: SequencerHarness
  let warnSpy: jest.SpiedFunction<typeof console.warn>

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 4, backCount: 4, movingHead: true })
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    harness.cleanup()
  })

  /** Runs one measure the way CueHandler does, then re-fires the cue on that same measure. */
  const runMeasure = (cue: MotionNodeCue): void => {
    harness.sequencer.onBeat()
    harness.sequencer.onMeasure()
    cue.execute(cueData(), harness.sequencer, harness.lightManager)
    harness.advanceBy(MEASURE_INTERVAL_MS)
  }

  const duplicateNameWarnings = (): string[] =>
    warnSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes('Not adding effect'))

  it('never refuses a re-fire that lands mid-move', () => {
    const cue = new MotionNodeCue(
      'motion-group',
      NodeCueCompiler.compileCue(cueDefinition(), 'yarg'),
    )

    for (let measure = 0; measure < 6; measure++) {
      runMeasure(cue)
    }

    expect(duplicateNameWarnings()).toEqual([])
  })

  it('keeps moving every light after re-fires that land mid-move', () => {
    const cue = new MotionNodeCue(
      'motion-group',
      NodeCueCompiler.compileCue(cueDefinition(), 'yarg'),
    )

    runMeasure(cue)
    const afterFirst = harness.allLightIds.map((id) => harness.getLightState(id)?.pan)

    // Three more measures, each re-firing while the previous move is still running.
    runMeasure(cue)
    runMeasure(cue)
    runMeasure(cue)
    const afterFourth = harness.allLightIds.map((id) => harness.getLightState(id)?.pan)

    expect(afterFirst.every((pan) => pan !== undefined)).toBe(true)
    expect(afterFourth).not.toEqual(afterFirst)
  })

  it('still owns every submitted effect, so stopping the cue clears layer 120', () => {
    const cue = new MotionNodeCue(
      'motion-group',
      NodeCueCompiler.compileCue(cueDefinition(), 'yarg'),
    )

    for (let measure = 0; measure < 4; measure++) {
      runMeasure(cue)
    }
    cue.onStop()

    const layer120 = harness.allLightIds.filter(
      (id) => harness.sequencer.getActiveEffectsForLight(id).get(120) !== undefined,
    )
    expect(layer120).toEqual([])
  })
})
