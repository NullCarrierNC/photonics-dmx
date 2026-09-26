/** @jest-environment jsdom */
/**
 * Behaviour of the DMX Output Configuration panel: which senders are turned on, the settings each
 * one carries, and what reaches the backend when either changes.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import {
  enttecProComPortAtom,
  lightingPrefsAtom,
  openDmxComPortAtom,
  senderArtNetEnabledAtom,
  senderEnttecProEnabledAtom,
  senderOpenDmxEnabledAtom,
  senderSacnEnabledAtom,
  type LightingPreferences,
} from '../atoms'

type NetworkResult = Awaited<ReturnType<typeof ipcApi.getNetworkInterfaces>>

let networkResult: NetworkResult = { success: true, interfaces: [] }

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const savePrefsMock = jest.mocked(ipcApi.savePrefs)
const enableSenderMock = jest.mocked(ipcApi.enableSender)
const disableSenderMock = jest.mocked(ipcApi.disableSender)
const updateSacnConfigMock = jest.mocked(ipcApi.updateSacnConfig)
const updateArtNetConfigMock = jest.mocked(ipcApi.updateArtNetConfig)
const updateEnttecConfigMock = jest.mocked(ipcApi.updateEnttecConfig)
const getNetworkInterfacesMock = jest.mocked(ipcApi.getNetworkInterfaces)

import DmxOutputSettings from './DmxOutputSettings'
import { ToastStack } from './Toast'
import { DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT } from '../../../shared/dmxOutputRefresh'

type OutputConfig = NonNullable<LightingPreferences['dmxOutputConfig']>
type SettingsPrefs = NonNullable<LightingPreferences['dmxSettingsPrefs']>

/** The saved output config, every sender off unless named. */
function outputConfig(overrides: Partial<OutputConfig> = {}): OutputConfig {
  return {
    sacnEnabled: false,
    artNetEnabled: false,
    enttecProEnabled: false,
    openDmxEnabled: false,
    ...overrides,
  }
}

/** The saved card expansion state, every card collapsed unless named. */
function expansion(overrides: Partial<SettingsPrefs> = {}): SettingsPrefs {
  return {
    artNetExpanded: false,
    sacnExpanded: false,
    enttecProExpanded: false,
    openDmxExpanded: false,
    ...overrides,
  }
}

type RunningSenders = { sacn?: boolean; artnet?: boolean; enttecpro?: boolean; opendmx?: boolean }

async function renderPanel(prefs: LightingPreferences = {}, running: RunningSenders = {}) {
  // The window's toast stack renders beside the panel, as WindowShell renders it in the app.
  const { store } = renderWithProviders(
    <>
      <DmxOutputSettings />
      <ToastStack />
    </>,
    {
      seed: (set) => {
        set(lightingPrefsAtom, prefs)
        set(senderSacnEnabledAtom, running.sacn ?? false)
        set(senderArtNetEnabledAtom, running.artnet ?? false)
        set(senderEnttecProEnabledAtom, running.enttecpro ?? false)
        set(senderOpenDmxEnabledAtom, running.opendmx ?? false)
      },
    },
  )
  // The network interface list is fetched on mount, so waiting on it settles the first render.
  await waitFor(() => expect(getNetworkInterfacesMock).toHaveBeenCalled())
  return store
}

const savedOutputConfig = (): OutputConfig => {
  const call = savePrefsMock.mock.calls.find((c) => 'dmxOutputConfig' in c[0])
  if (!call) throw new Error('no dmxOutputConfig was saved')
  return call[0].dmxOutputConfig as OutputConfig
}

beforeEach(() => {
  resetIpcApiMock()
  getNetworkInterfacesMock.mockImplementation(async () => networkResult)
  networkResult = { success: true, interfaces: [] }
})

afterEach(() => cleanup())

describe('DmxOutputSettings sender checkboxes', () => {
  it('reads the saved config rather than the senders the backend reports running', async () => {
    await renderPanel({ dmxOutputConfig: outputConfig({ sacnEnabled: true }) }, { artnet: true })

    expect((screen.getByLabelText('sACN') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('ArtNet') as HTMLInputElement).checked).toBe(false)
  })

  it('holds a box while its flag saves, so a second click saves and starts nothing more', async () => {
    let finishSave!: (result: { success: true }) => void
    savePrefsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = resolve
        }),
    )
    await renderPanel({ dmxOutputConfig: outputConfig() })

    fireEvent.click(screen.getByLabelText('sACN'))
    await waitFor(() => expect(savePrefsMock).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('sACN')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('sACN'))
    await act(async () => finishSave({ success: true }))

    await waitFor(() => expect(screen.getByLabelText('sACN')).not.toBeDisabled())
    expect(savePrefsMock).toHaveBeenCalledTimes(1)
    expect(enableSenderMock).toHaveBeenCalledTimes(1)
  })

  it('keeps both flags when a second box is ticked before the first one saves', async () => {
    const finishes: Array<() => void> = []
    savePrefsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishes.push(() => resolve({ success: true }))
        }),
    )
    const store = await renderPanel({ dmxOutputConfig: outputConfig() })

    fireEvent.click(screen.getByLabelText('sACN'))
    fireEvent.click(screen.getByLabelText('ArtNet'))
    for (let i = 0; i < 2; i++) {
      await waitFor(() => expect(finishes.length).toBeGreaterThan(i))
      await act(async () => finishes[i]())
    }

    await waitFor(() =>
      expect(store.get(lightingPrefsAtom).dmxOutputConfig).toEqual(
        outputConfig({ sacnEnabled: true, artNetEnabled: true }),
      ),
    )
    const lastSaved = savePrefsMock.mock.calls.at(-1)![0].dmxOutputConfig
    expect(lastSaved).toEqual(outputConfig({ sacnEnabled: true, artNetEnabled: true }))
  })

  it('offers every sender the panel can drive', async () => {
    await renderPanel({ dmxOutputConfig: outputConfig() })

    for (const label of ['sACN', 'ArtNet', 'Enttec Pro USB', 'OpenDMX USB']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })
})

