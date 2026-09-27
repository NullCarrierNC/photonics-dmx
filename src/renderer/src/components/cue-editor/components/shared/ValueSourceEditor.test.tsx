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

describe('ValueSourceEditor with the colour rule', () => {
  it('warns that a colour this version does not know plays as blue', () => {
    renderWithProviders(
      <ValueSourceEditor
        label="Colour"
        value={{ source: 'literal', value: 'bleu' }}
        onChange={jest.fn()}
        expected="string"
        rule="color"
        availableVariables={[]}
      />,
    )

    const select = screen.getByRole('combobox', { name: 'Colour' })
    expect(select).toHaveDisplayValue('bleu')
    expect(select.getAttribute('aria-invalid')).toBeNull()
    expect(select).toHaveAccessibleDescription("'bleu' is not a known Color and plays as blue")
  })
})

describe('ValueSourceEditor with an optional field', () => {
  it('shows an absent value as the default, unflagged', () => {
    renderWithProviders(
      <ValueSourceEditor
        label="Blend Mode"
        value={undefined}
        onChange={jest.fn()}
        expected="string"
        rule="blend-mode"
        optional
        availableVariables={[]}
      />,
    )

    const select = screen.getByRole('combobox', { name: 'Blend Mode' })
    expect(select).toHaveDisplayValue('Default (replace)')
    expect(select.getAttribute('aria-invalid')).toBeNull()
  })
})

describe('ValueSourceEditor flags', () => {
  it('names the select by its label and describes it by the flag', () => {
    renderColour('bleu')

    const select = screen.getByRole('combobox', { name: 'Colour' })
    expect(select.getAttribute('aria-invalid')).toBe('true')
    expect(select).toHaveAccessibleDescription("'bleu' is not a known value")
  })

  it('keeps a stored variable of another type selected and warns about it', () => {
    renderWithProviders(
      <ValueSourceEditor
        label="lights (string)"
        value={{ source: 'variable', name: 'allLights' }}
        onChange={jest.fn()}
        expected="string"
        availableVariables={[{ name: 'allLights', type: 'light-array', scope: 'cue' }]}
      />,
    )

    const select = screen.getByRole('combobox', { name: 'lights (string) variable' })
    expect(select).toHaveDisplayValue('allLights (wrong type)')
    expect(select).toHaveAccessibleDescription(
      "'allLights' is a light-array variable, and this field takes string",
    )
  })
})

describe('ValueSourceEditor for a colour-array value', () => {
  const renderPalette = (listLiteral: boolean) =>
    renderWithProviders(
      <ValueSourceEditor
        label="palette (color-array)"
        value={undefined}
        onChange={jest.fn()}
        expected="color-array"
        listLiteral={listLiteral}
        availableVariables={[{ name: 'warm', type: 'color-array', scope: 'cue' }]}
      />,
    )

  it('offers only a color-array variable where a file cannot hold a colour list', () => {
    renderPalette(false)

    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'palette (color-array) variable' })).toBeTruthy()
  })

  it('offers the colour list where a file holds one', () => {
    renderPalette(true)

    expect(screen.getByRole('checkbox')).toBeTruthy()
  })
})
