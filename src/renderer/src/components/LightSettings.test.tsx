/** @jest-environment jsdom */
/**
 * Tests the extra-channel behaviour of the fixture-type switch in LightSettings: extras survive an
 * RGB-family switch, a switch into a dedicated STROBE keeps only fixed channels (and emits no key
 * when none remain), and the Additional Channels section is present.
 */
import { describe, expect, it, jest, afterEach } from '@jest/globals'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import {
  FixtureTypes,
  type DmxFixture,
  type ExtraChannel,
  type RgbFixture,
} from '../../../photonics-dmx/types'
import LightSettings from './LightSettings'

afterEach(() => cleanup())

// The fixture-type <select> is the first combobox in the form (the Additional Channels rows add
// their own type selects after it).
function fixtureTypeSelect(): HTMLElement {
  return screen.getAllByRole('combobox')[0]
}

function rgb(extraChannels?: ExtraChannel[]): RgbFixture {
  return {
    id: 't',
    position: 0,
    fixture: FixtureTypes.RGB,
    label: 'L',
    name: 'L',
    isStrobeEnabled: false,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
    ...(extraChannels ? { extraChannels } : {}),
  }
}

describe('LightSettings fixture-type switch with extra channels', () => {
  it('preserves extra channels across an RGB → moving-head switch', () => {
    const setCurrentLight = jest.fn<(light: DmxFixture | null) => void>()
    render(
      <LightSettings
        currentLight={rgb([{ type: 'amber', channel: 5 }])}
        setCurrentLight={setCurrentLight}
      />,
    )
    fireEvent.change(fixtureTypeSelect(), { target: { value: FixtureTypes.RGBMH } })
    const arg = setCurrentLight.mock.calls[0]?.[0]
    expect(arg?.fixture).toBe(FixtureTypes.RGBMH)
    expect(arg?.extraChannels).toEqual([{ type: 'amber', channel: 5 }])
  })

  it('keeps only fixed channels on a switch into STROBE and drops the key when none remain', () => {
    const setCurrentLight = jest.fn<(light: DmxFixture | null) => void>()
    render(
      <LightSettings
        currentLight={rgb([{ type: 'amber', channel: 5 }])}
        setCurrentLight={setCurrentLight}
      />,
    )
    fireEvent.change(fixtureTypeSelect(), { target: { value: FixtureTypes.STROBE } })
    const arg = setCurrentLight.mock.calls[0]?.[0]
    expect(arg?.fixture).toBe(FixtureTypes.STROBE)
    expect(arg).not.toHaveProperty('extraChannels')
  })

  it('keeps a fixed channel on a switch into STROBE', () => {
    const setCurrentLight = jest.fn<(light: DmxFixture | null) => void>()
    render(
      <LightSettings
        currentLight={rgb([
          { type: 'amber', channel: 5 },
          { type: 'fixed', channel: 6, value: 100 },
        ])}
        setCurrentLight={setCurrentLight}
      />,
    )
    fireEvent.change(fixtureTypeSelect(), { target: { value: FixtureTypes.STROBE } })
    const arg = setCurrentLight.mock.calls[0]?.[0]
    expect(arg?.extraChannels).toEqual([{ type: 'fixed', channel: 6, value: 100 }])
  })

  it('renders the Additional Channels section', () => {
    render(<LightSettings currentLight={rgb()} setCurrentLight={jest.fn()} />)
    expect(screen.getByText('Additional Channels')).toBeInTheDocument()
  })
})
