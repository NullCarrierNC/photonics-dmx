/** @jest-environment jsdom */
/**
 * The per-light channel-value list (DMX Preview + Cue Simulation) shows a fixture's added channels
 * after its base channels, with their live DMX value; a plain fixture renders only its base rows.
 */
import { describe, expect, it, afterEach } from '@jest/globals'
import { render, screen, within, cleanup } from '@testing-library/react'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxLight,
  type ExtraChannel,
  type LightingConfiguration,
} from '../../../photonics-dmx/types'
import LightsDmxChannelsPreview from './LightsDmxChannelsPreview'

afterEach(() => cleanup())

function light(channels: Record<string, number>, extraChannels?: ExtraChannel[]): DmxLight {
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
    channels: channels as unknown as DmxLight['channels'],
    ...(extraChannels ? { extraChannels } : {}),
  }
}

function config(l: DmxLight): LightingConfiguration {
  return {
    numLights: 1,
    lightLayout: { id: 'two-rows', label: 'Two Rows' },
    strobeType: ConfigStrobeType.None,
    frontLights: [l],
    backLights: [],
    strobeLights: [],
  }
}

const RGB = { masterDimmer: 1, red: 2, green: 3, blue: 4 }

describe('LightsDmxChannelsPreview extra channels', () => {
  it('renders an added amber channel with its live DMX value after the base channels', () => {
    const l = light(RGB, [{ type: 'amber', channel: 5 }])
    render(<LightsDmxChannelsPreview lightingConfig={config(l)} dmxValues={{ 2: 100, 5: 200 }} />)
    const card = screen.getByText(/PAR/).closest('div') as HTMLElement
    const amberRow = within(card)
      .getByText(/^Amber/)
      .closest('li') as HTMLElement
    expect(within(amberRow).getByText('200')).toBeTruthy()
  })

  it('shows a fixed channel with its pinned live value', () => {
    const l = light(RGB, [{ type: 'fixed', channel: 5, value: 42 }])
    render(<LightsDmxChannelsPreview lightingConfig={config(l)} dmxValues={{ 5: 42 }} />)
    const row = screen.getByText(/^Fixed value/).closest('li') as HTMLElement
    expect(within(row).getByText('42')).toBeTruthy()
  })

  it('renders only base channels for a fixture with no extras', () => {
    const l = light(RGB)
    render(<LightsDmxChannelsPreview lightingConfig={config(l)} dmxValues={{}} />)
    expect(screen.queryByText('Amber:')).toBeNull()
    expect(screen.getByText(/^red/)).toBeTruthy()
  })

  it('lists Master Dimmer before the other base channels', () => {
    const rgbmh = light({
      masterDimmer: 124,
      red: 126,
      green: 127,
      blue: 128,
      pan: 121,
      tilt: 122,
    })
    render(<LightsDmxChannelsPreview lightingConfig={config(rgbmh)} dmxValues={{}} />)
    const card = screen.getByText(/PAR/).closest('div') as HTMLElement
    const rows = within(card).getAllByRole('listitem')
    expect(rows[0].textContent).toMatch(/Master Dimmer/)
    expect(rows[1].textContent).toMatch(/red/)
  })

  it('shows the DMX address alongside each value', () => {
    const l = light(RGB, [{ type: 'amber', channel: 5 }])
    render(<LightsDmxChannelsPreview lightingConfig={config(l)} dmxValues={{ 5: 200 }} />)
    const address = within(screen.getByText(/^Amber/).closest('li') as HTMLElement).getByText(
      /#5\b/,
    )
    expect(address.textContent).toContain('#5')
    // Nothing else in the rig claims 5, so the shared-address marker stays off.
    expect(address.textContent).not.toContain('⚠')
    expect(address.getAttribute('title')).toBeNull()
  })

  it('flags an address two lights in the rig both claim', () => {
    // Second light's master dimmer sits on the first light's amber, so both rows read one value.
    const first = light(RGB, [{ type: 'amber', channel: 11 }])
    const second: DmxLight = {
      ...light({ masterDimmer: 11, red: 12, green: 13, blue: 14 }),
      id: 'l2',
      name: 'PAR 2',
    }
    const twoLights: LightingConfiguration = { ...config(first), frontLights: [first, second] }
    render(<LightsDmxChannelsPreview lightingConfig={twoLights} dmxValues={{ 11: 255 }} />)

    const amberRow = screen.getByText(/^Amber/).closest('li') as HTMLElement
    expect(within(amberRow).getByText(/#11\b/).textContent).toContain('⚠')
    // The unshared channels stay unflagged.
    const redRow = screen.getAllByText(/^red/)[0].closest('li') as HTMLElement
    expect(within(redRow).getByText(/#2\b/).textContent).not.toContain('⚠')
  })

  it('does not flag AllCapable strobe snapshots that duplicate front/back addresses', () => {
    const primary = light(RGB)
    const snapshot: DmxLight = { ...primary, id: 'snapshot' }
    const allCapable: LightingConfiguration = {
      ...config(primary),
      strobeType: ConfigStrobeType.AllCapable,
      strobeLights: [snapshot],
    }
    render(<LightsDmxChannelsPreview lightingConfig={allCapable} dmxValues={{}} />)

    const redRow = screen.getByText(/^red/).closest('li') as HTMLElement
    expect(within(redRow).getByText(/#2\b/).textContent).not.toContain('⚠')
  })

  it('still flags a real overlap under AllCapable', () => {
    const first = light(RGB, [{ type: 'amber', channel: 11 }])
    const second: DmxLight = {
      ...light({ masterDimmer: 11, red: 12, green: 13, blue: 14 }),
      id: 'l2',
      name: 'PAR 2',
    }
    const allCapable: LightingConfiguration = {
      ...config(first),
      strobeType: ConfigStrobeType.AllCapable,
      frontLights: [first, second],
      strobeLights: [{ ...first, id: 'snapshot' }],
    }
    render(<LightsDmxChannelsPreview lightingConfig={allCapable} dmxValues={{ 11: 255 }} />)

    const amberRow = screen.getByText(/^Amber/).closest('li') as HTMLElement
    expect(within(amberRow).getByText(/#11\b/).textContent).toContain('⚠')
  })

  it('flags dedicated strobe rows that overlap primary lights', () => {
    const primary = light(RGB)
    const strobe: DmxLight = {
      ...light({ masterDimmer: 2, red: 3, green: 4, blue: 5 }),
      id: 'strobe',
      name: 'Strobe',
      group: 'strobe',
    }
    const dedicated: LightingConfiguration = {
      ...config(primary),
      strobeType: ConfigStrobeType.Dedicated,
      strobeLights: [strobe],
    }
    render(<LightsDmxChannelsPreview lightingConfig={dedicated} dmxValues={{ 2: 255 }} />)

    const redRow = screen.getByText(/^red/).closest('li') as HTMLElement
    expect(within(redRow).getByText(/#2\b/).textContent).toContain('⚠')
  })
})
