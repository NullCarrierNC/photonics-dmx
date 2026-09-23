/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react'
import LogicNode from './LogicNode'
import type { LogicNode as LogicNodeDefinition } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

jest.mock('reactflow', () => ({
  Handle: ({ id }: { id?: string }) => <i data-handle={id ?? 'out'} />,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}))

const literal = (value: unknown) => ({ source: 'literal', value })
const variable = (name: string) => ({ source: 'variable', name })

function renderNode(payload: Record<string, unknown>) {
  const node = { id: 'n1', type: 'logic', ...payload } as unknown as LogicNodeDefinition
  const { container } = render(
    <LogicNode
      id="n1"
      type="logic"
      data={{ kind: 'logic', label: 'Node', payload: node }}
      selected={false}
      zIndex={0}
      isConnectable={false}
      xPos={0}
      yPos={0}
      dragging={false}
    />,
  )
  const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim()
  const frame = container.firstElementChild as HTMLElement
  const handles = Array.from(container.querySelectorAll('[data-handle]')).map((el) =>
    el.getAttribute('data-handle'),
  )
  return { text, frame, handles }
}

describe('LogicNode summary', () => {
  it.each<[string, Record<string, unknown>, string[]]>([
    [
      'variable',
      { logicType: 'variable', mode: 'set', varName: 'x', value: literal(5) },
      ['SET x = 5'],
    ],
    [
      'math',
      {
        logicType: 'math',
        operator: 'add',
        left: literal(1),
        right: variable('y'),
        assignTo: 'z',
      },
      ['ADD: 1 + y', 'To Var: z'],
    ],
    [
      'expression',
      { logicType: 'expression', expression: 'a + b', assignTo: 'c' },
      ['a + b', 'To Var: c'],
    ],
    ['frame gate', { logicType: 'frame-gate', divisor: literal(4) }, ['Every 4 frames']],
    [
      'tempo',
      { logicType: 'tempo', assignBeatMs: 'beat', assignBarMs: 'bar' },
      ['TEMPO', 'beat → beat', 'bar → bar'],
    ],
    [
      'indexed get',
      {
        logicType: 'indexed-variable',
        mode: 'get',
        varName: 'cells',
        index: literal(2),
        assignTo: 'c',
      },
      ['GET cells#2', 'To Var: c'],
    ],
    [
      'led changed',
      { logicType: 'led-changed', assignIndex: 'i', assignColor: 'col' },
      ['LED CHANGED', 'index → i', 'colour → col'],
    ],
    [
      'conditional',
      { logicType: 'conditional', left: variable('a'), comparator: '>', right: literal(3) },
      ['IF a > 3'],
    ],
    [
      'cue data',
      { logicType: 'cue-data', dataProperty: 'bpm', assignTo: 'b' },
      ['bpm', 'To Var: b'],
    ],
    [
      'config data',
      { logicType: 'config-data', dataProperty: 'lights', assignTo: 'l' },
      ['Assign: lights', 'To Var: l'],
    ],
    [
      'lights from index',
      { logicType: 'lights-from-index', sourceVariable: 'all', index: literal(1), assignTo: 'one' },
      ['all[1]', 'To Var: one'],
    ],
    [
      'colour from index',
      { logicType: 'color-from-index', colors: variable('pal'), index: literal(0), assignTo: 'c' },
      ['[pal][0]', 'To Var: c'],
    ],
    [
      'reverse colours',
      { logicType: 'reverse-colors', sourceVariable: 'pal', assignTo: 'r' },
      ['REVERSE pal', 'To Var: r'],
    ],
    [
      'concat colours',
      { logicType: 'concat-colors', sourceVariables: ['a', 'b'], assignTo: 'c' },
      ['CONCAT 2 PALETTES', 'a + b', 'To Var: c'],
    ],
    ['shuffle colours', { logicType: 'shuffle-colors', sourceVariable: 'pal' }, ['SHUFFLE pal']],
    [
      'array length',
      { logicType: 'array-length', sourceVariable: 'arr', assignTo: 'n' },
      ['LENGTH OF arr', 'To Var: n'],
    ],
    ['reverse lights', { logicType: 'reverse-lights' }, ['REVERSE ?']],
    [
      'create pairs',
      { logicType: 'create-pairs', pairType: 'adjacent', sourceVariable: 'all', assignTo: 'p' },
      ['ADJACENT PAIRS', 'FROM: all', 'To Var: p'],
    ],
    ['build ring', { logicType: 'build-ring', assignTo: 'ring' }, ['Ring → ring', 'Size → ?']],
    [
      'concat lights',
      { logicType: 'concat-lights', sourceVariables: ['a', 'b', 'c'] },
      ['CONCAT 3 ARRAYS', 'a + b + c'],
    ],
    [
      'shuffle lights',
      { logicType: 'shuffle-lights', sourceVariable: 'all', assignTo: 's' },
      ['SHUFFLE all', 'To Var: s'],
    ],
    [
      'for each light',
      {
        logicType: 'for-each-light',
        sourceVariable: 'all',
        currentLightVariable: 'light',
        currentIndexVariable: 'i',
        groupSize: literal(2),
      },
      ['FOR EACH all', 'Light → light Index → i', 'Group size → 2'],
    ],
    ['delay', { logicType: 'delay', delayTime: literal(250) }, ['250ms']],
    [
      'random integer',
      {
        logicType: 'random',
        mode: 'random-integer',
        min: literal(1),
        max: literal(6),
        assignTo: 'd',
      },
      ['int [1..6] → d'],
    ],
    [
      'random choice',
      { logicType: 'random', mode: 'random-choice', choices: ['a', 'b', 'c'], assignTo: 'c' },
      ['choice (3 options) → c'],
    ],
    [
      'debugger',
      { logicType: 'debugger', message: literal('hi'), variablesToLog: [] },
      ['Message: hi', 'Vars: none'],
    ],
    ['a type with no summary of its own', { logicType: 'clamp' }, ['clamp']],
  ])('%s', (_name, payload, expected) => {
    const { text } = renderNode(payload)
    for (const part of expected) {
      expect(text).toContain(part)
    }
  })
})

describe('LogicNode ports and colours', () => {
  it('gives a conditional true and false ports', () => {
    const { text, handles } = renderNode({
      logicType: 'conditional',
      left: literal(1),
      comparator: '==',
      right: literal(1),
    })
    expect(handles).toEqual(['out', 'true', 'false'])
    expect(text).toContain('true')
    expect(text).toContain('false')
  })

  it('gives a for-each node each and done ports', () => {
    const { handles } = renderNode({ logicType: 'for-each-light', sourceVariable: 'all' })
    expect(handles).toEqual(['out', 'each', 'done'])
  })

  it('gives any other node one output', () => {
    expect(renderNode({ logicType: 'delay', delayTime: literal(1) }).handles).toEqual([
      'out',
      'out',
    ])
  })

  it.each([
    ['debugger', 'border-red-400'],
    ['array-length', 'border-teal-400'],
    ['cue-data', 'border-orange-800'],
    ['math', 'border-amber-400'],
  ])('colours a %s node by its category', (logicType, border) => {
    const { frame } = renderNode({
      logicType,
      left: literal(1),
      right: literal(1),
      operator: 'add',
    })
    expect(frame.className).toContain(border)
  })
})
