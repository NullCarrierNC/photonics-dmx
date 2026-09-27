/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import type { DmxFixture, DmxRig } from '../../../photonics-dmx/types'
import {
  createMockLightingConfig,
  rgbFixture,
  rgbLight,
} from '../../../photonics-dmx/tests/helpers/testFixtures'
import { dmxRigsAtom, myDmxLightsAtom } from './../atoms'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const saveMyLights = jest.mocked(ipcApi.saveMyLights)

import MyLights from './MyLights'
import ConfirmModalHost from '../components/ConfirmModalHost'

const PAR = rgbFixture({
  id: 'par',
  name: 'Front PAR',
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
})

function rigUsing(templateId: string): DmxRig {
  return {
    id: 'rig-1',
    name: 'Stage',
    active: true,
    config: createMockLightingConfig({
      frontLights: [rgbLight({ id: 'A', fixtureId: templateId })],
    }),
  }
}

function renderPage(lights: DmxFixture[], rigs: DmxRig[]) {
  return renderWithProviders(
    <>
      <MyLights />
      <ConfirmModalHost />
    </>,
    {
      seed: (set) => {
        set(myDmxLightsAtom, lights)
        set(dmxRigsAtom, rigs)
      },
    },
  )
}

/** Opens the PAR, ticks its hardware strobe channel without giving it a number, and saves. */
function saveWithStrobeUnset(): void {
  fireEvent.click(screen.getByText('Front PAR'))
  fireEvent.click(screen.getByLabelText('Use Hardware Strobe Channel?'))
  fireEvent.click(screen.getByText('Save'))
}

beforeEach(() => {
  resetIpcApiMock()
})
afterEach(() => cleanup())

describe('saving a light a rig uses with a channel still at 0', () => {
  it('names the channel and says the rig lights will not drive it', async () => {
    renderPage([PAR], [rigUsing('par')])

    saveWithStrobeUnset()

    const prompt = await screen.findByRole('alertdialog')
    expect(prompt).toHaveTextContent('Strobe Speed')
    expect(prompt).toHaveTextContent(/lights in your rigs that use Front PAR won't drive it/i)
    expect(saveMyLights).not.toHaveBeenCalled()
  })

  it('says the rig lights stay dark while the master is unset', async () => {
    const noMaster = { ...PAR, channels: { ...PAR.channels, masterDimmer: 0 } }
    renderPage([noMaster], [rigUsing('par')])

    fireEvent.click(screen.getByText('Front PAR'))
    fireEvent.click(screen.getByText('Save'))

    const prompt = await screen.findByRole('alertdialog')
    expect(prompt).toHaveTextContent(
      'Master Dimmer has no DMX channel yet. Lights in your rigs that use Front PAR stay dark until Front PAR has a Master Dimmer.',
    )
  })

  it('names every unset channel and says an unset master leaves the rig lights dark', async () => {
    const noMaster = { ...PAR, channels: { ...PAR.channels, masterDimmer: 0 } }
    renderPage([noMaster], [rigUsing('par')])

    saveWithStrobeUnset()

    const prompt = await screen.findByRole('alertdialog')
    expect(prompt).toHaveTextContent(
      'Master Dimmer and Strobe Speed have no DMX channel yet. Lights in your rigs that use Front PAR stay dark until Front PAR has a Master Dimmer.',
    )
  })

  it('saves the light as it stands when the user saves anyway', async () => {
    renderPage([PAR], [rigUsing('par')])

    saveWithStrobeUnset()
    const prompt = await screen.findByRole('alertdialog')
    fireEvent.click(within(prompt).getByRole('button', { name: 'Save anyway' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(saveMyLights).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'par',
        channels: expect.objectContaining({ strobeChannel: 0 }),
      }),
    ])
  })

  it('keeps the editor open with the edit when the user goes back to it', async () => {
    renderPage([PAR], [rigUsing('par')])

    saveWithStrobeUnset()
    const prompt = await screen.findByRole('alertdialog')
    fireEvent.click(within(prompt).getByRole('button', { name: 'Keep editing' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText<HTMLInputElement>('Use Hardware Strobe Channel?').checked).toBe(
      true,
    )
    expect(saveMyLights).not.toHaveBeenCalled()
  })

  it('saves without asking when no rig uses the light', async () => {
    renderPage([PAR], [rigUsing('another-template')])

    saveWithStrobeUnset()

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(saveMyLights).toHaveBeenCalledTimes(1)
  })
})
