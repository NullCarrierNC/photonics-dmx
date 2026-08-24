/** @jest-environment jsdom */
/**
 * The preview's scaling control: shown only for a rig with something to demonstrate, off to start,
 * and driving every live surface through the shared atom.
 */
import { describe, expect, it, afterEach, jest } from '@jest/globals'
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { previewBrightnessScalingAtom, dmxValuesAtom } from '@renderer/atoms'
import BrightnessScalingPreviewToggle from './BrightnessScalingPreviewToggle'

// The disc/stage preview pulls in a three.js font asset jsdom can't load. The stub records the
// values it is handed, which is what the 2D discs and the 3D stage both draw from.
const previewFrames: Array<Record<number, number>> = []
jest.mock('./LightsDmxPreview', () => ({
  __esModule: true,
  default: ({ dmxValues }: { dmxValues: Record<number, number> }) => {
    previewFrames.push(dmxValues)
    return null
  },
}))

import { LiveLightsDmxPreview, LiveLightsDmxChannelsPreview } from './LiveDmxPreview'
import {
  ConfigStrobeType,
  FixtureTypes,
  type BrightnessScaling,
  type DmxLight,
  type LightingConfiguration,
} from '../../../photonics-dmx/types'

afterEach(() => cleanup())

function light(brightnessScaling?: BrightnessScaling): DmxLight {
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
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as unknown as DmxLight['channels'],
    ...(brightnessScaling ? { brightnessScaling } : {}),
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

function sharedAddressConfig(): LightingConfiguration {
  return {
    numLights: 2,
    lightLayout: { id: 'two-rows', label: 'Two Rows' },
    strobeType: ConfigStrobeType.None,
    frontLights: [
      {
        ...light({ green: 80 }),
        id: 'light-a',
        name: 'PAR A',
        label: 'PAR A',
        position: 1,
      },
      {
        ...light(),
        id: 'light-b',
        name: 'PAR B',
        label: 'PAR B',
        position: 2,
        channels: {
          masterDimmer: 10,
          red: 11,
          green: 3,
          blue: 13,
        } as unknown as DmxLight['channels'],
        extraChannels: [{ type: 'amber', channel: 3, scale: 50 }],
      },
    ],
    backLights: [],
    strobeLights: [],
  }
}

describe('BrightnessScalingPreviewToggle', () => {
  it('renders nothing for a rig where no light is scaled', () => {
    render(<BrightnessScalingPreviewToggle lightingConfig={config(light())} />)
    expect(screen.queryByLabelText('Preview Brightness Scaling')).toBeNull()
  })

  it('renders nothing without a rig', () => {
    render(<BrightnessScalingPreviewToggle lightingConfig={null} />)
    expect(screen.queryByLabelText('Preview Brightness Scaling')).toBeNull()
  })

  it('appears unchecked for a rig with a scaled light and toggles the shared atom', () => {
    const store = createStore()
    render(
      <Provider store={store}>
        <BrightnessScalingPreviewToggle lightingConfig={config(light({ green: 80 }))} />
      </Provider>,
    )

    const checkbox = screen.getByLabelText('Preview Brightness Scaling') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    expect(store.get(previewBrightnessScalingAtom)).toBe(false)

    fireEvent.click(checkbox)
    expect(store.get(previewBrightnessScalingAtom)).toBe(true)
    expect((screen.getByLabelText('Preview Brightness Scaling') as HTMLInputElement).checked).toBe(
      true,
    )
  })
})

describe('live preview surfaces under the scaling toggle', () => {
  function renderChannelsPreview(scalingOn: boolean): void {
    const store = createStore()
    store.set(dmxValuesAtom, { 1: 255, 2: 200, 3: 200, 4: 200 })
    store.set(previewBrightnessScalingAtom, scalingOn)
    render(
      <Provider store={store}>
        <LiveLightsDmxChannelsPreview lightingConfig={config(light({ green: 50 }))} />
      </Provider>,
    )
  }

  /** Text of the channel row whose label starts with `channelName`, e.g. "green (#3): 100". */
  function channelRow(channelName: string): string {
    const card = screen.getByText(/PAR/).closest('div') as HTMLElement
    const row = within(card)
      .getAllByRole('listitem')
      .find((li) => (li.textContent ?? '').trim().startsWith(channelName))
    if (!row) throw new Error(`no channel row for ${channelName}`)
    return row.textContent ?? ''
  }

  it('shows unscaled channel values by default', () => {
    renderChannelsPreview(false)
    expect(channelRow('green')).toContain('200')
  })

  it('shows scaled channel values when the toggle is on', () => {
    renderChannelsPreview(true)
    expect(channelRow('green')).toContain('100')
    // Channels the fixture does not scale are untouched.
    expect(channelRow('red')).toContain('200')
  })

  /** Both views draw from one record, so scaling it covers 2D and 3D alike. */
  it.each([
    ['unscaled by default', false, 200],
    ['scaled when the toggle is on', true, 100],
  ])('hands the disc and stage views values %s', (_label, scalingOn, expectedGreen) => {
    previewFrames.length = 0
    const store = createStore()
    store.set(dmxValuesAtom, { 1: 255, 2: 200, 3: 200, 4: 200 })
    store.set(previewBrightnessScalingAtom, scalingOn as boolean)
    render(
      <Provider store={store}>
        <LiveLightsDmxPreview lightingConfig={config(light({ green: 50 }))} />
      </Provider>,
    )

    const frame = previewFrames[previewFrames.length - 1]!
    expect(frame[3]).toBe(expectedGreen)
    expect(frame[2]).toBe(200)
  })

  it('uses the last sorted fixture owner for a shared scaled address', () => {
    previewFrames.length = 0
    const store = createStore()
    store.set(dmxValuesAtom, { 3: 200 })
    store.set(previewBrightnessScalingAtom, true)
    render(
      <Provider store={store}>
        <LiveLightsDmxPreview lightingConfig={sharedAddressConfig()} />
      </Provider>,
    )

    expect(previewFrames[previewFrames.length - 1]![3]).toBe(100)
  })
})
