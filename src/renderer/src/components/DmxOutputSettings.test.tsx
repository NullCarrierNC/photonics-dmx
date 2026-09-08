/** @jest-environment jsdom */
/**
 * Behaviour of the DMX Output Configuration panel: which senders are turned on, the settings each
 * one carries, and what reaches the backend when either changes.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import {
  lightingPrefsAtom,
  senderArtNetEnabledAtom,
  senderEnttecProEnabledAtom,
  senderOpenDmxEnabledAtom,
  senderSacnEnabledAtom,
  type LightingPreferences,
} from '../atoms'

type NetworkInterface = { name: string; value: string; family: string }
type NetworkResult = { success: boolean; interfaces: NetworkInterface[]; error?: string }

let networkResult: NetworkResult = { success: true, interfaces: [] }

const savePrefsMock = jest.fn(async (_p: Record<string, unknown>) => undefined)
const enableSenderMock = jest.fn((_p: Record<string, unknown>) => undefined)
const disableSenderMock = jest.fn((_p: Record<string, unknown>) => undefined)
const updateSacnConfigMock = jest.fn(async (_c: Record<string, unknown>) => undefined)
const updateArtNetConfigMock = jest.fn(async (_c: Record<string, unknown>) => undefined)
const getNetworkInterfacesMock = jest.fn(async (): Promise<NetworkResult> => networkResult)

jest.mock('../ipcApi', () => ({
  savePrefs: (...args: unknown[]) => savePrefsMock(...(args as [Record<string, unknown>])),
  enableSender: (...args: unknown[]) => enableSenderMock(...(args as [Record<string, unknown>])),
  disableSender: (...args: unknown[]) => disableSenderMock(...(args as [Record<string, unknown>])),
  updateSacnConfig: (...args: unknown[]) =>
    updateSacnConfigMock(...(args as [Record<string, unknown>])),
  updateArtNetConfig: (...args: unknown[]) =>
    updateArtNetConfigMock(...(args as [Record<string, unknown>])),
  getNetworkInterfaces: () => getNetworkInterfacesMock(),
}))

import DmxOutputSettings from './DmxOutputSettings'

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

async function renderPanel(
  prefs: LightingPreferences = {},
  running: RunningSenders = {},
): Promise<ReturnType<typeof createStore>> {
  const store = createStore()
  store.set(lightingPrefsAtom, prefs)
  store.set(senderSacnEnabledAtom, running.sacn ?? false)
  store.set(senderArtNetEnabledAtom, running.artnet ?? false)
  store.set(senderEnttecProEnabledAtom, running.enttecpro ?? false)
  store.set(senderOpenDmxEnabledAtom, running.opendmx ?? false)
  render(
    <Provider store={store}>
      <DmxOutputSettings />
    </Provider>,
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
  jest.clearAllMocks()
  networkResult = { success: true, interfaces: [] }
})

afterEach(() => cleanup())

describe('DmxOutputSettings sender checkboxes', () => {
  it('reads the saved config rather than the senders the backend reports running', async () => {
    await renderPanel({ dmxOutputConfig: outputConfig({ sacnEnabled: true }) }, { artnet: true })

    expect((screen.getByLabelText('sACN') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('ArtNet') as HTMLInputElement).checked).toBe(false)
  })

  it('offers every sender the panel can drive', async () => {
    await renderPanel({ dmxOutputConfig: outputConfig() })

    for (const label of ['sACN', 'ArtNet', 'Enttec Pro USB', 'OpenDMX USB']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
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
        refreshRateHz: 40,
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
        refreshRateHz: 40,
      }),
    )
  })

  it('hands Enttec Pro the saved serial port', async () => {
    await renderPanel({
      dmxOutputConfig: outputConfig(),
      enttecProConfig: { port: 'COM7' },
    })

    fireEvent.click(screen.getByLabelText('Enttec Pro USB'))

    await waitFor(() =>
      expect(enableSenderMock).toHaveBeenCalledWith({ sender: 'enttecpro', devicePath: 'COM7' }),
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

describe('DmxOutputSettings first run', () => {
  it('seeds a missing saved config from the senders the backend reports running', async () => {
    const store = await renderPanel({}, { sacn: true, opendmx: true })

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({
        dmxOutputConfig: outputConfig({ sacnEnabled: true, openDmxEnabled: true }),
      }),
    )
    expect(store.get(lightingPrefsAtom).dmxOutputConfig).toEqual(
      outputConfig({ sacnEnabled: true, openDmxEnabled: true }),
    )
  })

  it('leaves a saved config alone', async () => {
    await renderPanel({ dmxOutputConfig: outputConfig() }, { sacn: true })

    expect(savePrefsMock).not.toHaveBeenCalled()
  })
})

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

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({ globalDmxPublishingRateHz: 10 }),
    )
  })

  it('holds a rate above the ceiling at 44', async () => {
    await renderPanel(advanced())

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '200' } })

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({ globalDmxPublishingRateHz: 44 }),
    )
  })

  it('falls back to the ceiling when the field is cleared', async () => {
    await renderPanel(advanced())

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({ globalDmxPublishingRateHz: 44 }),
    )
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

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } })

    await waitFor(() => expect(savedOpenDmx().dmxSpeed).toBe(5))
  })

  it('holds a rate above the ceiling at 44', async () => {
    await renderPanel(openDmxOpen())

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '200' } })

    await waitFor(() => expect(savedOpenDmx().dmxSpeed).toBe(44))
  })

  it('falls back to 40 when the field is cleared', async () => {
    await renderPanel(openDmxOpen(20))

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })

    await waitFor(() => expect(savedOpenDmx().dmxSpeed).toBe(40))
  })

  it('falls back to 40 rather than clamping a zero up', async () => {
    await renderPanel(openDmxOpen(20))

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })

    await waitFor(() => expect(savedOpenDmx().dmxSpeed).toBe(40))
  })

  it('keeps the port when only the rate changes', async () => {
    await renderPanel(openDmxOpen())

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '25' } })

    await waitFor(() => expect(savedOpenDmx()).toEqual({ port: 'COM4', dmxSpeed: 25 }))
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

    fireEvent.change(universeInput(), { target: { value: '9' } })

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({
        sacnConfig: {
          universe: 9,
          networkInterface: '',
          unicastDestination: '',
          useUnicast: false,
          refreshRateHz: 40,
        },
      }),
    )
  })

  it('clamps the refresh rate to the network floor', async () => {
    await renderPanel(sacnOpen())

    fireEvent.change(refreshInput(), { target: { value: '2' } })

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith(
        expect.objectContaining({ sacnConfig: expect.objectContaining({ refreshRateHz: 10 }) }),
      ),
    )
  })

  it('pushes the change to a running sender', async () => {
    await renderPanel(sacnOpen(), { sacn: true })

    fireEvent.change(universeInput(), { target: { value: '9' } })

    await waitFor(() =>
      expect(updateSacnConfigMock).toHaveBeenCalledWith(expect.objectContaining({ universe: 9 })),
    )
  })

  it('saves without pushing when the sender is not running', async () => {
    await renderPanel(sacnOpen())

    fireEvent.change(universeInput(), { target: { value: '9' } })

    await waitFor(() => expect(savePrefsMock).toHaveBeenCalled())
    expect(updateSacnConfigMock).not.toHaveBeenCalled()
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

    fireEvent.change(screen.getByPlaceholderText('127.0.0.1'), { target: { value: '10.0.0.9' } })

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({
        artNetConfig: {
          host: '10.0.0.9',
          universe: 0,
          net: 0,
          subnet: 0,
          subuni: 0,
          port: 6454,
          refreshRateHz: 40,
        },
      }),
    )
  })

  it('pushes the change to a running sender', async () => {
    await renderPanel(artNetOpen(), { artnet: true })

    fireEvent.change(screen.getByPlaceholderText('127.0.0.1'), { target: { value: '10.0.0.9' } })

    await waitFor(() =>
      expect(updateArtNetConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({ host: '10.0.0.9' }),
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
  it('saves the Enttec Pro port as it is typed', async () => {
    await renderPanel({
      dmxOutputConfig: outputConfig({ enttecProEnabled: true }),
      dmxSettingsPrefs: expansion({ enttecProExpanded: true }),
      enttecProConfig: { port: '' },
    })

    fireEvent.change(screen.getByPlaceholderText('COM3'), { target: { value: 'COM9' } })

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({ enttecProConfig: { port: 'COM9' } }),
    )
  })

  it('saves the OpenDMX port while keeping its rate', async () => {
    await renderPanel({
      dmxOutputConfig: outputConfig({ openDmxEnabled: true }),
      dmxSettingsPrefs: expansion({ openDmxExpanded: true }),
      openDmxConfig: { port: '', dmxSpeed: 25 },
    })

    fireEvent.change(screen.getByPlaceholderText('COM4'), { target: { value: 'COM9' } })

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({
        openDmxConfig: { port: 'COM9', dmxSpeed: 25 },
      }),
    )
  })
})

describe('DmxOutputSettings refused senders', () => {
  it('keeps the sender available but marks it not running when the start is refused', async () => {
    enableSenderMock.mockReturnValue({ success: false, error: 'port in use' } as never)
    const store = await renderPanel({ dmxOutputConfig: outputConfig() })

    fireEvent.click(screen.getByLabelText('sACN'))

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
})
