/** @jest-environment jsdom */
/**
 * Behaviour of the per-light channel card, which is the editor for the offset model: the user sets
 * a master dimmer and every other channel is re-derived from the template's own offsets.
 *
 * The card is fully prop-driven, so what is pinned here is the shape of the light it hands back
 * through `onChange`, the cap that keeps a fixture inside the universe, and the notice that
 * explains the cap rather than applying it silently.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import {
  ConfigStrobeType,
  DMX_CHANNEL_MAX,
  FixtureTypes,
  type DmxFixture,
  type DmxLight,
  type ExtraChannel,
  type LightingConfiguration,
} from '../../../photonics-dmx/types'

jest.mock('./MovingHeadCalibrationWizard', () => ({
  __esModule: true,
  default: () => null,
}))

import LightChannelsConfig from './LightChannelsConfig'

/** An RGB template whose channels sit at master + 1, 2, 3. */
function template(overrides: Partial<DmxFixture> = {}): DmxFixture {
  return {
    id: 't1',
    position: 0,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: false,
    group: '',
    universe: 1,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as DmxFixture['channels'],
    ...overrides,
  }
}

function light(overrides: Partial<DmxLight> = {}): DmxLight {
  return {
    id: 'l1',
    fixtureId: 't1',
    position: 1,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: false,
    group: 'front',
    universe: 1,
    mount: 'floor',
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as DmxLight['channels'],
    ...overrides,
  }
}

const lightingConfig: LightingConfiguration = {
  numLights: 1,
  lightLayout: { id: 'two-rows', label: 'Two Rows' },
  strobeType: ConfigStrobeType.None,
  frontLights: [],
  backLights: [],
  strobeLights: [],
}

function renderCard(opts: { light?: DmxLight; templates?: DmxFixture[] } = {}) {
  const onChange = jest.fn()
  const view = render(
    <LightChannelsConfig
      light={opts.light ?? light()}
      onChange={onChange}
      onClick={() => {}}
      isHighlighted={false}
      myLights={opts.templates ?? [template()]}
      lightingConfig={lightingConfig}
    />,
  )
  return { ...view, onChange }
}

/** Only the master dimmer is editable, the derived channels render as text. */
function masterDimmerInput(): HTMLInputElement {
  const el = document.querySelector('input[type="number"]')
  if (!el) throw new Error('no master dimmer input')
  return el as HTMLInputElement
}

const lastLight = (onChange: jest.Mock): DmxLight =>
  onChange.mock.calls[onChange.mock.calls.length - 1][0] as DmxLight

beforeEach(() => {
  jest.clearAllMocks()
})
afterEach(() => cleanup())

describe('LightChannelsConfig rendering', () => {
  it('shows the channels derived from the light master dimmer', () => {
    renderCard({ light: light({ channels: { masterDimmer: 10 } as DmxLight['channels'] }) })

    expect(masterDimmerInput().value).toBe('10')
    // red/green/blue keep the template's offsets of +1/+2/+3.
    expect(screen.getByText('11')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('13')).toBeTruthy()
  })

  it('renders no channel list when the light names a template that is gone', () => {
    renderCard({ light: light({ fixtureId: 'missing' }) })

    expect(document.querySelector('input[type="number"]')).toBeNull()
  })
})

describe('LightChannelsConfig master dimmer', () => {
  it('re-derives every channel from the template offsets and hands back the whole light', () => {
    const { onChange } = renderCard()

    fireEvent.change(masterDimmerInput(), { target: { value: '100' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(lastLight(onChange).channels).toEqual({
      masterDimmer: 100,
      red: 101,
      green: 102,
      blue: 103,
    })
  })

  it('preserves the fields it does not own', () => {
    const { onChange } = renderCard({ light: light({ group: 'back', position: 4 }) })

    fireEvent.change(masterDimmerInput(), { target: { value: '50' } })

    const updated = lastLight(onChange)
    expect(updated.id).toBe('l1')
    expect(updated.fixtureId).toBe('t1')
    expect(updated.group).toBe('back')
    expect(updated.position).toBe(4)
  })

  it('caps a master dimmer that would push the fixture past the universe', () => {
    const { onChange } = renderCard()

    fireEvent.change(masterDimmerInput(), { target: { value: String(DMX_CHANNEL_MAX) } })

    // The RGB template spans 4 channels, so the highest master that still fits is 512 - 3.
    expect(lastLight(onChange).channels.masterDimmer).toBe(DMX_CHANNEL_MAX - 3)
  })

  it('explains the cap rather than applying it silently', () => {
    renderCard()

    fireEvent.change(masterDimmerInput(), { target: { value: '999' } })

    expect(screen.getByText(/Capped at 509/)).toBeTruthy()
    expect(screen.getByText(/4 channels fit/)).toBeTruthy()
  })

  it('drops the notice once a value inside the universe is entered', () => {
    renderCard()

    fireEvent.change(masterDimmerInput(), { target: { value: '999' } })
    expect(screen.queryByText(/Capped at/)).toBeTruthy()

    fireEvent.change(masterDimmerInput(), { target: { value: '10' } })
    expect(screen.queryByText(/Capped at/)).toBeNull()
  })

  it('does not carry the notice onto a different light', () => {
    const { rerender } = renderCard()
    fireEvent.change(masterDimmerInput(), { target: { value: '999' } })
    expect(screen.queryByText(/Capped at/)).toBeTruthy()

    rerender(
      <LightChannelsConfig
        light={light({ id: 'l2' })}
        onChange={jest.fn()}
        onClick={() => {}}
        isHighlighted={false}
        myLights={[template()]}
        lightingConfig={lightingConfig}
      />,
    )

    expect(screen.queryByText(/Capped at/)).toBeNull()
  })
})

describe('LightChannelsConfig extra channels', () => {
  const withWhite: ExtraChannel[] = [{ type: 'white', channel: 5 }]

  it('derives an extra channel from the same master offset', () => {
    const { onChange } = renderCard({
      templates: [template({ extraChannels: withWhite })],
      light: light({ extraChannels: withWhite }),
    })

    fireEvent.change(masterDimmerInput(), { target: { value: '100' } })

    // white sat at master + 4 on the template, so it follows the move.
    expect(lastLight(onChange).extraChannels).toEqual([{ type: 'white', channel: 104 }])
  })

  /**
   * The update spreads the rig light, which carries its own extraChannels, so a template that no
   * longer has any has to delete the key rather than leave the stale one in place.
   */
  it('drops the key when the template has no extra channels', () => {
    const { onChange } = renderCard({
      templates: [template()],
      light: light({ extraChannels: withWhite }),
    })

    fireEvent.change(masterDimmerInput(), { target: { value: '100' } })

    expect('extraChannels' in lastLight(onChange)).toBe(false)
  })
})
