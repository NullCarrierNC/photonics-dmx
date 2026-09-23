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

function renderEditor(Editor: unknown, logicType: LogicNode['logicType']) {
  const updateNode = jest.fn()
  const Component = Editor as AnyEditor
  render(
    <Component
      node={LOGIC_NODE_FACTORIES[logicType]('n1')}
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
})