const SENDERS = [
  { label: 'sACN', flag: 'sacnEnabled', sender: 'sacn', atom: senderSacnEnabledAtom },
  { label: 'ArtNet', flag: 'artNetEnabled', sender: 'artnet', atom: senderArtNetEnabledAtom },
  {
    label: 'Enttec Pro USB',
    flag: 'enttecProEnabled',
    sender: 'enttecpro',
    atom: senderEnttecProEnabledAtom,
  },
  {
    label: 'OpenDMX USB',
    flag: 'openDmxEnabled',
    sender: 'opendmx',
    atom: senderOpenDmxEnabledAtom,
  },
] as const

/** A saved output config with exactly the named senders on. */
function enabled(...flags: Array<keyof OutputConfig>): OutputConfig {
  const config = outputConfig()
  for (const flag of flags) {
    config[flag] = true
  }
  return config
}

/** Backend state where exactly the named sender is running. */
function onlyRunning(sender: string): RunningSenders {
  return {
    sacn: sender === 'sacn',
    artnet: sender === 'artnet',
    enttecpro: sender === 'enttecpro',
    opendmx: sender === 'opendmx',
  }
}

for (const { label, flag, sender, atom } of SENDERS) {
  describe(`DmxOutputSettings ${label} toggle`, () => {
    /** Another sender already on, so the write can be seen to carry it through. */
    const other = SENDERS.find((s) => s.flag !== flag)!.flag

    it('saves all four flags with only its own changed', async () => {
      await renderPanel({ dmxOutputConfig: enabled(other) })

      fireEvent.click(screen.getByLabelText(label))

      await waitFor(() => expect(savedOutputConfig()).toEqual(enabled(flag, other)))
    })

    it('starts the sender and marks it running', async () => {
      const store = await renderPanel({ dmxOutputConfig: outputConfig() })

      fireEvent.click(screen.getByLabelText(label))

      await waitFor(() =>
        expect(enableSenderMock).toHaveBeenCalledWith(expect.objectContaining({ sender })),
      )
      expect(store.get(atom)).toBe(true)
    })

    it('stops the sender and marks it stopped', async () => {
      const store = await renderPanel({ dmxOutputConfig: enabled(flag) }, onlyRunning(sender))

      fireEvent.click(screen.getByLabelText(label))

      await waitFor(() => expect(disableSenderMock).toHaveBeenCalledWith({ sender }))
      expect(store.get(atom)).toBe(false)
      expect(savedOutputConfig()[flag]).toBe(false)
    })

    it('saves the flag without starting a sender the backend already runs', async () => {
      await renderPanel({ dmxOutputConfig: outputConfig() }, onlyRunning(sender))

      fireEvent.click(screen.getByLabelText(label))

      await waitFor(() => expect(savedOutputConfig()[flag]).toBe(true))
      expect(enableSenderMock).not.toHaveBeenCalled()
    })

    it('saves the flag without stopping a sender the backend already reports stopped', async () => {
      await renderPanel({ dmxOutputConfig: enabled(flag) })

      fireEvent.click(screen.getByLabelText(label))

      await waitFor(() => expect(savedOutputConfig()[flag]).toBe(false))
      expect(disableSenderMock).not.toHaveBeenCalled()
    })
  })
}

