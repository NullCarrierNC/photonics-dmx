import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import { CueType, defaultCueData } from '../../../../cues/types/cueTypes'
import type {
  ActionNode,
  ActionTimingConfig,
  NetEventNode,
  NetNodeCueDefinition,
  ValueSource,
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

  it('warns about a text once however often the action runs', () => {
    const cue = chain(
      setColor('red', 'red', { groups: variable('groups'), filter: literal('all') }),
    )
    for (let i = 0; i < 30; i += 1) run(cue, { groups: 'fornt' })

    expect(naming('fornt')).toHaveLength(1)
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
