/** @jest-environment jsdom */
/**
 * Tests for the "+ Add Channel" editor: adding/removing rows, the fixed-value flow, the empty→
 * undefined normalisation (never persist []), the collision warning, and the STROBE-only picker.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from '@jest/globals'
import { FixtureTypes, type DmxFixture, type ExtraChannel } from '../../../photonics-dmx/types'
import ExtraChannelsEditor from './ExtraChannelsEditor'

afterEach(() => cleanup())

function fixture(fx: FixtureTypes, extraChannels?: ExtraChannel[]): DmxFixture {
  return {
    id: 't',
    position: 0,
    fixture: fx,
    label: 'L',
    name: 'L',
    isStrobeEnabled: false,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as unknown as DmxFixture['channels'],
    ...(extraChannels ? { extraChannels } : {}),
  }
}

describe('ExtraChannelsEditor', () => {
  it('appends a white channel at 0 (invalid-red) on Add Channel', () => {
    const onChange = jest.fn()
    render(<ExtraChannelsEditor light={fixture(FixtureTypes.RGB)} onChange={onChange} />)
    fireEvent.click(screen.getByText('+ Add Channel'))
    expect(onChange).toHaveBeenCalledWith([{ type: 'white', channel: 0 }])
  })

  it('emits undefined (not []) when the last row is removed', () => {
    const onChange = jest.fn()
    render(
      <ExtraChannelsEditor
        light={fixture(FixtureTypes.RGB, [{ type: 'amber', channel: 5 }])}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByLabelText('Remove Amber'))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('seeds value: 0 when a row switches to Fixed value and drops it when switching away', () => {
    const onChange = jest.fn()
    render(
      <ExtraChannelsEditor
        light={fixture(FixtureTypes.RGB, [{ type: 'amber', channel: 5 }])}
        onChange={onChange}
      />,
    )
    const select = screen.getByLabelText('Amber type')
    fireEvent.change(select, { target: { value: 'fixed' } })
    expect(onChange).toHaveBeenCalledWith([{ type: 'fixed', channel: 5, value: 0 }])

    onChange.mockClear()
    // Re-render as a fixed row, then switch back to a colour.
    cleanup()
    render(
      <ExtraChannelsEditor
        light={fixture(FixtureTypes.RGB, [{ type: 'fixed', channel: 5, value: 42 }])}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Fixed value type'), { target: { value: 'red' } })
    expect(onChange).toHaveBeenCalledWith([{ type: 'red', channel: 5 }])
  })

  it('shows a collision warning when two channels share a DMX number', () => {
    render(
      <ExtraChannelsEditor
        light={fixture(FixtureTypes.RGB, [
          { type: 'amber', channel: 2 }, // collides with base red (2)
        ])}
        onChange={jest.fn()}
      />,
    )
    expect(screen.getByText(/assigned more than once/)).toBeTruthy()
  })

  it('offers only Fixed value on a dedicated strobe fixture', () => {
    render(
      <ExtraChannelsEditor
        light={{ ...fixture(FixtureTypes.STROBE, [{ type: 'fixed', channel: 5, value: 10 }]) }}
        onChange={jest.fn()}
      />,
    )
    const options = screen.getByLabelText('Fixed value type').querySelectorAll('option')
    expect(Array.from(options).map((o) => o.textContent)).toEqual(['Fixed value'])
  })

  it('accepts a channel number above 255 (the model allows 1–512)', () => {
    const onChange = jest.fn()
    render(
      <ExtraChannelsEditor
        light={fixture(FixtureTypes.RGB, [{ type: 'amber', channel: 5 }])}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Amber DMX channel'), { target: { value: '400' } })
    expect(onChange).toHaveBeenCalledWith([{ type: 'amber', channel: 400 }])
  })

  it('clamps a channel number above 512 down to 512', () => {
    const onChange = jest.fn()
    render(
      <ExtraChannelsEditor
        light={fixture(FixtureTypes.RGB, [{ type: 'amber', channel: 5 }])}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Amber DMX channel'), { target: { value: '600' } })
    expect(onChange).toHaveBeenCalledWith([{ type: 'amber', channel: 512 }])
  })
})
