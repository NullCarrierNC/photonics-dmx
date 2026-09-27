/** @jest-environment jsdom */
/**
 * The console holds DMX output in manual mode for as long as the page says so, so leaving the page
 * has to hand it back, including when the page leaves before main has answered.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { lightingPrefsAtom, myDmxLightsAtom, previewRigIdAtom } from '../atoms'
import DmxConsole from './DmxConsole'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxFixture,
  type DmxLight,
  type DmxRig,
  type RgbDmxChannels,
  type RgbLight,
} from '../../../photonics-dmx/types'
import { rgbLight } from '../../../photonics-dmx/tests/helpers/testFixtures'

// The page subscribes to live DMX values, which needs the preload bridge that jsdom has no copy of.
jest.mock(
  '../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)

// The 3D preview pulls in three.js and a font asset, neither of which this page's behaviour needs.
jest.mock('../components/LightsDmxPreview', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const rig: DmxRig = {
  id: 'rig-1',
  name: 'Rig one',
  active: true,
  config: {
    numLights: 1,
    lightLayout: { id: 'front', label: 'Front only' },
    strobeType: ConfigStrobeType.None,
    frontLights: [
      rgbLight({
        id: 'light-1',
        name: 'Front 1',
        label: 'Front 1',
        position: 1,
        fixtureId: 'fixture-1',
        universe: 1,
        channels: { masterDimmer: 20, red: 1, green: 2, blue: 3 },
      }),
    ],
    backLights: [],
    strobeLights: [],
  },
}

function renderConsole(): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(<DmxConsole />, {
    seed: (set) => set(previewRigIdAtom, rig.id),
  })
}

describe('DmxConsole', () => {
  beforeEach(() => {
    resetIpcApiMock()
    jest.mocked(ipcApi.getDmxRigs).mockImplementation((() => Promise.resolve([rig])) as never)
    jest.mocked(ipcApi.getDmxRig).mockImplementation((() => Promise.resolve(rig)) as never)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('hands DMX output back when the page closes with the console open', async () => {
    const view = renderConsole()
    const toggle = await screen.findByRole('button', { name: 'Enable console' })
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)
    await screen.findByRole('button', { name: 'Disable console' })

    view.unmount()

    await waitFor(() => expect(jest.mocked(ipcApi.disableConsole)).toHaveBeenCalled())
  })

  it('shows the channel again when an entry cannot move it', async () => {
    renderConsole()
    const toggle = await screen.findByRole('button', { name: 'Enable console' })
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)
    await screen.findByRole('button', { name: 'Disable console' })
    const box = (screen.getAllByRole('spinbutton') as HTMLInputElement[]).find(
      (input) => input.value === '1',
    )!

    fireEvent.change(box, { target: { value: '0' } })
    fireEvent.blur(box)

    expect(box.value).toBe('1')
  })

  it('hands DMX output back when the page closes before the console opens', async () => {
    let openConsole!: (result: { success: true }) => void
    jest.mocked(ipcApi.enableConsole).mockImplementation(
      (() =>
        new Promise((resolve) => {
          openConsole = resolve
        })) as never,
    )

    const view = renderConsole()
    const toggle = await screen.findByRole('button', { name: 'Enable console' })
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)

    view.unmount()
    openConsole({ success: true })

    await waitFor(() => expect(jest.mocked(ipcApi.disableConsole)).toHaveBeenCalled())
  })

  it('hands DMX output back when the enable rejects after the page closes', async () => {
    let failConsole!: (error: Error) => void
    jest.mocked(ipcApi.enableConsole).mockImplementation(
      (() =>
        new Promise((_resolve, reject) => {
          failConsole = reject
        })) as never,
    )

    const view = renderConsole()
    const toggle = await screen.findByRole('button', { name: 'Enable console' })
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)

    view.unmount()
    // Main can have stored the restore state before whatever went wrong, so console mode is open
    // even though the enable reports a failure.
    failConsole(new Error('channel gone'))

    await waitFor(() => expect(jest.mocked(ipcApi.disableConsole)).toHaveBeenCalled())
  })
})

describe('DmxConsole while an enable is in flight', () => {
  let openConsole: (result: { success: true }) => void = () => undefined

  beforeEach(() => {
    resetIpcApiMock()
    jest.mocked(ipcApi.getDmxRigs).mockResolvedValue([rig])
    jest.mocked(ipcApi.getDmxRig).mockResolvedValue(rig)
    jest.mocked(ipcApi.enableConsole).mockReturnValue(
      new Promise((resolve) => {
        openConsole = resolve
      }),
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  async function clickEnable(times: number): Promise<void> {
    const toggle = await screen.findByRole('button', { name: 'Enable console' })
    await waitFor(() => expect(toggle).toBeEnabled())
    for (let i = 0; i < times; i++) fireEvent.click(toggle)
  }

  it('sends one enable for a second click before main answers', async () => {
    renderConsole()
    await clickEnable(2)

    await act(async () => openConsole({ success: true }))

    expect(ipcApi.enableConsole).toHaveBeenCalledTimes(1)
    await screen.findByRole('button', { name: 'Disable console' })
  })

  it('sends no channels from a page closed before main answers', async () => {
    const view = renderConsole()
    await clickEnable(1)

    view.unmount()
    await act(async () => openConsole({ success: true }))

    await waitFor(() => expect(ipcApi.disableConsole).toHaveBeenCalled())
    expect(ipcApi.sendConsoleDmx).not.toHaveBeenCalled()
  })
})

describe('DmxConsole rig choice', () => {
  const inactiveRig: DmxRig = { ...rig, id: 'rig-2', name: 'Rig two', active: false }
  const rigById = (id: string) => [rig, inactiveRig].find((r) => r.id === id)

  beforeEach(() => {
    resetIpcApiMock()
    localStorage.clear()
    jest
      .mocked(ipcApi.getDmxRigs)
      .mockImplementation((() => Promise.resolve([rig, inactiveRig])) as never)
    jest
      .mocked(ipcApi.getDmxRig)
      .mockImplementation(((id: string) => Promise.resolve(rigById(id))) as never)
  })

  afterEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  async function rigSelect(): Promise<HTMLSelectElement> {
    const option = await screen.findByRole('option', { name: 'Rig two (inactive)' })
    return option.closest('select') as HTMLSelectElement
  }

  it('keeps its own rig when a preview page moves the preview rig', async () => {
    const { store } = renderWithProviders(<DmxConsole />, {
      seed: (set) => {
        set(lightingPrefsAtom, { advancedModeEnabled: true })
        set(previewRigIdAtom, rig.id)
      },
    })
    const select = await rigSelect()

    fireEvent.change(select, { target: { value: inactiveRig.id } })
    await waitFor(() => expect(select.value).toBe(inactiveRig.id))
    act(() => store.set(previewRigIdAtom, rig.id))

    expect(select.value).toBe(inactiveRig.id)
  })

  it('follows the preview rig while it has no rig of its own', async () => {
    const { store } = renderWithProviders(<DmxConsole />, {
      seed: (set) => {
        set(lightingPrefsAtom, { advancedModeEnabled: true })
        set(previewRigIdAtom, inactiveRig.id)
      },
    })
    const select = await rigSelect()
    await waitFor(() => expect(select.value).toBe(inactiveRig.id))

    act(() => store.set(previewRigIdAtom, rig.id))

    await waitFor(() => expect(select.value).toBe(rig.id))
  })
})

describe('DmxConsole channel remap', () => {
  const front = (id: string, name: string, position: number, channels: RgbDmxChannels): DmxLight =>
    rgbLight({
      id,
      name,
      label: name,
      position,
      fixtureId: `fixture-${id}`,
      universe: 1,
      channels,
    })
  const twoLightRig = (second: RgbDmxChannels): DmxRig => ({
    ...rig,
    config: {
      ...rig.config,
      numLights: 2,
      frontLights: [
        front('light-1', 'Front 1', 1, { masterDimmer: 20, red: 1, green: 2, blue: 3 }),
        front('light-2', 'Front 2', 2, second),
      ],
    },
  })

  async function openConsole(withRig: DmxRig): Promise<void> {
    jest.mocked(ipcApi.getDmxRigs).mockImplementation((() => Promise.resolve([withRig])) as never)
    jest.mocked(ipcApi.getDmxRig).mockImplementation((() => Promise.resolve(withRig)) as never)
    renderConsole()
    const toggle = await screen.findByRole('button', { name: 'Enable console' })
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)
    await screen.findByRole('button', { name: 'Disable console' })
  }

  /** The DMX number boxes showing `channel`, one per light channel on it. */
  const boxesOn = (channel: number): HTMLInputElement[] =>
    (screen.getAllByRole('spinbutton') as HTMLInputElement[]).filter(
      (input) => input.value === String(channel),
    )

  const sliderBeside = (box: HTMLInputElement): HTMLInputElement =>
    box.parentElement!.querySelector('input[type="range"]') as HTMLInputElement

  const lastBuffer = (): Record<number, number> =>
    jest.mocked(ipcApi.sendConsoleDmx).mock.calls.at(-1)![0] as Record<number, number>

  function moveChannel(box: HTMLInputElement, to: number): void {
    fireEvent.change(box, { target: { value: String(to) } })
    fireEvent.blur(box)
  }

  beforeEach(() => {
    resetIpcApiMock()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('refuses to move a channel onto one another light drives, and says so', async () => {
    await openConsole(twoLightRig({ masterDimmer: 21, red: 4, green: 5, blue: 6 }))
    fireEvent.change(sliderBeside(boxesOn(4)[0]), { target: { value: '200' } })
    const red = boxesOn(1)[0]

    moveChannel(red, 4)

    expect(await screen.findByText(/Channel 4 is already used by Front 2/)).toBeInTheDocument()
    expect(lastBuffer()[4]).toBe(200)
    expect(red.value).toBe('1')
  })

  it('carries the value to a free channel', async () => {
    await openConsole(twoLightRig({ masterDimmer: 21, red: 4, green: 5, blue: 6 }))
    fireEvent.change(sliderBeside(boxesOn(1)[0]), { target: { value: '200' } })

    moveChannel(boxesOn(1)[0], 10)

    await waitFor(() => expect(lastBuffer()).toEqual({ 10: 200 }))
  })

  it('leaves a channel lit for the light still on it when another light moves away', async () => {
    await openConsole(twoLightRig({ masterDimmer: 21, red: 1, green: 7, blue: 8 }))
    fireEvent.change(sliderBeside(boxesOn(1)[0]), { target: { value: '200' } })

    moveChannel(boxesOn(1)[0], 10)

    await waitFor(() => expect(lastBuffer()).toEqual({ 1: 200, 10: 200 }))
  })
})

