/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type { ValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import TargetGroupsMultiSelectEditor from './TargetGroupsMultiSelectEditor'

const variables = [
  { name: 'targetGroups', type: 'string', scope: 'cue' as const },
  { name: 'ring', type: 'light-array', scope: 'cue' as const },
  { name: 'level', type: 'number', scope: 'cue' as const },
]

function renderSource(value: ValueSource, onChange = jest.fn()) {
  renderWithProviders(
    <TargetGroupsMultiSelectEditor
      label="Target Groups"
      value={value}
      onChange={onChange}
      availableVariables={variables}
    />,
  )
  return onChange
}

const renderGroups = (value: string, onChange = jest.fn()) =>
  renderSource({ source: 'literal', value }, onChange)

const renderVariable = (name: string, onChange = jest.fn()) =>
  renderSource({ source: 'variable', name }, onChange)

const variableSelect = () => screen.getByRole<HTMLSelectElement>('combobox')

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

  it('stores no variable name when switched to variable mode', () => {
    const onChange = renderGroups('front')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Variable' }))

    expect(onChange).toHaveBeenCalledWith({ source: 'variable', name: '' })
  })

  it('stores no variable name when the empty choice is picked', () => {
    const onChange = renderVariable('targetGroups')

    fireEvent.change(variableSelect(), { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith({ source: 'variable', name: '' })
  })

  it('offers the string and light-array variables', () => {
    renderVariable('')

    expect(Array.from(variableSelect().options).map((o) => o.textContent)).toEqual([
      '-- Select --',
      'targetGroups (string)',
      'ring (light-array)',
    ])
  })

  it('flags a variable-mode field with no variable chosen', () => {
    renderVariable('')

    expect(variableSelect().getAttribute('aria-invalid')).toBe('true')
    expect(variableSelect()).toHaveAccessibleDescription('Select a variable')
  })

  it.each(['targetGroups', 'ring'])('accepts the %s variable', (name) => {
    renderVariable(name)

    expect(variableSelect()).toHaveDisplayValue(new RegExp(`^${name} `))
    expect(variableSelect().getAttribute('aria-describedby')).toBe(null)
  })

  it('shows a name no variable declares as undeclared', () => {
    renderVariable('scratch')

    expect(variableSelect()).toHaveDisplayValue('scratch (not declared)')
    expect(variableSelect().getAttribute('aria-describedby')).toBe(null)
  })

  it('warns for a declared variable of a type the groups do not take', () => {
    renderVariable('level')

    expect(variableSelect()).toHaveDisplayValue('level (wrong type)')
    expect(variableSelect().getAttribute('aria-invalid')).toBe(null)
    expect(variableSelect()).toHaveAccessibleDescription(
      "'level' is a number variable, and this field takes a string or light-array variable",
    )
  })
})
