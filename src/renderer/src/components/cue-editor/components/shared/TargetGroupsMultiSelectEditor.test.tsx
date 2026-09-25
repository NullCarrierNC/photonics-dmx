/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import TargetGroupsMultiSelectEditor from './TargetGroupsMultiSelectEditor'

function renderGroups(value: string) {
  renderWithProviders(
    <TargetGroupsMultiSelectEditor
      label="Target Groups"
      value={{ source: 'literal', value }}
      onChange={jest.fn()}
      availableVariables={[]}
    />,
  )
}

describe('TargetGroupsMultiSelectEditor', () => {
  it('flags a stored group name it does not know', () => {
    renderGroups('front, frnt')

    expect(screen.getByText("'frnt' is not a known group")).toBeTruthy()
  })

  it('does not flag known groups', () => {
    renderGroups('front,back')

    expect(screen.queryByText(/is not a known group/)).toBeNull()
  })
})