describe('DmxOutputSettings sender startup payloads', () => {
  it('hands sACN its resolved network config', async () => {
    await renderPanel({
      dmxOutputConfig: outputConfig(),
      sacnConfig: { universe: 7, useUnicast: false },
    })

    fireEvent.click(screen.getByLabelText('sACN'))

    await waitFor(() =>
      expect(enableSenderMock).toHaveBeenCalledWith({
        sender: 'sacn',
        universe: 7,
        networkInterface: '',
        unicastDestination: '',
        useUnicast: false,
        refreshRateHz: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
      }),
    )
  })

  it('hands ArtNet its resolved network config', async () => {
    await renderPanel({
      dmxOutputConfig: outputConfig(),
      artNetConfig: { host: '10.0.0.5', universe: 0, net: 0, subnet: 0, subuni: 0, port: 6454 },
    })

    fireEvent.click(screen.getByLabelText('ArtNet'))

    await waitFor(() =>
      expect(enableSenderMock).toHaveBeenCalledWith({
        sender: 'artnet',
        host: '10.0.0.5',
        universe: 0,
        net: 0,
        subnet: 0,
        subuni: 0,
        port: 6454,
        refreshRateHz: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
      }),
    )
  })

  it('hands Enttec Pro the saved serial port', async () => {
    await renderPanel({
      dmxOutputConfig: outputConfig(),
      enttecProConfig: { port: 'COM7', dmxSpeed: 40 },
    })

    fireEvent.click(screen.getByLabelText('Enttec Pro USB'))

    await waitFor(() =>
      expect(enableSenderMock).toHaveBeenCalledWith({
        sender: 'enttecpro',
        devicePath: 'COM7',
        dmxSpeed: 40,
      }),
    )
  })

  it('hands OpenDMX the saved serial port and its own rate', async () => {
    await renderPanel({
      dmxOutputConfig: outputConfig(),
      openDmxConfig: { port: '/dev/ttyUSB0', dmxSpeed: 30 },
    })

    fireEvent.click(screen.getByLabelText('OpenDMX USB'))

    await waitFor(() =>
      expect(enableSenderMock).toHaveBeenCalledWith({
        sender: 'opendmx',
        devicePath: '/dev/ttyUSB0',
        dmxSpeed: 30,
      }),
    )
  })
})

describe('DmxOutputSettings on mount', () => {
  it('writes no output config over one it has not read yet', async () => {
    const store = await renderPanel({}, { sacn: true, opendmx: true })
    await act(async () => {})

    expect(savePrefsMock).not.toHaveBeenCalled()
    expect(store.get(lightingPrefsAtom).dmxOutputConfig).toBeUndefined()
  })

  it('leaves a saved config alone', async () => {
    await renderPanel({ dmxOutputConfig: outputConfig() }, { sacn: true })

    expect(savePrefsMock).not.toHaveBeenCalled()
  })
})

/** Type a value and leave the field, which is when the panel is told about it. */
function commit(field: Element, value: string): void {
  fireEvent.change(field, { target: { value } })
  fireEvent.blur(field)
}

/** Holds the first prefs write open, answering every later one at once, until released. */
function holdFirstPrefsWrite(): () => Promise<void> {
  let release: (() => void) | undefined
  savePrefsMock
    .mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return { success: true }
    })
    .mockImplementation(async () => ({ success: true }))
  return async () => {
    await waitFor(() => expect(release).toBeDefined())
    await act(async () => release?.())
  }
}

describe('DmxOutputSettings global publishing rate', () => {
  const advanced = (over: LightingPreferences = {}): LightingPreferences => ({
    advancedModeEnabled: true,
    dmxOutputConfig: outputConfig(),
    ...over,
  })

  it('stays hidden outside advanced mode', async () => {
    await renderPanel({ dmxOutputConfig: outputConfig(), globalDmxPublishingRateHz: 30 })

    expect(screen.queryByText('Global DMX Publishing Rate')).toBeNull()
  })

  it('shows the stored rate in advanced mode', async () => {
    await renderPanel(advanced({ globalDmxPublishingRateHz: 30 }))

    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('30')
  })

  it('defaults to the DMX-512 ceiling when nothing is stored', async () => {
    await renderPanel(advanced())

    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('44')
  })

  it('holds a rate below the floor at 10', async () => {
    await renderPanel(advanced())

    commit(screen.getByRole('spinbutton'), '2')

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({ globalDmxPublishingRateHz: 10 }),
    )
  })

  it('holds a rate above the ceiling at 44', async () => {
    await renderPanel(advanced({ globalDmxPublishingRateHz: 30 }))

    commit(screen.getByRole('spinbutton'), '200')

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({ globalDmxPublishingRateHz: 44 }),
    )
  })

  it('shows the stored rate again when the save is refused', async () => {
    savePrefsMock.mockResolvedValue({ success: false, error: 'read only' } as never)
    await renderPanel(advanced({ globalDmxPublishingRateHz: 30 }))
    const field = screen.getByRole('spinbutton') as HTMLInputElement

    commit(field, '20')

    await waitFor(() => expect(savePrefsMock).toHaveBeenCalled())
    await waitFor(() => expect(field.value).toBe('30'))
  })

  it('says nothing when the committed rate is the one already stored', async () => {
    await renderPanel(advanced({ globalDmxPublishingRateHz: 30 }))

    commit(screen.getByRole('spinbutton'), '30')

    expect(savePrefsMock).not.toHaveBeenCalled()
  })

  it('keeps the stored rate when the field is cleared', async () => {
    await renderPanel(advanced({ globalDmxPublishingRateHz: 30 }))
    const field = screen.getByRole('spinbutton') as HTMLInputElement

    commit(field, '')

    expect(savePrefsMock).not.toHaveBeenCalled()
    expect(field.value).toBe('30')
  })
})

