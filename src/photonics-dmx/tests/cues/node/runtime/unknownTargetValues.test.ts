import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine'
import { LightingNodeCue } from '../../../../cues/node/runtime/LightingNodeCue'
import { AudioNodeCue } from '../../../../cues/node/runtime/AudioNodeCue'
import { DEFAULT_AUDIO_CONFIG } from '../../../../listeners/Audio/AudioConfig'
import type { AudioCueData } from '../../../../cues/types/audioCueTypes'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import { CueType, defaultCueData } from '../../../../cues/types/cueTypes'
import type {
  ActionNode,
  ActionTimingConfig,
  AudioEventNode,
  AudioEventNodeUnion,
  AudioLightingNodeCueDefinition,
  NetEventNode,
  NetNodeCueDefinition,
  ValueSource,
  YargEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'
import { createSequencerHarness, type SequencerHarness } from '../../../helpers/sequencerHarness'
import { resetLogConfiguration, setLogSink, setMinLogLevel } from '../../../../../shared/logger'

const start: NetEventNode = { id: 'start', type: 'event', eventType: 'beat' }
const literal = (value: string | number): ValueSource => ({ source: 'literal', value })
const variable = (name: string): ValueSource => ({ source: 'variable', name })

const setColor = (
  id: string,
  color: string,
  target: { groups: ValueSource; filter: ValueSource },
  timing: Partial<ActionTimingConfig> = {},
): ActionNode => ({
  id,
  type: 'action',
  effectType: 'set-color',
  target,
  color: {
    name: literal(color),
    brightness: literal('high'),
    blendMode: literal('replace'),
  },
  timing: {
    waitForCondition: literal('none'),
    waitForTime: literal(0),
    duration: literal(0),
    waitUntilCondition: literal('none'),
    waitUntilTime: literal(0),
    ...timing,
  },
})

/** A cue that runs its actions one after another from its start event. */
const chain = (...actions: ActionNode[]): NetNodeCueDefinition => ({
  id: 'unknown-values',
  name: 'Unknown values',
  kind: 'lighting',
  cueType: CueType.Default,
  style: 'primary',
  nodes: { events: [start], actions, logic: [] },
  connections: actions.map((action, i) => ({
    from: i === 0 ? start.id : actions[i - 1].id,
    to: action.id,
  })),
})

let harness: SequencerHarness
let warnings: string[]

beforeEach(() => {
  harness = createSequencerHarness({ frontCount: 4, backCount: 2 })
  warnings = []
  setMinLogLevel('debug')
  setLogSink((entry) => {
    if (entry.level === 'warn') warnings.push(entry.message)
  })
})

afterEach(() => {
  harness.cleanup()
  resetLogConfiguration()
})

/** Runs the cue once with its string variables holding `values`, then advances one tick. */
const run = (definition: NetNodeCueDefinition, values: Record<string, string>): void => {
  const cueStore = new Map<string, VariableValue>(
    Object.entries(values).map(([name, value]) => [name, { type: 'string', value }]),
  )
  new NodeExecutionEngine(
    NodeCueCompiler.compileCue<NetEventNode>(definition, 'yarg'),
    'test-group:unknown-values',
    harness.sequencer,
    harness.lightManager,
    noopRuntimeBroadcaster(),
    cueStore,
    new Map(),
    new EffectRegistry(),
  ).startExecution(start, { ...defaultCueData, lightingCue: CueType.Default })
  harness.advanceBy(1)
}

const lit = (ids: string[]): string[] =>
  ids.filter((id) => (harness.getLightState(id)?.intensity ?? 0) > 0)
const naming = (text: string): string[] => warnings.filter((w) => w.includes(`"${text}"`))

describe('a group name held in a variable', () => {
  it('lights nothing for text naming no group, and the next action runs at once', () => {
    run(
      chain(
        setColor('red-front', 'red', { groups: variable('groups'), filter: literal('all') }),
        setColor('blue-back', 'blue', { groups: literal('back'), filter: literal('all') }),
      ),
      { groups: 'frnt' },
    )

    expect(lit(harness.frontLightIds)).toEqual([])
    expect(lit(harness.backLightIds)).toEqual(harness.backLightIds)
    expect(naming('frnt')).toHaveLength(1)
  })
})

describe('a light filter held in a variable', () => {
  it('lights every light of the groups for text naming no filter, and warns', () => {
    run(chain(setColor('red', 'red', { groups: variable('groups'), filter: variable('filter') })), {
      groups: 'front',
      filter: 'evens',
    })

    expect(lit(harness.frontLightIds)).toEqual(harness.frontLightIds)
    expect(naming('evens')).toHaveLength(1)
  })

  it('filters literal groups', () => {
    run(chain(setColor('red', 'red', { groups: literal('front'), filter: variable('filter') })), {
      filter: 'odd',
    })

    expect(lit(harness.frontLightIds)).toEqual(['front-1', 'front-3'])
  })
})

describe('a wait condition held in a variable', () => {
  it('starts at once for text naming no condition, and warns', () => {
    run(
      chain(
        setColor(
          'red',
          'red',
          { groups: literal('front'), filter: literal('all') },
          { waitForCondition: variable('wait') },
        ),
      ),
      { wait: 'beet' },
    )

    expect(lit(harness.frontLightIds)).toEqual(harness.frontLightIds)
    expect(naming('beet')).toHaveLength(1)
  })

  it('holds for nothing on text naming no condition, and warns', () => {
    run(
      chain(
        setColor(
          'red-front',
          'red',
          { groups: literal('front'), filter: literal('all') },
          { waitUntilCondition: variable('wait') },
        ),
        setColor('blue-back', 'blue', { groups: literal('back'), filter: literal('all') }),
      ),
      { wait: 'dealy' },
    )

    expect(lit(harness.backLightIds)).toEqual(harness.backLightIds)
    expect(naming('dealy')).toHaveLength(1)
  })
})

const cueStarted: NetEventNode = { id: 'cue-start', type: 'event', eventType: 'cue-started' }

/** A loaded lighting cue whose one action reads its groups from a variable holding `text`. */
const loadedCue = (groupId: string, text: string): LightingNodeCue =>
  new LightingNodeCue(
    groupId,
    NodeCueCompiler.compileCue<NetEventNode>(
      {
        ...chain(setColor('red', 'red', { groups: variable('groups'), filter: literal('all') })),
        variables: [{ name: 'groups', type: 'string', scope: 'cue', initialValue: text }],
        nodes: {
          events: [cueStarted],
          actions: [setColor('red', 'red', { groups: variable('groups'), filter: literal('all') })],
          logic: [],
        },
        connections: [{ from: cueStarted.id, to: 'red' }],
      },
      'yarg',
    ),
  )

/** Calls the cue, lets it run, and stops it. */
const activate = (cue: LightingNodeCue): void => {
  cue.execute(
    { ...defaultCueData, lightingCue: CueType.Default },
    harness.sequencer,
    harness.lightManager,
  )
  harness.advanceBy(1)
  cue.onStop()
}

const energyEvent: AudioEventNode = {
  id: 'energy',
  type: 'event',
  eventType: 'audio-energy',
  threshold: 0.1,
  triggerMode: 'level',
}

/** A loaded audio cue whose level-held action reads its groups from a variable holding `text`. */
const loadedAudioCue = (groupId: string, text: string): AudioNodeCue => {
  const definition: AudioLightingNodeCueDefinition = {
    kind: 'lighting',
    id: 'held-groups',
    cueTypeId: 'held-groups',
    name: 'Held groups',
    style: 'secondary',
    variables: [{ name: 'groups', type: 'string', scope: 'cue', initialValue: text }],
    nodes: {
      events: [energyEvent],
      actions: [setColor('red', 'red', { groups: variable('groups'), filter: literal('all') })],
      logic: [],
    },
    connections: [{ from: energyEvent.id, to: 'red' }],
  }
  return new AudioNodeCue(
    groupId,
    NodeCueCompiler.compileCue<AudioEventNodeUnion>(definition, 'audio'),
  )
}

/** An effect whose action lights the groups its `groups` parameter names. */
const groupsEffect: YargEffectDefinition = {
  id: 'groups-effect',
  mode: 'yarg',
  name: 'Groups effect',
  variables: [
    { name: 'groups', type: 'string', scope: 'cue', initialValue: 'front', isParameter: true },
  ],
  nodes: {
    events: [],
    actions: [setColor('paint', 'red', { groups: variable('groups'), filter: literal('all') })],
    logic: [],
    effectListeners: [{ id: 'entry', type: 'effect-listener', label: 'Entry', outputs: [] }],
  },
  connections: [{ from: 'entry', to: 'paint' }],
}

/** A loaded lighting cue raising the groups effect with its groups parameter set to `text`. */
const raisingCue = (groupId: string, text: string): LightingNodeCue => {
  const effects = new EffectRegistry()
  effects.registerEffect(groupsEffect.id, EffectCompiler.compile(groupsEffect))
  const definition: NetNodeCueDefinition = {
    ...chain(),
    nodes: {
      events: [cueStarted],
      actions: [],
      logic: [],
      effectRaisers: [
        {
          id: 'raise',
          type: 'effect-raiser',
          effectId: groupsEffect.id,
          parameterValues: { groups: literal(text) },
        },
      ],
    },
    connections: [{ from: cueStarted.id, to: 'raise' }],
  }
  return new LightingNodeCue(
    groupId,
    NodeCueCompiler.compileCue<NetEventNode>(definition, 'yarg'),
    effects,
  )
}

const loudFrame: AudioCueData = {
  timestamp: 0,
  executionCount: 1,
  audioData: { timestamp: 0, overallLevel: 0.8, bpm: 120, beatDetected: false, energy: 0.8 },
  config: DEFAULT_AUDIO_CONFIG,
  enabledBandCount: 0,
}

describe('warnings for each loaded cue', () => {
  it('warns about a text once across every activation of a cue', () => {
    const cue = loadedCue('group-a', 'fornt')
    for (let i = 0; i < 30; i += 1) activate(cue)

    expect(naming('fornt')).toHaveLength(1)
  })

  it('warns once for each loaded cue that reads the same unknown text', () => {
    activate(loadedCue('group-a', 'bakc'))
    activate(loadedCue('group-b', 'bakc'))

    expect(naming('bakc')).toHaveLength(2)
  })

  it('warns again when the cue is loaded afresh', () => {
    activate(loadedCue('group-a', 'frnot'))
    activate(loadedCue('group-a', 'frnot'))

    expect(naming('frnot')).toHaveLength(2)
  })

  it('warns about a new text however many other texts cues have reported', () => {
    for (let i = 0; i < 300; i += 1) activate(loadedCue('group-a', `unknown-${i}`))
    activate(loadedCue('group-b', 'strob'))

    expect(naming('strob')).toHaveLength(1)
  })

  it('warns once for each loaded cue raising an effect that reads the same unknown text', () => {
    const first = raisingCue('group-a', 'bck')
    const second = raisingCue('group-b', 'bck')
    for (let i = 0; i < 30; i += 1) {
      activate(first)
      activate(second)
    }

    expect(naming('bck')).toHaveLength(2)
  })

  it('warns once for each loaded audio cue that reads the same unknown text', async () => {
    const first = loadedAudioCue('audio-a', 'fron')
    const second = loadedAudioCue('audio-b', 'fron')
    for (let i = 0; i < 30; i += 1) {
      await first.execute(loudFrame, harness.sequencer, harness.lightManager)
      await second.execute(loudFrame, harness.sequencer, harness.lightManager)
    }

    expect(naming('fron')).toHaveLength(2)
  })
})
