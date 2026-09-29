/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import ValueSourceEditor from './ValueSourceEditor'

function renderCueType(value: string) {
  renderWithProviders(
    <ValueSourceEditor
      label="Cue type"
      value={{ source: 'literal', value }}
      onChange={jest.fn()}
      expected="cue-type"
      availableVariables={[]}
    />,
  )
}

describe('ValueSourceEditor with a constrained literal', () => {
  it('shows and flags a stored value outside its choices', () => {
    renderCueType('Chorsu')

    expect(screen.getByRole('combobox')).toHaveProperty('value', 'Chorsu')
    expect(screen.getByText("'Chorsu' is not a known value")).toBeTruthy()
  })

  it('does not flag a value from its choices', () => {
    renderCueType('Chorus')

    expect(screen.getByRole('combobox')).toHaveProperty('value', 'Chorus')
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

  it('warns the same way for a colour field that names no rule', () => {
    renderWithProviders(
      <ValueSourceEditor
        label="Value"
        value={{ source: 'literal', value: 'bleu' }}
        onChange={jest.fn()}
        expected="color"
        availableVariables={[]}
      />,
    )

    const select = screen.getByRole('combobox', { name: 'Value' })
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
    renderCueType('Chorsu')

    const select = screen.getByRole('combobox', { name: 'Cue type' })
    expect(select.getAttribute('aria-invalid')).toBe('true')
    expect(select).toHaveAccessibleDescription("'Chorsu' is not a known value")
  })

  it('flags a variable-mode field with no variable chosen', () => {
    renderWithProviders(
      <ValueSourceEditor
        label="duration (number)"
        value={{ source: 'variable', name: '' }}
        onChange={jest.fn()}
        expected="number"
        availableVariables={[{ name: 'speed', type: 'number', scope: 'cue' }]}
      />,
    )

    const select = screen.getByRole('combobox', { name: 'duration (number) variable' })
    expect(select.getAttribute('aria-invalid')).toBe('true')
    expect(select).toHaveAccessibleDescription('Select a variable')
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
  it('offers only a color-array variable', () => {
    renderWithProviders(
      <ValueSourceEditor
        label="palette (color-array)"
        value={undefined}
        onChange={jest.fn()}
        expected="color-array"
        availableVariables={[{ name: 'warm', type: 'color-array', scope: 'cue' }]}
      />,
    )

    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'palette (color-array) variable' })).toBeTruthy()
  })
})
