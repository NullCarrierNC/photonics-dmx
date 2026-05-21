/** @jest-environment jsdom */
import { describe, expect, it } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import StrobeChannelPreviewNotice from './StrobeChannelPreviewNotice'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxLight,
  type LightingConfiguration,
} from '../../../photonics-dmx/types'

function makeRgbLight(overrides: Partial<DmxLight> = {}): DmxLight {
  return {
    id: 'l-1',
    fixtureId: 't-1',
    position: 1,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: false,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
    ...overrides,
  } as DmxLight
}

function makeRgbWithStrobeChannel(overrides: Partial<DmxLight> = {}): DmxLight {
  return makeRgbLight({
    channels: {
      masterDimmer: 1,
      red: 2,
      green: 3,
      blue: 4,
      strobeChannel: 5,
    } as DmxLight['channels'],
    ...overrides,
  })
}

function makeConfig(overrides: Partial<LightingConfiguration> = {}): LightingConfiguration {
  return {
    numLights: 0,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.None,
    frontLights: [],
    backLights: [],
    strobeLights: [],
    ...overrides,
  }
}

describe('StrobeChannelPreviewNotice', () => {
  it('renders nothing when the rig has no strobe-channel lights', () => {
    const { container } = render(
      <StrobeChannelPreviewNotice lightingConfig={makeConfig({ frontLights: [makeRgbLight()] })} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the lightingConfig is null', () => {
    const { container } = render(<StrobeChannelPreviewNotice lightingConfig={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a singular count for one strobe-channel light', () => {
    render(
      <StrobeChannelPreviewNotice
        lightingConfig={makeConfig({ frontLights: [makeRgbWithStrobeChannel()] })}
      />,
    )
    const banner = screen.getByRole('status')
    expect(banner.textContent).toMatch(/1 light has a hardware strobe channel/i)
    expect(banner.textContent).toMatch(/appear/i)
    expect(banner.textContent).toMatch(/solid/i)
  })

  it('renders a plural count for multiple strobe-channel lights', () => {
    render(
      <StrobeChannelPreviewNotice
        lightingConfig={makeConfig({
          frontLights: [
            makeRgbWithStrobeChannel({ id: 'a' }),
            makeRgbWithStrobeChannel({ id: 'b' }),
          ],
          backLights: [makeRgbWithStrobeChannel({ id: 'c' })],
        })}
      />,
    )
    expect(screen.getByRole('status').textContent).toMatch(
      /3 lights have a hardware strobe channel/i,
    )
  })

  it('applies the className prop alongside the default styling', () => {
    render(
      <StrobeChannelPreviewNotice
        className="mb-3"
        lightingConfig={makeConfig({ frontLights: [makeRgbWithStrobeChannel()] })}
      />,
    )
    expect(screen.getByRole('status').className).toMatch(/mb-3/)
  })
})