describe('DmxOutputSettings OpenDMX refresh rate', () => {
  const openDmxOpen = (dmxSpeed = 40): LightingPreferences => ({
    dmxOutputConfig: outputConfig({ openDmxEnabled: true }),
    dmxSettingsPrefs: expansion({ openDmxExpanded: true }),
    openDmxConfig: { port: 'COM4', dmxSpeed },
  })

  const savedOpenDmx = () => {
    const call = savePrefsMock.mock.calls.find((c) => 'openDmxConfig' in c[0])
    if (!call) throw new Error('no openDmxConfig was saved')
    return call[0].openDmxConfig as { port: string; dmxSpeed: number }
  }

  it('accepts a rate below the floor the network senders hold to', async () => {
    await renderPanel(openDmxOpen())

    commit(screen.getByRole('spinbutton'), '5')

    await waitFor(() => expect(savedOpenDmx().dmxSpeed).toBe(5))
  })

  it('holds a rate above the ceiling at 44', async () => {
    await renderPanel(openDmxOpen())

    commit(screen.getByRole('spinbutton'), '200')

    await waitFor(() => expect(savedOpenDmx().dmxSpeed).toBe(44))
  })

  it('keeps the stored rate when the field is cleared', async () => {
    await renderPanel(openDmxOpen(20))
    const field = screen.getByRole('spinbutton') as HTMLInputElement

    commit(field, '')

    expect(savePrefsMock).not.toHaveBeenCalled()
    expect(field.value).toBe('20')
  })

  it('saves the 40 Hz default when zero is entered', async () => {
    await renderPanel(openDmxOpen(20))

    commit(screen.getByRole('spinbutton'), '0')

    await waitFor(() => expect(savedOpenDmx().dmxSpeed).toBe(40))
  })

  it('keeps the port when only the rate changes', async () => {
    await renderPanel(openDmxOpen())

    commit(screen.getByRole('spinbutton'), '25')

    await waitFor(() => expect(savedOpenDmx()).toEqual({ port: 'COM4', dmxSpeed: 25 }))
  })

  it('commits the port then the rate from one round-trip without either clobbering the other', async () => {
    let releaseFirst: (() => void) | undefined
    savePrefsMock
      .mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
        return { success: true }
      })
      .mockImplementation(async () => ({ success: true }))

    await renderPanel(openDmxOpen())

    commit(screen.getByPlaceholderText('COM4'), 'COM9')
    commit(screen.getByRole('spinbutton'), '20')

    await waitFor(() => expect(releaseFirst).toBeDefined())
    await act(async () => {
      releaseFirst?.()
    })

    const openDmxCalls = () =>
      savePrefsMock.mock.calls
        .filter((c) => 'openDmxConfig' in c[0])
        .map((c) => c[0].openDmxConfig as { port: string; dmxSpeed: number })
    await waitFor(() => expect(openDmxCalls()).toHaveLength(2))
    expect(openDmxCalls()[1]).toEqual({ port: 'COM9', dmxSpeed: 20 })
  })
})

