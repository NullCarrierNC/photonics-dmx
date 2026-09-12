/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import ArrayReorderLogicEditor, { type ArrayReorderLogicNode } from './ArrayReorderLogicEditor'
import { LOGIC_NODE_FACTORIES } from '../../../lib/logicNodeFactories'

const variables = [
  { name: 'palette', type: 'color-array', scope: 'cue' as const },
  { name: 'ring', type: 'light-array', scope: 'cue-group' as const },
  { name: 'count', type: 'number', scope: 'cue' as const },
]

function renderEditor(logicType: ArrayReorderLogicNode['logicType']) {
  const updateNode = jest.fn()
  render(
    <ArrayReorderLogicEditor
      node={LOGIC_NODE_FACTORIES[logicType]('n1') as ArrayReorderLogicNode}
      availableVariables={variables}
      updateNode={updateNode}
    />,
  )
  const [source, assignTo] = screen.getAllByRole('combobox') as HTMLSelectElement[]
  return { updateNode, source, assignTo }
}

const optionTexts = (select: HTMLSelectElement) =>
  Array.from(select.options).map((option) => option.textContent)

describe('ArrayReorderLogicEditor', () => {
  it.each([
    ['reverse-colors', 'color-array', 'palette (cue)'],
    ['shuffle-colors', 'color-array', 'palette (cue)'],
    ['reverse-lights', 'light-array', 'ring (cue-group)'],
    ['shuffle-lights', 'light-array', 'ring (cue-group)'],
  ] as const)('%s reads and writes %s variables only', (logicType, arrayType, option) => {
    const { source, assignTo } = renderEditor(logicType)
    expect(screen.queryByText(`Source Variable (${arrayType})`)).not.toBeNull()
    expect(optionTexts(source)).toEqual([`-- Select ${arrayType} --`, option])
    expect(optionTexts(assignTo)).toEqual(['-- Select variable --', option])
  })

  it('sends the chosen source and target to updateNode', () => {
    const { updateNode, source, assignTo } = renderEditor('shuffle-lights')
    fireEvent.change(source, { target: { value: 'ring' } })
    fireEvent.change(assignTo, { target: { value: 'ring' } })
    expect(updateNode.mock.calls).toEqual([[{ sourceVariable: 'ring' }], [{ assignTo: 'ring' }]])
  })
})
