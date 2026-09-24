import { describe, expect, it } from '@jest/globals'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import type {
  ActionNode,
  Connection,
  EventListenerNode,
  EventRaiserNode,
  LogicNode,
  NetNodeCueDefinition,
  YargEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { createDefaultActionTiming } from '../../../../cues/types/nodeCueTypes'

const listener = (id: string, eventName: string): EventListenerNode => ({
  id,
  type: 'event-listener',
  eventName,
})
const raiser = (id: string, eventName: string): EventRaiserNode => ({
  id,
  type: 'event-raiser',
  eventName,
})
const action = (id: string, waitUntil = 'none'): ActionNode => ({
  id,
  type: 'action',
  effectType: 'set-color',
  target: {
    groups: { source: 'literal', value: 'front' },
    filter: { source: 'literal', value: 'all' },
  },
  color: {
    name: { source: 'literal', value: 'red' },
    brightness: { source: 'literal', value: 'high' },
  },
  timing: {
    ...createDefaultActionTiming(),
    waitUntilCondition: { source: 'literal', value: waitUntil },
  },
})
const delay = (id: string): LogicNode =>
  ({
    id,
    type: 'logic',
    logicType: 'delay',
    delayTime: { source: 'literal', value: 100 },
  }) as LogicNode

function compileCueWith(
  nodes: {
    actions?: ActionNode[]
    logic?: LogicNode[]
    eventRaisers: EventRaiserNode[]
    eventListeners: EventListenerNode[]
  },
  connections: Connection[],
  eventNames: string[],
): void {
  const definition = {
    id: 'loop-cue',
    name: 'Loop Cue',
    kind: 'lighting',
    cueType: 'Verse',
    style: 'primary',
    nodes: {
      events: [{ id: 'ev', type: 'event', eventType: 'beat' }],
      actions: nodes.actions ?? [],
      logic: nodes.logic ?? [],
      eventRaisers: nodes.eventRaisers,
      eventListeners: nodes.eventListeners,
    },
    connections: [{ from: 'ev', to: 'kick' }, ...connections],
    events: eventNames.map((name) => ({ name })),
  } as unknown as NetNodeCueDefinition
  NodeCueCompiler.compileCue(definition, 'yarg')
}

describe('event raise loops', () => {
  it('rejects a listener that raises its own event straight away', () => {
    expect(() =>
      compileCueWith(
        {
          eventRaisers: [raiser('kick', 'ping'), raiser('again', 'ping')],
          eventListeners: [listener('on-ping', 'ping')],
        },
        [{ from: 'on-ping', to: 'again' }],
        ['ping'],
      ),
    ).toThrow(/raises its own event 'ping'/)
  })

  it('rejects the loop through an action that does not wait', () => {
    expect(() =>
      compileCueWith(
        {
          actions: [action('paint')],
          eventRaisers: [raiser('kick', 'ping'), raiser('again', 'ping')],
          eventListeners: [listener('on-ping', 'ping')],
        },
        [
          { from: 'on-ping', to: 'paint' },
          { from: 'paint', to: 'again' },
        ],
        ['ping'],
      ),
    ).toThrow(/raises its own event 'ping'/)
  })

  it('rejects two listeners that raise each other', () => {
    expect(() =>
      compileCueWith(
        {
          eventRaisers: [
            raiser('kick', 'ping'),
            raiser('to-pong', 'pong'),
            raiser('to-ping', 'ping'),
          ],
          eventListeners: [listener('on-ping', 'ping'), listener('on-pong', 'pong')],
        },
        [
          { from: 'on-ping', to: 'to-pong' },
          { from: 'on-pong', to: 'to-ping' },
        ],
        ['ping', 'pong'],
      ),
    ).toThrow(/raises its own event/)
  })

  it.each([
    ['a delay', { logic: [delay('wait')] }, 'wait'],
    ['an action that waits', { actions: [action('hold', 'beat')] }, 'hold'],
  ])('accepts the loop through %s', (_, extra, betweenId) => {
    expect(() =>
      compileCueWith(
        {
          ...extra,
          eventRaisers: [raiser('kick', 'ping'), raiser('again', 'ping')],
          eventListeners: [listener('on-ping', 'ping')],
        },
        [
          { from: 'on-ping', to: betweenId },
          { from: betweenId, to: 'again' },
        ],
        ['ping'],
      ),
    ).not.toThrow()
  })

  it('rejects the same loop in an effect', () => {
    const definition = {
      id: 'loop-effect',
      name: 'Loop Effect',
      mode: 'yarg',
      nodes: {
        events: [],
        actions: [],
        eventRaisers: [raiser('kick', 'ping'), raiser('again', 'ping')],
        eventListeners: [listener('on-ping', 'ping')],
        effectListeners: [{ id: 'entry', type: 'effect-listener' }],
      },
      connections: [
        { from: 'entry', to: 'kick' },
        { from: 'on-ping', to: 'again' },
      ],
      events: [{ name: 'ping' }],
    } as unknown as YargEffectDefinition
    expect(() => EffectCompiler.compile(definition)).toThrow(/raises its own event 'ping'/)
  })
})