describe('DmxOutputSettings Enttec Pro refresh rate', () => {
  const enttecOpen = (config: { port?: string; dmxSpeed?: number } = {}): LightingPreferences => ({
    dmxOutputConfig: outputConfig({ enttecProEnabled: true }),
    dmxSettingsPrefs: expansion({ enttecProExpanded: true }),
    enttecProConfig: { port: 'COM7', dmxSpeed: 40, ...config },
  })

  const savedEnttecCalls = (): Array<{ port: string; dmxSpeed: number }> =>
    savePrefsMock.mock.calls
      .filter((c) => 'enttecProConfig' in c[0])
      .map((c) => c[0].enttecProConfig as { port: string; dmxSpeed: number })

  const lastSavedEnttec = (): { port: string; dmxSpeed: number } => {
    const calls = savedEnttecCalls()
    if (calls.length === 0) throw new Error('no enttecProConfig was saved')
    return calls[calls.length - 1]
  }

  it('rounds and clamps to the floor of 10', async () => {
    await renderPanel(enttecOpen())
    commit(screen.getByLabelText('Refresh Rate'), '2')
    await waitFor(() => expect(lastSavedEnttec().dmxSpeed).toBe(10))
  })

  it('rounds and clamps to the ceiling of 44', async () => {
    await renderPanel(enttecOpen())
    commit(screen.getByLabelText('Refresh Rate'), '200')
    await waitFor(() => expect(lastSavedEnttec().dmxSpeed).toBe(44))
  })

  it('rounds a fractional rate to the nearest whole Hz', async () => {
    await renderPanel(enttecOpen())
    commit(screen.getByLabelText('Refresh Rate'), '20.6')
    await waitFor(() => expect(lastSavedEnttec().dmxSpeed).toBe(21))
  })

  it('pushes the merged config to a running sender', async () => {
    await renderPanel(enttecOpen({ port: 'COM7', dmxSpeed: 40 }), { enttecpro: true })

    commit(screen.getByLabelText('Refresh Rate'), '20')

    await waitFor(() =>
      expect(updateEnttecConfigMock).toHaveBeenCalledWith({ devicePath: 'COM7', dmxSpeed: 20 }),
    )
  })

  it('pushes an edit the panel does not yet show as running, leaving main to decide', async () => {
    await renderPanel(enttecOpen({ port: 'COM7', dmxSpeed: 40 }), { enttecpro: false })

    commit(screen.getByLabelText('Refresh Rate'), '25')

    await waitFor(() =>
      expect(updateEnttecConfigMock).toHaveBeenCalledWith({ devicePath: 'COM7', dmxSpeed: 25 }),
    )
  })

  it('commits the port then the rate from one round-trip without either clobbering the other', async () => {
    let releaseFirst: (() => void) | undefined
    savePrefsMock
      .mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
        return { success: true }
      })
      .mockImplementation(async () => ({ success: true }))

    await renderPanel(enttecOpen({ port: 'COM7', dmxSpeed: 40 }))

    commit(screen.getByPlaceholderText('COM3'), 'COM9')
    commit(screen.getByLabelText('Refresh Rate'), '20')

    await waitFor(() => expect(releaseFirst).toBeDefined())
    await act(async () => {
      releaseFirst?.()
    })

    await waitFor(() => expect(savedEnttecCalls()).toHaveLength(2))
    // The port commit persists first, holding the original rate, then the rate commit persists
    // the merged config, carrying the new port forward rather than the stale one it started with.
    expect(savedEnttecCalls()[0]).toEqual({ port: 'COM9', dmxSpeed: 40 })
    expect(savedEnttecCalls()[1]).toEqual({ port: 'COM9', dmxSpeed: 20 })
  })

  it('leaves the stored config and running sender untouched when the save is refused', async () => {
    savePrefsMock.mockResolvedValueOnce({ success: false, error: 'disk full' })
    const store = await renderPanel(enttecOpen({ port: 'COM7', dmxSpeed: 40 }), {
      enttecpro: true,
    })

    commit(screen.getByLabelText('Refresh Rate'), '20')

    await waitFor(() => expect(savePrefsMock).toHaveBeenCalled())
    expect(updateEnttecConfigMock).not.toHaveBeenCalled()
    expect(store.get(lightingPrefsAtom).enttecProConfig).toEqual({ port: 'COM7', dmxSpeed: 40 })
  })
})

describe('DmxOutputSettings serial ports', () => {
  it('hands the Enttec Pro toggle a port only once it is stored', async () => {
    const release = holdFirstPrefsWrite()
    const store = await renderPanel({
      dmxOutputConfig: outputConfig({ enttecProEnabled: true }),
      dmxSettingsPrefs: expansion({ enttecProExpanded: true }),
      enttecProConfig: { port: 'COM7', dmxSpeed: 40 },
    })

    commit(screen.getByPlaceholderText('COM3'), 'COM9')
    await waitFor(() => expect(savePrefsMock).toHaveBeenCalled())
    expect(store.get(enttecProComPortAtom)).toBe('COM7')

    await release()
    await waitFor(() => expect(store.get(enttecProComPortAtom)).toBe('COM9'))
  })

  it('hands the OpenDMX toggle a port only once it is stored', async () => {
    const release = holdFirstPrefsWrite()
    const store = await renderPanel({
      dmxOutputConfig: outputConfig({ openDmxEnabled: true }),
      dmxSettingsPrefs: expansion({ openDmxExpanded: true }),
      openDmxConfig: { port: 'COM5', dmxSpeed: 30 },
    })

    commit(screen.getByPlaceholderText('COM4'), 'COM8')
    await waitFor(() => expect(savePrefsMock).toHaveBeenCalled())
    expect(store.get(openDmxComPortAtom)).toBe('COM5')

    await release()
    await waitFor(() => expect(store.get(openDmxComPortAtom)).toBe('COM8'))
  })

  it('keeps the stored port for the toggle when the port save is refused', async () => {
    savePrefsMock.mockResolvedValueOnce({ success: false, error: 'disk full' })
    const store = await renderPanel({
      dmxOutputConfig: outputConfig({ enttecProEnabled: true }),
      dmxSettingsPrefs: expansion({ enttecProExpanded: true }),
      enttecProConfig: { port: 'COM7', dmxSpeed: 40 },
    })

    commit(screen.getByPlaceholderText('COM3'), 'COM9')

    await waitFor(() => expect(savePrefsMock).toHaveBeenCalled())
    await act(async () => {})
    expect(store.get(enttecProComPortAtom)).toBe('COM7')
  })
})

