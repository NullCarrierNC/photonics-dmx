/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type { ConditionalLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ConditionalLogicEditor from './ConditionalLogicEditor'

const variables = [
  { name: 'allLights', type: 'light-array', scope: 'cue' as const },
  { name: 'level', type: 'number', scope: 'cue' as const },
]

function renderCompare(leftName: string) {
  const node: ConditionalLogicNode = {
    id: 'gate',
    type: 'logic',
    logicType: 'conditional',
    comparator: '>',
    left: { source: 'variable', name: leftName },
    right: { source: 'literal', value: 0 },
  }
  renderWithProviders(
    <ConditionalLogicEditor node={node} availableVariables={variables} updateNode={jest.fn()} />,
  )
}

describe('ConditionalLogicEditor', () => {
  it('warns that an array variable compares as 0', () => {
    renderCompare('allLights')

    expect(screen.getByRole('combobox', { name: 'Left variable' })).toHaveAccessibleDescription(
      /'allLights' is a light-array variable, which a compare reads as 0/,
    )
  })

  it('does not warn about a number variable', () => {
    renderCompare('level')

    expect(
      screen.getByRole('combobox', { name: 'Left variable' }),
    ).not.toHaveAccessibleDescription()
  })
})
