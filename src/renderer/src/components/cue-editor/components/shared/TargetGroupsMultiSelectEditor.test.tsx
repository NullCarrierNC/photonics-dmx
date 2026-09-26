/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import TargetGroupsMultiSelectEditor from './TargetGroupsMultiSelectEditor'

function renderGroups(value: string, onChange = jest.fn()) {
  renderWithProviders(
    <TargetGroupsMultiSelectEditor
      label="Target Groups"
      value={{ source: 'literal', value }}
      onChange={onChange}
      availableVariables={[]}
    />,
  )
  return onChange
}

describe('TargetGroupsMultiSelectEditor', () => {
  it('flags a stored group name it does not know', () => {
    renderGroups('front, frnt')

    expect(screen.getByText("'frnt' is not a known LocationGroup")).toBeTruthy()
  })

  it('does not flag known groups', () => {
    renderGroups('front,back')

    expect(screen.queryByText(/is not a known LocationGroup/)).toBeNull()
  })

  it('keeps an unknown group when a known one is ticked', () => {
    const onChange = renderGroups('front, frnt')

    fireEvent.click(screen.getByRole('checkbox', { name: 'back' }))

    expect(onChange).toHaveBeenCalledWith({ source: 'literal', value: 'front,back,frnt' })
  })

  it('drops an unknown group by its own button', () => {
    const onChange = renderGroups('front, frnt')

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onChange).toHaveBeenCalledWith({ source: 'literal', value: 'front' })
  })

  it('marks the group list invalid and describes it by the flag', () => {
    renderGroups('front, frnt')

    const groups = screen.getByRole('group', { name: 'Target Groups' })
    expect(groups.getAttribute('aria-invalid')).toBe('true')
    expect(groups).toHaveAccessibleDescription(/'frnt' is not a known LocationGroup/)
  })

  it('reads blank entries between commas as nothing', () => {
    renderGroups('front,back,')

    expect(screen.getByRole('group', { name: 'Target Groups' }).getAttribute('aria-invalid')).toBe(
      null,
    )
  })
})