describe('DmxConsole unassigned channels', () => {
  const light = (overrides: Partial<RgbLight>): RgbLight =>
    rgbLight({
      id: 'light-u',
      name: 'Unset PAR',
      label: 'Unset PAR',
      position: 1,
      fixtureId: 'no-such-template',
      universe: 1,
      channels: { masterDimmer: 30, red: 31, green: 32, blue: 33 },
      ...overrides,
    })

  const masterlessTemplate: DmxFixture = {
    id: 'masterless',
    fixture: FixtureTypes.RGB,
    name: 'Masterless',
    label: 'Masterless',
    position: 0,
    isStrobeEnabled: false,
    channels: { masterDimmer: 0, red: 1, green: 2, blue: 3 },
  }

  async function openConsoleWith(lights: DmxLight[], templates: DmxFixture[] = []) {
    const withLights: DmxRig = {
      ...rig,
      config: { ...rig.config, numLights: lights.length, frontLights: lights },
    }
    jest.mocked(ipcApi.getDmxRigs).mockResolvedValue([withLights])
    jest.mocked(ipcApi.getDmxRig).mockResolvedValue(withLights)
    renderWithProviders(<DmxConsole />, {
      seed: (set) => {
        set(previewRigIdAtom, rig.id)
        set(myDmxLightsAtom, templates)
      },
    })
    const toggle = await screen.findByRole('button', { name: 'Enable console' })
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)
    await screen.findByRole('button', { name: 'Disable console' })
  }

  /** The channel rows of the card for the light named `name`. */
  const rowsOf = (name: string): HTMLElement[] =>
    within(screen.getByText(new RegExp(`^${name} \\(#`)).closest('div')!).getAllByRole('listitem')

  const rowNamed = (name: string, channel: RegExp): HTMLElement =>
    rowsOf(name).find((row) => channel.test(row.textContent ?? ''))!

  function expectNotSet(row: HTMLElement): void {
    expect(row.querySelector('input[type="range"]')).toBeNull()
    const box = within(row).getByRole('spinbutton')
    expect(box).toBeDisabled()
    expect(box).toHaveValue(null)
    expect(row.textContent).not.toMatch(/Value:/)
  }

  beforeEach(() => {
    resetIpcApiMock()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('shows an unassigned channel as not set, with no slider', async () => {
    await openConsoleWith([light({ channels: { masterDimmer: 30, red: 0, green: 0, blue: 33 } })])

    expectNotSet(rowNamed('Unset PAR', /^red/))
    expectNotSet(rowNamed('Unset PAR', /^green/))
    const blue = rowNamed('Unset PAR', /^blue/)
    expect(blue.querySelector('input[type="range"]')).not.toBeNull()
    expect(within(blue).getByRole('spinbutton')).toHaveValue(33)
  })

  it('shows an added channel with no DMX number as not set', async () => {
    await openConsoleWith([light({ extraChannels: [{ type: 'white', channel: 0 }] })])

    expectNotSet(rowNamed('Unset PAR', /^white/i))
  })

  it.each([
    ['its template has no master', light({ fixtureId: 'masterless', unplaced: true })],
    ['its template is gone', light({ unplaced: true })],
  ])('shows every channel of an unplaced light as not set when %s', async (_, unplaced) => {
    await openConsoleWith([unplaced], [masterlessTemplate])

    const rows = rowsOf('Unset PAR')
    expect(rows).toHaveLength(4)
    rows.forEach(expectNotSet)
  })
})