describe('DmxOutputSettings sACN configuration', () => {
  const sacnOpen = (over: LightingPreferences = {}): LightingPreferences => ({
    dmxOutputConfig: outputConfig({ sacnEnabled: true }),
    dmxSettingsPrefs: expansion({ sacnExpanded: true }),
    ...over,
  })

  const universeInput = () => screen.getAllByRole('spinbutton')[0]
  const refreshInput = () => screen.getAllByRole('spinbutton')[1]

  it('saves the whole resolved config when one field changes', async () => {
    await renderPanel(sacnOpen())

    commit(universeInput(), '9')

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({
        sacnConfig: {
          universe: 9,
          networkInterface: '',
          unicastDestination: '',
          useUnicast: false,
          refreshRateHz: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
        },
      }),
    )
  })

  it('clamps the refresh rate to the network floor', async () => {
    await renderPanel(sacnOpen())

    commit(refreshInput(), '2')

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith(
        expect.objectContaining({ sacnConfig: expect.objectContaining({ refreshRateHz: 10 }) }),
      ),
    )
  })

  it('pushes the change to a running sender', async () => {
    await renderPanel(sacnOpen(), { sacn: true })

    commit(universeInput(), '9')

    await waitFor(() =>
      expect(updateSacnConfigMock).toHaveBeenCalledWith(expect.objectContaining({ universe: 9 })),
    )
  })

  it('says so on screen when the running sender will not take the change', async () => {
    await renderPanel(sacnOpen(), { sacn: true })
    updateSacnConfigMock.mockResolvedValueOnce({
      success: false,
      error: 'universe must be between 1-63999',
    } as never)

    commit(universeInput(), '9')

    expect(await screen.findByText(/could not apply the sACN configuration/i)).toBeInTheDocument()
  })

  it('says so on screen when the running sender cannot be reached', async () => {
    await renderPanel(sacnOpen(), { sacn: true })
    updateSacnConfigMock.mockRejectedValueOnce(new Error('bridge gone'))

    commit(universeInput(), '9')

    expect(await screen.findByText(/could not apply the sACN configuration/i)).toBeInTheDocument()
  })

  it('saves without pushing when the sender is not running', async () => {
    await renderPanel(sacnOpen())

    commit(universeInput(), '9')

    await waitFor(() => expect(savePrefsMock).toHaveBeenCalled())
    expect(updateSacnConfigMock).not.toHaveBeenCalled()
  })

  it('commits the universe then the rate from one round-trip without either clobbering the other', async () => {
    const releaseFirst = holdFirstPrefsWrite()
    const store = await renderPanel(sacnOpen(), { sacn: true })

    commit(universeInput(), '9')
    commit(refreshInput(), '20')
    await releaseFirst()

    const saved = () =>
      savePrefsMock.mock.calls.filter((c) => 'sacnConfig' in c[0]).map((c) => c[0].sacnConfig)
    await waitFor(() => expect(saved()).toHaveLength(2))
    expect(saved()[1]).toEqual(expect.objectContaining({ universe: 9, refreshRateHz: 20 }))
    await waitFor(() => expect(updateSacnConfigMock).toHaveBeenCalledTimes(2))
    expect(updateSacnConfigMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ universe: 9, refreshRateHz: 20 }),
    )
    expect(store.get(lightingPrefsAtom).sacnConfig).toEqual(
      expect.objectContaining({ universe: 9, refreshRateHz: 20 }),
    )
  })

  it('offers the loaded network interfaces alongside auto-detect', async () => {
    networkResult = {
      success: true,
      interfaces: [{ name: 'en0', value: '192.168.1.2', family: 'IPv4' }],
    }
    await renderPanel(sacnOpen())

    const select = await screen.findByRole('combobox')
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.value)).toEqual([
      '',
      '192.168.1.2',
    ])
  })

  it('offers auto-detect alone when the interface load fails', async () => {
    networkResult = { success: false, interfaces: [], error: 'no adapters' }
    await renderPanel(sacnOpen())

    const select = screen.getByRole('combobox')
    expect((select as HTMLSelectElement).options).toHaveLength(1)
  })
})

