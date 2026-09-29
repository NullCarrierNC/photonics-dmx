/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type { ColorListValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import PaletteSourceEditor from './PaletteSourceEditor'

function renderPalette(value: ColorListValueSource | undefined) {
  const onChange = jest.fn<(next: ColorListValueSource) => void>()
  renderWithProviders(
    <PaletteSourceEditor
      label="Palette"
      value={value}
      onChange={onChange}
      availableVariables={[{ name: 'warm', type: 'color-array', scope: 'cue' }]}
    />,
  )
  return onChange
}

describe('PaletteSourceEditor', () => {
  it('offers the colour list and a switch to a color-array variable', () => {
    const onChange = renderPalette({ source: 'literal', value: ['red'] })

    fireEvent.click(screen.getByRole('checkbox'))

    expect(onChange).toHaveBeenCalledWith({ source: 'variable', name: '' })
  })

  it('offers the color-array variables once it reads one', () => {
    renderPalette({ source: 'variable', name: 'warm' })

    expect(screen.getByRole('combobox', { name: 'Palette variable' })).toHaveDisplayValue(
      'warm (cue)',
    )
  })

  it('shows a listed colour this version does not know and warns that it is left out', () => {
    renderPalette({ source: 'literal', value: ['red', 'mauve'] })

    expect(screen.getByDisplayValue('mauve')).toBeTruthy()
    expect(
      screen.getByText("'mauve' is not a known Color and the list plays without it"),
    ).toBeTruthy()
  })
})
