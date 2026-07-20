/** @jest-environment jsdom */
/**
 * Tests the extra-channel behaviour of the fixture-type switch in LightSettings: extras survive an
 * RGB-family switch, a switch into a dedicated STROBE keeps only fixed channels (and emits no key
 * when none remain), and the Additional Channels section is present.
 */
import { describe, expect, it, jest, afterEach } from '@jest/globals'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FixtureTypes, type DmxFixture, type ExtraChannel } from '../../../photonics-dmx/types'
import LightSettings from './LightSettings'

afterEach(() => cleanup())

// The fixture-type <select> is the first combobox in the form (the Additional Channels rows add
// their own type selects after it).
function fixtureTypeSelect(): HTMLElement {
  return screen.getAllByRole('combobox')[0]
}

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

describe('LightSettings fixture-type switch with extra channels', () => {
  it('preserves extra channels across an RGB → RGBW switch', () => {
    const setCurrentLight = jest.fn()
    render(
      <LightSettings
        currentLight={fixture(FixtureTypes.RGB, [{ type: 'amber', channel: 5 }])}
        setCurrentLight={setCurrentLight}
      />,
    )
    fireEvent.change(fixtureTypeSelect(), { target: { value: FixtureTypes.RGBW } })
    const arg = setCurrentLight.mock.calls[0][0] as DmxFixture
    expect(arg.fixture).toBe(FixtureTypes.RGBW)
    expect(arg.extraChannels).toEqual([{ type: 'amber', channel: 5 }])
  })

  it('keeps only fixed channels on a switch into STROBE and drops the key when none remain', () => {
    const setCurrentLight = jest.fn()
    render(
      <LightSettings
        currentLight={fixture(FixtureTypes.RGB, [{ type: 'amber', channel: 5 }])}
        setCurrentLight={setCurrentLight}
      />,
    )
    fireEvent.change(fixtureTypeSelect(), { target: { value: FixtureTypes.STROBE } })
    const arg = setCurrentLight.mock.calls[0][0] as DmxFixture
    expect(arg.fixture).toBe(FixtureTypes.STROBE)
    expect('extraChannels' in arg).toBe(false)
  })

  it('keeps a fixed channel on a switch into STROBE', () => {
    const setCurrentLight = jest.fn()
    render(
      <LightSettings
        currentLight={fixture(FixtureTypes.RGB, [
          { type: 'amber', channel: 5 },
          { type: 'fixed', channel: 6, value: 100 },
        ])}
        setCurrentLight={setCurrentLight}
      />,
    )
    fireEvent.change(fixtureTypeSelect(), { target: { value: FixtureTypes.STROBE } })
    const arg = setCurrentLight.mock.calls[0][0] as DmxFixture
    expect(arg.extraChannels).toEqual([{ type: 'fixed', channel: 6, value: 100 }])
  })

  it('renders the Additional Channels section', () => {
    render(<LightSettings currentLight={fixture(FixtureTypes.RGB)} setCurrentLight={jest.fn()} />)
    expect(screen.getByText('Additional Channels')).toBeTruthy()
  })
})
