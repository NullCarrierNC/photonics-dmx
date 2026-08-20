/** @jest-environment jsdom */
/**
 * The 2D preview draws the front row 1..N left to right and the back row reversed, so the
 * position numbers read as one continuous ring across both rows in every layout.
 */
import { describe, expect, it, afterEach, jest } from '@jest/globals'
import { render, screen, cleanup } from '@testing-library/react'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxLight,
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

function light(position: number, group: 'front' | 'back'): DmxLight {
  return {
    id: `l${position}`,
    fixtureId: 't1',
    position,
    fixture: FixtureTypes.RGB,
    label: `PAR ${position}`,
    name: `PAR ${position}`,
    isStrobeEnabled: false,
    group,
    universe: 1,
    mount: 'floor',
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as unknown as DmxLight['channels'],
  }
}

function config(layout: { id: string; label: string }): LightingConfiguration {
  return {
    numLights: 8,
    lightLayout: layout,
    strobeType: ConfigStrobeType.None,
    frontLights: [1, 2, 3, 4].map((p) => light(p, 'front')),
    backLights: [5, 6, 7, 8].map((p) => light(p, 'back')),
    strobeLights: [],
  }
}

const renderedPositions = () => screen.getAllByText(/^[0-9]+$/).map((el) => el.textContent)

describe.each([
  ['two-rows', 'Two Rows on Stage'],
  ['front-back', 'Front and Back'],
  ['stacked', 'Stacked'],
])('LightsDmxPreview %s layout', (id, label) => {
  it('renders the back row high-to-low so positions 1..8 form a continuous ring', () => {
    render(<LightsDmxPreview lightingConfig={config({ id, label })} dmxValues={{}} />)
    expect(renderedPositions()).toEqual(['1', '2', '3', '4', '8', '7', '6', '5'])
  })
})
