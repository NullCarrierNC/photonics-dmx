/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import ConcatArraysLogicEditor, { type ConcatArraysLogicNode } from './ConcatArraysLogicEditor'
import { LOGIC_NODE_FACTORIES } from '../../../lib/logicNodeFactories'

const variables = [
  { name: 'warm', type: 'color-array', scope: 'cue' as const },
  { name: 'cool', type: 'color-array', scope: 'cue-group' as const },
  { name: 'ring', type: 'light-array', scope: 'cue' as const },
]

function renderEditor(
  logicType: ConcatArraysLogicNode['logicType'],
  sourceVariables: string[] = [],
) {
  const updateNode = jest.fn()
  const node = {
    ...(LOGIC_NODE_FACTORIES[logicType]('n1') as ConcatArraysLogicNode),
    sourceVariables,
  }
  render(
    <ConcatArraysLogicEditor node={node} availableVariables={variables} updateNode={updateNode} />,
  )
  const [addSource, assignTo] = screen.getAllByRole('combobox') as HTMLSelectElement[]
  return { updateNode, addSource, assignTo }
}

const optionTexts = (select: HTMLSelectElement) =>
  Array.from(select.options).map((option) => option.textContent)

describe('ConcatArraysLogicEditor', () => {
  it.each([
    [
      'concat-colors',
      'Source Palettes (color-array)',
      '-- Add color-array --',
      ['warm (cue)', 'cool (cue-group)'],
    ],
    ['concat-lights', 'Source Arrays (light-array)', '-- Add light-array --', ['ring (cue)']],
  ] as const)('%s offers its own array type', (logicType, label, placeholder, options) => {
    const { addSource, assignTo } = renderEditor(logicType)
    expect(screen.queryByText(label)).not.toBeNull()
    expect(optionTexts(addSource)).toEqual([placeholder, ...options])
    expect(optionTexts(assignTo)).toEqual(['-- Select variable --', ...options])
  })

  it('appends a picked source and leaves picked ones out of the list', () => {
    const { updateNode, addSource } = renderEditor('concat-colors', ['warm'])
    expect(optionTexts(addSource)).toEqual(['-- Add color-array --', 'cool (cue-group)'])
    fireEvent.change(addSource, { target: { value: 'cool' } })
    expect(updateNode).toHaveBeenCalledWith({ sourceVariables: ['warm', 'cool'] })
  })

  it('removes a source', () => {
    const { updateNode } = renderEditor('concat-lights', ['ring'])
    fireEvent.click(screen.getByText('×'))
    expect(updateNode).toHaveBeenCalledWith({ sourceVariables: [] })
  })
})
