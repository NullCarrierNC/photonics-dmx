/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import ValueSourceEditor from './ValueSourceEditor'

function renderColour(value: string) {
  renderWithProviders(
    <ValueSourceEditor
      label="Colour"
      value={{ source: 'literal', value }}
      onChange={jest.fn()}
      expected="color"
      availableVariables={[]}
    />,
  )
}

describe('ValueSourceEditor with a constrained literal', () => {
  it('shows and flags a stored value outside its choices', () => {
    renderColour('bleu')

    expect(screen.getByRole('combobox')).toHaveProperty('value', 'bleu')
    expect(screen.getByText("'bleu' is not a known value")).toBeTruthy()
  })

  it('does not flag a value from its choices', () => {
    renderColour('blue')

    expect(screen.getByRole('combobox')).toHaveProperty('value', 'blue')
    expect(screen.queryByText(/is not a known value/)).toBeNull()
  })
})
