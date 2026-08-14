/** @jest-environment jsdom */
/**
 * The 2D preview's per-channel swatch row: a light whose colour comes from more than the base RGB
 * shows its component channels under the mixed circle, so a duplicate bank is distinguishable from
 * the primary it doubles. Plain fixtures keep the circle alone.
 */
import { describe, expect, it, afterEach, jest } from '@jest/globals'
import { render, screen, cleanup } from '@testing-library/react'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxLight,
  type ExtraChannel,
  type LightingConfiguration,
} from '../../../photonics-dmx/types'

// The 3D preview pulls in THREE and a WebGL canvas, neither of which jsdom provides. The 2D path
// under test never renders it.
jest.mock('./LightsDmxPreview3D', () => ({
  __esModule: true,
  default: () => null,
}))

import LightsDmxPreview from './LightsDmxPreview'

afterEach(() => cleanup())

function light(extraChannels?: ExtraChannel[]): DmxLight {
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

describe('LightsDmxPreview per-channel swatches', () => {
  it('shows a swatch per colour channel, distinguishing a duplicate red bank', () => {
    const l = light([
      { type: 'amber', channel: 5 },
      { type: 'red', channel: 6 },
    ])
    // Base red dark, second red bank lit: the mixed circle alone could not show which red is on.
    render(
      <LightsDmxPreview lightingConfig={config(l)} dmxValues={{ 1: 255, 2: 0, 5: 128, 6: 200 }} />,
    )

    expect(screen.getByLabelText('Red: 0')).toBeTruthy()
    expect(screen.getByLabelText('Green: 0')).toBeTruthy()
    expect(screen.getByLabelText('Blue: 0')).toBeTruthy()
    expect(screen.getByLabelText('Amber: 128')).toBeTruthy()
    expect(screen.getByLabelText('Red 2: 200')).toBeTruthy()
    expect(screen.getByLabelText('Red 2: 200').getAttribute('style')).toContain(
      'background-color: rgb(200, 0, 0)',
    )
  })

  it('shows the three primaries for a plain RGB fixture', () => {
    render(<LightsDmxPreview lightingConfig={config(light())} dmxValues={{ 1: 255, 2: 200 }} />)
    expect(screen.getByLabelText('Red: 200')).toBeTruthy()
    expect(screen.getByLabelText('Green: 0')).toBeTruthy()
    expect(screen.getByLabelText('Blue: 0')).toBeTruthy()
  })

  it('leaves fixed channels out of a fixture swatch row', () => {
    const l = light([{ type: 'fixed', channel: 5, value: 200 }])
    render(<LightsDmxPreview lightingConfig={config(l)} dmxValues={{ 1: 255, 5: 200 }} />)
    expect(screen.getByLabelText('Red: 0')).toBeTruthy()
    expect(screen.queryByLabelText(/Fixed/)).toBeNull()
  })
})