describe('DmxOutputSettings ArtNet configuration', () => {
  const artNetOpen = (over: LightingPreferences = {}): LightingPreferences => ({
    dmxOutputConfig: outputConfig({ artNetEnabled: true }),
    dmxSettingsPrefs: expansion({ artNetExpanded: true }),
    ...over,
  })

  it('saves the whole resolved config when the host changes', async () => {
    await renderPanel(artNetOpen())

    commit(screen.getByPlaceholderText('127.0.0.1'), '10.0.0.9')

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({
        artNetConfig: {
          host: '10.0.0.9',
          universe: 0,
          net: 0,
          subnet: 0,
          subuni: 0,
          port: 6454,
          refreshRateHz: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
        },
      }),
    )
  })

  it('pushes the change to a running sender', async () => {
    await renderPanel(artNetOpen(), { artnet: true })

    commit(screen.getByPlaceholderText('127.0.0.1'), '10.0.0.9')

    await waitFor(() =>
      expect(updateArtNetConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({ host: '10.0.0.9' }),
      ),
    )
  })

  it('commits the host then the port from one round-trip without either clobbering the other', async () => {
    const releaseFirst = holdFirstPrefsWrite()
    const store = await renderPanel(artNetOpen(), { artnet: true })

    commit(screen.getByPlaceholderText('127.0.0.1'), '10.0.0.2')
    commit(screen.getByLabelText('Port'), '6455')
    await releaseFirst()

    const saved = () =>
      savePrefsMock.mock.calls.filter((c) => 'artNetConfig' in c[0]).map((c) => c[0].artNetConfig)
    await waitFor(() => expect(saved()).toHaveLength(2))
    expect(saved()[1]).toEqual(expect.objectContaining({ host: '10.0.0.2', port: 6455 }))
    await waitFor(() => expect(updateArtNetConfigMock).toHaveBeenCalledTimes(2))
    expect(updateArtNetConfigMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ host: '10.0.0.2', port: 6455 }),
    )
    expect(store.get(lightingPrefsAtom).artNetConfig).toEqual(
      expect.objectContaining({ host: '10.0.0.2', port: 6455 }),
    )
  })
})

describe('DmxOutputSettings editing a field', () => {
  const artNetOpen = (over: LightingPreferences = {}): LightingPreferences => ({
    dmxOutputConfig: outputConfig({ artNetEnabled: true }),
    dmxSettingsPrefs: expansion({ artNetExpanded: true }),
    ...over,
  })

  it('leaves a running sender alone until the address is finished', async () => {
    await renderPanel(artNetOpen(), { artnet: true })
    const host = screen.getByPlaceholderText('127.0.0.1')

    for (const partial of ['1', '19', '192', '192.', '192.168.1.100']) {
      fireEvent.change(host, { target: { value: partial } })
    }

    expect(updateArtNetConfigMock).not.toHaveBeenCalled()
    expect(savePrefsMock).not.toHaveBeenCalled()

    fireEvent.blur(host)

    await waitFor(() =>
      expect(updateArtNetConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({ host: '192.168.1.100' }),
      ),
    )
    expect(updateArtNetConfigMock).toHaveBeenCalledTimes(1)
  })

  it('accepts a rate whose first digit is below the floor', async () => {
    // Clamping as the digits arrive replaced the 1 of 15 with the floor of 10, so the 5 landed on
    // that and the field settled on 44. The rate is only clamped once the field is left.
    await renderPanel(artNetOpen())
    const rate = screen.getByLabelText('Refresh Rate')

    fireEvent.change(rate, { target: { value: '1' } })
    fireEvent.change(rate, { target: { value: '15' } })
    fireEvent.blur(rate)

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith(
        expect.objectContaining({ artNetConfig: expect.objectContaining({ refreshRateHz: 15 }) }),
      ),
    )
  })
})

describe('DmxOutputSettings card expansion', () => {
  it('opens the cards the saved state names', async () => {
    await renderPanel({
      dmxOutputConfig: outputConfig({ sacnEnabled: true }),
      dmxSettingsPrefs: expansion({ sacnExpanded: true }),
    })

    const header = screen.getByRole('button', { name: /sACN Configuration/ })
    expect(header.getAttribute('aria-expanded')).toBe('true')
  })

  it('leaves the cards the saved state omits closed', async () => {
    await renderPanel({
      dmxOutputConfig: outputConfig({ sacnEnabled: true }),
      dmxSettingsPrefs: expansion(),
    })

    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('saves all four expansion flags when one card is opened', async () => {
    await renderPanel({
      dmxOutputConfig: outputConfig({ sacnEnabled: true }),
      dmxSettingsPrefs: expansion(),
    })

    fireEvent.click(screen.getByRole('button', { name: /sACN Configuration/ }))

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({
        dmxSettingsPrefs: expansion({ sacnExpanded: true }),
      }),
    )
  })
})

describe('DmxOutputSettings serial ports', () => {
  it('saves the Enttec Pro port once the field is left', async () => {
    await renderPanel({
      dmxOutputConfig: outputConfig({ enttecProEnabled: true }),
      dmxSettingsPrefs: expansion({ enttecProExpanded: true }),
      enttecProConfig: { port: '', dmxSpeed: 40 },
    })

    commit(screen.getByPlaceholderText('COM3'), 'COM9')

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({
        enttecProConfig: { port: 'COM9', dmxSpeed: 40 },
      }),
    )
  })

  it('keeps what is being typed while an earlier save is still in flight', async () => {
    let releaseFirst: (() => void) | undefined
    savePrefsMock
      .mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
        return { success: true }
      })
      .mockImplementation(async () => ({ success: true }))

    await renderPanel({
      dmxOutputConfig: outputConfig({ enttecProEnabled: true }),
      dmxSettingsPrefs: expansion({ enttecProExpanded: true }),
      enttecProConfig: { port: '', dmxSpeed: 40 },
    })

    const field = screen.getByPlaceholderText('COM3') as HTMLInputElement
    commit(field, 'COM9')
    await waitFor(() => expect(releaseFirst).toBeDefined())
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: 'COM90' } })

    await act(async () => {
      releaseFirst?.()
    })

    expect(field.value).toBe('COM90')
  })

  it('saves the OpenDMX port while keeping its rate', async () => {
    await renderPanel({
      dmxOutputConfig: outputConfig({ openDmxEnabled: true }),
      dmxSettingsPrefs: expansion({ openDmxExpanded: true }),
      openDmxConfig: { port: '', dmxSpeed: 25 },
    })

    commit(screen.getByPlaceholderText('COM4'), 'COM9')

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({
        openDmxConfig: { port: 'COM9', dmxSpeed: 25 },
      }),
    )
  })
})

