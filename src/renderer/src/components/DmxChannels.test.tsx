/** @jest-environment jsdom */
/**
 * Tests for the fixture-template channel editor. The two sections it renders edit different
 * quantities — DMX channel *numbers* (1–512) and moving-head config fields (degrees / percent /
 * raw DMX) — so each section carries its own bounds.
 */
import { describe, expect, it, jest, afterEach } from '@jest/globals'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import {
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  FixtureTypes,
  type RgbFixture,
} from '../../../photonics-dmx/types'
import DmxChannels from './DmxChannels'

afterEach(() => cleanup())

function rgbFixture(overrides: Partial<RgbFixture> = {}): RgbFixture {
  return {
    id: 't',
    position: 0,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: false,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
    ...overrides,
  }
}

describe('DmxChannels', () => {
  it('reports a channel number when the user leaves the field, not per keystroke', () => {
    const onChannelChange = jest.fn()
    render(<DmxChannels light={rgbFixture()} onChannelChange={onChannelChange} />)
    const field = screen.getByLabelText('red:')

    fireEvent.change(field, { target: { value: '4' } })
    fireEvent.change(field, { target: { value: '40' } })
    expect(onChannelChange).not.toHaveBeenCalled()

    fireEvent.blur(field)
    expect(onChannelChange).toHaveBeenCalledWith('red', 40)
  })

  it('accepts a channel number in the top half of the universe', () => {
    const onChannelChange = jest.fn()
    render(<DmxChannels light={rgbFixture()} onChannelChange={onChannelChange} />)
    fireEvent.change(screen.getByLabelText('red:'), { target: { value: '400' } })
    fireEvent.blur(screen.getByLabelText('red:'))
    expect(onChannelChange).toHaveBeenCalledWith('red', 400)
  })

  it('clamps a channel number above the universe to 512', () => {
    const onChannelChange = jest.fn()
    render(<DmxChannels light={rgbFixture()} onChannelChange={onChannelChange} />)
    fireEvent.change(screen.getByLabelText('red:'), { target: { value: '900' } })
    fireEvent.blur(screen.getByLabelText('red:'))
    expect(onChannelChange).toHaveBeenCalledWith('red', 512)
  })

  it('bounds the channel inputs to the whole universe', () => {
    render(<DmxChannels light={rgbFixture()} onChannelChange={jest.fn()} />)
    const input = screen.getByLabelText('red:')
    expect(input.getAttribute('min')).toBe('1')
    expect(input.getAttribute('max')).toBe('512')
  })

  it('bounds a config field by its own range rather than the channel range', () => {
    const onChannelChange = jest.fn()
    render(
      <DmxChannels
        light={rgbFixture({ config: DEFAULT_MOVING_HEAD_FIXTURE_CONFIG })}
        onChannelChange={onChannelChange}
      />,
    )
    // panHome is a percentage: 0–100, so 512 is not a legal value here even though it is a legal
    // channel number.
    const panHome = screen.getByLabelText('panHome:')
    expect(panHome.getAttribute('max')).toBe('100')
    fireEvent.change(panHome, { target: { value: '400' } })
    fireEvent.blur(panHome)
    expect(onChannelChange).toHaveBeenCalledWith('panHome', 100)
  })

  it('bounds pan travel in degrees up to 720', () => {
    render(
      <DmxChannels
        light={rgbFixture({ config: DEFAULT_MOVING_HEAD_FIXTURE_CONFIG })}
        onChannelChange={jest.fn()}
      />,
    )
    expect(screen.getByLabelText('panRangeDeg:').getAttribute('max')).toBe('720')
  })
})
