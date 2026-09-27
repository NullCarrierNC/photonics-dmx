/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { LOGIC_NODE_FACTORIES } from '../../../lib/logicNodeFactories'
import type { LogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ClampLogicEditor from './ClampLogicEditor'
import ConfigDataLogicEditor from './ConfigDataLogicEditor'
import CueDataLogicEditor from './CueDataLogicEditor'
import ExpressionLogicEditor from './ExpressionLogicEditor'
import MathLogicEditor from './MathLogicEditor'
import PulseLogicEditor from './PulseLogicEditor'
import VariableLogicEditor from './VariableLogicEditor'
import SelectFromListLogicEditor from './SelectFromListLogicEditor'
import ArrayLengthLogicEditor from './ArrayLengthLogicEditor'
import ArrayReorderLogicEditor from './ArrayReorderLogicEditor'
import BuildRingLogicEditor from './BuildRingLogicEditor'
import ColorFromIndexLogicEditor from './ColorFromIndexLogicEditor'
import ConcatArraysLogicEditor from './ConcatArraysLogicEditor'
import CreatePairsLogicEditor from './CreatePairsLogicEditor'
import ForEachLightLogicEditor from './ForEachLightLogicEditor'
import LightsFromIndexLogicEditor from './LightsFromIndexLogicEditor'
import RandomLogicEditor from './RandomLogicEditor'

const variables = [
  { name: 'level', type: 'number', scope: 'cue' as const },
  { name: 'ring', type: 'light-array', scope: 'cue-group' as const },
]

type AnyEditor = React.FC<{
  node: LogicNode
  availableVariables: typeof variables
  updateNode: (updates: Partial<LogicNode>) => void
  activeMode: 'yarg'
}>

function renderEditor(
  Editor: unknown,
  logicType: LogicNode['logicType'],
  fields: Record<string, unknown> = {},
) {
  const updateNode = jest.fn()
  const Component = Editor as AnyEditor
  render(
    <Component
      node={Object.assign(LOGIC_NODE_FACTORIES[logicType]('n1'), fields)}
      availableVariables={variables}
      updateNode={updateNode}
      activeMode="yarg"
    />,
  )
  return updateNode
}

const selectLabelled = (label: string | RegExp) => screen.getByLabelText(label) as HTMLSelectElement

describe('logic editor variable selects', () => {
  it.each([
    [ClampLogicEditor, 'clamp', 'Assign To', 'assignTo'],
    [ExpressionLogicEditor, 'expression', 'Assign To', 'assignTo'],
    [
      PulseLogicEditor,
      'pulse',
      'Anchor Variable (holds the cycle origin; resets each activation)',
      'anchorVar',
    ],
    [PulseLogicEditor, 'pulse', 'Assign Index To (integer cycles since anchor)', 'assignTo'],
    [VariableLogicEditor, 'variable', 'Variable Name', 'varName'],
  ] as const)(
    '%p %s offers each variable for %s and writes %s',
    (Editor, logicType, label, field) => {
      const updateNode = renderEditor(Editor, logicType)
      const select = selectLabelled(label)

      expect(
        Array.from(select.options)
          .slice(1)
          .filter((o) => !o.disabled)
          .map((o) => o.textContent),
      ).toEqual(['level (number, cue)', 'ring (light-array, cue-group)'])
      fireEvent.change(select, { target: { value: 'level' } })
      expect(updateNode).toHaveBeenLastCalledWith({ [field]: 'level' })
    },
  )

  it.each([
    [MathLogicEditor, 'math', 'Assign To (optional)', 'assignTo'],
    [PulseLogicEditor, 'pulse', /^Assign Phase To \(optional/, 'assignPhase'],
    [CueDataLogicEditor, 'cue-data', 'Assign To Variable (optional)', 'assignTo'],
    [ConfigDataLogicEditor, 'config-data', 'Assign To Variable (optional)', 'assignTo'],
  ] as const)('%p %s clears the optional %s to undefined', (Editor, logicType, label, field) => {
    const updateNode = renderEditor(Editor, logicType)
    const select = selectLabelled(label)

    fireEvent.change(select, { target: { value: 'ring' } })
    expect(updateNode).toHaveBeenLastCalledWith({ [field]: 'ring' })
    fireEvent.change(select, { target: { value: '' } })
    expect(updateNode).toHaveBeenLastCalledWith({ [field]: undefined })
  })

  it('shows the variable a new Math node writes, which no variable declares', () => {
    renderEditor(MathLogicEditor, 'math')

    expect(selectLabelled('Assign To (optional)')).toHaveDisplayValue('result (not declared here)')
  })

  it.each([
    [ForEachLightLogicEditor, 'for-each-light', 'Source Variable (light-array)', 'sourceVariable'],
    [
      ForEachLightLogicEditor,
      'for-each-light',
      /^Current Light Variable \(light-array\)/,
      'currentLightVariable',
    ],
    [BuildRingLogicEditor, 'build-ring', 'Ring (light-array variable)', 'assignTo'],
    [CreatePairsLogicEditor, 'create-pairs', 'Source Variable (light-array)', 'sourceVariable'],
    [CreatePairsLogicEditor, 'create-pairs', 'Assign To (light-array variable)', 'assignTo'],
    [
      LightsFromIndexLogicEditor,
      'lights-from-index',
      'Source Variable (light-array)',
      'sourceVariable',
    ],
    [LightsFromIndexLogicEditor, 'lights-from-index', 'Assign To', 'assignTo'],
    [
      ArrayLengthLogicEditor,
      'array-length',
      'Source Variable (light-array or color-array)',
      'sourceVariable',
    ],
    [ColorFromIndexLogicEditor, 'color-from-index', 'Assign To (colour variable)', 'assignTo'],
    [ConcatArraysLogicEditor, 'concat-lights', 'Assign To (light-array variable)', 'assignTo'],
    [ArrayReorderLogicEditor, 'reverse-lights', 'Source Variable (light-array)', 'sourceVariable'],
    [ArrayReorderLogicEditor, 'reverse-lights', 'Assign To (light-array variable)', 'assignTo'],
  ] as const)(
    '%p %s names the type of a declared number variable in %s',
    (Editor, logicType, label, field) => {
      renderEditor(Editor, logicType, { [field]: 'level' })

      expect(selectLabelled(label)).toHaveDisplayValue('level (number, does not fit this field)')
    },
  )

  it.each([
    [
      ForEachLightLogicEditor,
      'for-each-light',
      'Current Index Variable (number)',
      'currentIndexVariable',
    ],
    [BuildRingLogicEditor, 'build-ring', 'Group Size (number variable)', 'assignGroupSize'],
    [ArrayLengthLogicEditor, 'array-length', 'Assign To (number variable)', 'assignTo'],
  ] as const)(
    '%p %s names the type of a declared light-array variable in %s',
    (Editor, logicType, label, field) => {
      renderEditor(Editor, logicType, { [field]: 'ring' })

      expect(selectLabelled(label)).toHaveDisplayValue(
        'ring (light-array, does not fit this field)',
      )
    },
  )

  it('names the type of a declared variable in the random light source', () => {
    renderEditor(RandomLogicEditor, 'random', { mode: 'random-light', sourceVariable: 'level' })

    expect(selectLabelled('Source Variable (light-array)')).toHaveDisplayValue(
      'level (number, does not fit this field)',
    )
  })

  it('offers only the variables of the types a field takes', () => {
    renderEditor(ForEachLightLogicEditor, 'for-each-light')

    expect(
      Array.from(selectLabelled('Source Variable (light-array)').options).map((o) => o.textContent),
    ).toEqual(['-- Select light-array --', 'ring (cue-group)'])
  })

  it('shows a name no variable declares as undeclared in a typed field', () => {
    renderEditor(ForEachLightLogicEditor, 'for-each-light', { sourceVariable: 'scratch' })

    expect(selectLabelled('Source Variable (light-array)')).toHaveDisplayValue(
      'scratch (not declared here)',
    )
  })

  it('keeps the lower-case placeholder on Select From List', () => {
    renderEditor(SelectFromListLogicEditor, 'select-from-list')

    expect(Array.from(selectLabelled('Assign To').options)[0].textContent).toBe(
      '-- select variable --',
    )
  })
})