describe('DmxOutputSettings refused preference writes', () => {
  const refuseNextSave = (): void => {
    savePrefsMock.mockResolvedValueOnce({ success: false, error: 'disk full' })
  }

  it('leaves the checkbox alone when the write is refused', async () => {
    await renderPanel({ dmxOutputConfig: outputConfig() })
    refuseNextSave()

    fireEvent.click(screen.getByLabelText('sACN'))

    await waitFor(() => expect(savePrefsMock).toHaveBeenCalled())
    expect((screen.getByLabelText('sACN') as HTMLInputElement).checked).toBe(false)
  })

  it('starts no sender it could not save', async () => {
    const store = await renderPanel({ dmxOutputConfig: outputConfig() })
    refuseNextSave()

    fireEvent.click(screen.getByLabelText('sACN'))

    await waitFor(() => expect(savePrefsMock).toHaveBeenCalled())
    expect(enableSenderMock).not.toHaveBeenCalled()
    expect(store.get(senderSacnEnabledAtom)).toBe(false)
  })

  it('says so on screen', async () => {
    await renderPanel({ dmxOutputConfig: outputConfig() })
    refuseNextSave()

    fireEvent.click(screen.getByLabelText('sACN'))

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument()
  })

  it('leaves the checkbox alone when the write throws', async () => {
    await renderPanel({ dmxOutputConfig: outputConfig() })
    savePrefsMock.mockRejectedValueOnce(new Error('bridge gone'))

    fireEvent.click(screen.getByLabelText('sACN'))

    await waitFor(() => expect(savePrefsMock).toHaveBeenCalled())
    expect((screen.getByLabelText('sACN') as HTMLInputElement).checked).toBe(false)
    expect(enableSenderMock).not.toHaveBeenCalled()
  })
})

describe('DmxOutputSettings refused senders', () => {
  it('keeps the sender available but marks it not running when the start is refused', async () => {
    enableSenderMock.mockReturnValue({ success: false, error: 'port in use' } as never)
    const store = await renderPanel({ dmxOutputConfig: outputConfig() })

    fireEvent.click(screen.getByLabelText('sACN'))

    // setRunning(wanted) has already run by the time the call goes out, so waiting on the call is
    // what makes the assertion below read the revert.
    await waitFor(() => expect(enableSenderMock).toHaveBeenCalled())
    await waitFor(() => expect(store.get(senderSacnEnabledAtom)).toBe(false))
    // The checkbox says which senders are available, not which are running.
    await waitFor(() => expect(savedOutputConfig().sacnEnabled).toBe(true))
  })

  it('marks the sender running again when the stop is refused', async () => {
    disableSenderMock.mockReturnValue({ success: false, error: 'busy' } as never)
    const store = await renderPanel(
      { dmxOutputConfig: enabled('sacnEnabled') },
      onlyRunning('sacn'),
    )

    fireEvent.click(screen.getByLabelText('sACN'))

    await waitFor(() => expect(disableSenderMock).toHaveBeenCalled())
    await waitFor(() => expect(store.get(senderSacnEnabledAtom)).toBe(true))
  })

  it('marks the sender not running when the start throws', async () => {
    enableSenderMock.mockImplementation(() => {
      throw new Error('bridge gone')
    })
    const store = await renderPanel({ dmxOutputConfig: outputConfig() })

    fireEvent.click(screen.getByLabelText('sACN'))

    await waitFor(() => expect(store.get(senderSacnEnabledAtom)).toBe(false))
  })

  // The real bridge rejects rather than throwing on the spot.
  it('marks the sender not running when the start rejects', async () => {
    enableSenderMock.mockRejectedValue(new Error('bridge gone'))
    const store = await renderPanel({ dmxOutputConfig: outputConfig() })

    fireEvent.click(screen.getByLabelText('sACN'))

    await waitFor(() => expect(enableSenderMock).toHaveBeenCalled())
    await waitFor(() => expect(store.get(senderSacnEnabledAtom)).toBe(false))
  })
})
