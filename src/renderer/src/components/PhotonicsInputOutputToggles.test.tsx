/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import {
  audioListenerEnabledAtom,
  dmxRigsAtom,
  dmxRigsLoadedAtom,
  lightingPrefsAtom,
  myDmxLightsAtom,
  senderSacnEnabledAtom,
} from '../atoms'
import type { DmxFixture, DmxRig } from '../../../photonics-dmx/types'
import { ConfigStrobeType, FixtureTypes } from '../../../photonics-dmx/types'
import DmxSettingsAccordion from './PhotonicsInputOutputToggles'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

jest.mock(
  '../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)

const validLight: DmxFixture = {
  id: 'tpl-1',
  position: 1,
  fixture: FixtureTypes.RGB,
  label: 'Par',
  name: 'Par',
  isStrobeEnabled: false,
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
}

function rig(active: boolean): DmxRig {
  return {
    id: active ? 'on' : 'off',
    name: active ? 'Live rig' : 'Spare rig',
    active,
    config: {
      numLights: 0,
      lightLayout: { id: 'front', label: 'Front' },
      strobeType: ConfigStrobeType.None,
      frontLights: [],
      backLights: [],
      strobeLights: [],
    },
  }
}

interface Seed {
  rigs?: DmxRig[]
  rigsLoaded?: boolean
  advanced?: boolean
  audioRunning?: boolean
  lights?: DmxFixture[]
  sacnRunning?: boolean
}

async function renderToggles({
  rigs = [],
  rigsLoaded = true,
  advanced = false,
  audioRunning = false,
  lights = [validLight],
  sacnRunning = false,
}: Seed = {}) {
  renderWithProviders(<DmxSettingsAccordion startOpen />, {
    seed: (set) => {
      set(myDmxLightsAtom, lights)
      set(dmxRigsAtom, rigs)
      set(dmxRigsLoadedAtom, rigsLoaded)
      set(lightingPrefsAtom, {
        advancedModeEnabled: advanced,
        dmxOutputConfig: {
          sacnEnabled: true,
          artNetEnabled: false,
          enttecProEnabled: false,
          openDmxEnabled: false,
        },
      })
      set(audioListenerEnabledAtom, audioRunning)
      set(senderSacnEnabledAtom, sacnRunning)
    },
  })
  await waitFor(() => expect(ipcApi.getLifecyclePhase).toHaveBeenCalled())
}

const NO_RIG = /No rig is active/

describe('DmxSettingsAccordion', () => {
  beforeEach(() => {
    resetIpcApiMock()
    jest.mocked(ipcApi.getLifecyclePhase).mockResolvedValue('running' as never)
  })

  it('warns when no rig is active', async () => {
    await renderToggles({ rigs: [rig(false)] })

    expect(screen.getByText(NO_RIG)).toBeTruthy()
  })

  it('warns when there are no rigs', async () => {
    await renderToggles({ rigs: [] })

    expect(screen.getByText(NO_RIG)).toBeTruthy()
  })

  it('says nothing about rigs while one is active', async () => {
    await renderToggles({ rigs: [rig(false), rig(true)] })

    expect(screen.queryByText(NO_RIG)).toBeNull()
  })

  it('offers the audio switch in Advanced Mode', async () => {
    await renderToggles({ rigs: [rig(true)], advanced: true })

    expect(screen.getByRole('switch', { name: 'Enable Audio' })).toBeTruthy()
  })

  it('leaves the audio switch out of the basic mode while audio is off', async () => {
    await renderToggles({ rigs: [rig(true)] })

    expect(screen.queryByRole('switch', { name: 'Enable Audio' })).toBeNull()
  })

  it('keeps the audio switch while audio runs, so it can still be stopped', async () => {
    await renderToggles({ rigs: [rig(true)], audioRunning: true })

    expect(screen.getByRole('switch', { name: 'Enable Audio' })).toBeTruthy()
  })

  it('points to Retry while the controllers are stopped', async () => {
    jest.mocked(ipcApi.getLifecyclePhase).mockResolvedValue('failed' as never)

    await renderToggles({ rigs: [rig(true)] })

    expect(await screen.findByText(/stopped after an error.*Retry/)).toBeTruthy()
  })

  it('holds a stopped sender off while no lights are set up', async () => {
    await renderToggles({ lights: [] })

    const button = screen.getByRole('switch', { name: 'sACN Out' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('stops a running sender while no lights are set up', async () => {
    await renderToggles({ lights: [], sacnRunning: true })

    // The switch is locked until the lifecycle phase read lands as running.
    const button = screen.getByRole('switch', { name: 'sACN Out' }) as HTMLButtonElement
    await waitFor(() => expect(button.disabled).toBe(false))
    fireEvent.click(button)

    await waitFor(() => expect(ipcApi.disableSender).toHaveBeenCalledWith({ sender: 'sacn' }))
  })

  it('says nothing about rigs before they have been read', async () => {
    await renderToggles({ rigs: [], rigsLoaded: false })

    expect(screen.queryByText(NO_RIG)).toBeNull()
  })
})
