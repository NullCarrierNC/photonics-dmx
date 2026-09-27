/** @jest-environment jsdom */
import { describe, expect, it, jest, afterEach } from '@jest/globals'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigStrobeType, type DmxFixture, type DmxLight } from '../../../../photonics-dmx/types'
import {
  createMockLightingConfig,
  rgbFixture,
  rgbLight,
} from '../../../../photonics-dmx/tests/helpers/testFixtures'
import type { LightsLayoutDrag } from './useLightsLayoutDrag'

jest.mock('./LightChannelAssignmentSection', () => ({ __esModule: true, default: () => null }))

import LightsLayoutCanvas from './LightsLayoutCanvas'

const drag: LightsLayoutDrag = {
  sensors: [],
  activeDragLight: null,
  dropAnimation: { duration: 0 },
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
}

function renderCanvas(lights: DmxLight[], fixtureLibrary: DmxFixture[] = []): void {
  const props = {
    drag,
    sharedRigChannels: [],
    rigName: 'Stage',
    selectedLayout: 'front',
    selectedStrobe: ConfigStrobeType.None,
    allPrimaryLights: lights,
    currentLightingConfig: createMockLightingConfig({ frontLights: lights }),
    myFixtures: [],
    fixtureLibrary,
    activeRigId: 'rig-1',
    highlightedLight: null,
    onLightClick: () => undefined,
    onLightChange: () => undefined,
  }
  render(<LightsLayoutCanvas {...props} />)
}

const addressed = rgbLight({ id: 'A', position: 1 })

function unaddressed(id: string, position: number): DmxLight {
  return rgbLight({
    id,
    position,
    channels: { masterDimmer: 0, red: 0, green: 0, blue: 0 },
  })
}

afterEach(() => cleanup())

describe('LightsLayoutCanvas address warning', () => {
  it('says which light has no DMX address and that it stays dark', () => {
    renderCanvas([addressed, unaddressed('B', 2)])

    expect(screen.getByText(/has no DMX address/)).toHaveTextContent(
      'The light at position 2 has no DMX address and stays dark. Set its Master Dimmer channel to use it.',
    )
  })

  it('lists every light that has no DMX address', () => {
    renderCanvas([unaddressed('B', 2), addressed, unaddressed('C', 4)])

    expect(screen.getByText(/have no DMX address/)).toHaveTextContent(
      'The lights at positions 2 and 4 have no DMX address and stay dark.',
    )
  })

  it('shows no warning when every light has an address', () => {
    renderCanvas([addressed])

    expect(screen.queryByText(/no DMX address/)).toBeNull()
  })
})

describe('LightsLayoutCanvas template master warning', () => {
  const noMaster = rgbFixture({
    id: 'tpl-par',
    name: 'PAR',
    channels: { masterDimmer: 0, red: 2, green: 3, blue: 4 },
  })
  const parAt = (id: string, position: number, masterDimmer: number): DmxLight =>
    rgbLight({
      id,
      position,
      fixtureId: 'tpl-par',
      channels: { masterDimmer, red: 0, green: 0, blue: 0 },
    })

  it('says a light stays dark until its template has a master', () => {
    renderCanvas([addressed, parAt('B', 2, 5)], [noMaster])

    expect(screen.getByText(/until PAR has/)).toHaveTextContent(
      'The light at position 2 stays dark until PAR has a Master Dimmer channel in My Lights.',
    )
  })

  it('lists every light of the template, one with no address of its own included', () => {
    renderCanvas([parAt('D', 4, 9), parAt('B', 2, 5), parAt('C', 3, 0)], [noMaster])

    expect(screen.getByText(/until PAR has/)).toHaveTextContent(
      'The lights at positions 2, 3 and 4 stay dark until PAR has a Master Dimmer channel in My Lights.',
    )
  })

  it('shows no template warning when the template has a master', () => {
    const withMaster = { ...noMaster, channels: { ...noMaster.channels, masterDimmer: 1 } }
    renderCanvas([parAt('B', 2, 5)], [withMaster])

    expect(screen.queryByText(/Master Dimmer channel in My Lights/)).toBeNull()
  })
})
