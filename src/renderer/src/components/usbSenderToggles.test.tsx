/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { ipcApiMock, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import {
  enttecProComPortAtom,
  lightingPrefsAtom,
  openDmxComPortAtom,
  senderEnttecProEnabledAtom,
  senderOpenDmxEnabledAtom,
} from '../atoms'
import EnttecProToggle from './EnttecProToggle'
import OpenDmxToggle from './OpenDmxToggle'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

jest.mock('./RoutedRigsHint', () => ({
  RoutedRigsHint: () => null,
}))

const cases = [
  {
    name: 'Enttec Pro',
    label: 'Enttec Pro Out',
    sender: 'enttecpro',
    Toggle: EnttecProToggle,
    portAtom: enttecProComPortAtom,
    runningAtom: senderEnttecProEnabledAtom,
    flag: 'enttecProEnabled',
  },
  {
    name: 'OpenDMX',
    label: 'OpenDMX Out',
    sender: 'opendmx',
    Toggle: OpenDmxToggle,
    portAtom: openDmxComPortAtom,
    runningAtom: senderOpenDmxEnabledAtom,
    flag: 'openDmxEnabled',
  },
] as const

function renderUsbToggle(c: (typeof cases)[number], port: string, running = false): void {
  renderWithProviders(<c.Toggle />, {
    seed: (set) => {
      set(c.portAtom, port)
      set(c.runningAtom, running)
      set(lightingPrefsAtom, {
        dmxOutputConfig: {
          sacnEnabled: false,
          artNetEnabled: false,
          enttecProEnabled: c.flag === 'enttecProEnabled',
          openDmxEnabled: c.flag === 'openDmxEnabled',
        },
      })
    },
  })
}

describe.each(cases)('$name output switch', (c) => {
  beforeEach(() => {
    resetIpcApiMock()
    cleanup()
  })

  it('holds the switch and sends nothing while no port is set', () => {
    renderUsbToggle(c, '')
    const button = screen.getByRole('switch', { name: c.label }) as HTMLButtonElement

    fireEvent.click(button)

    expect(button.disabled).toBe(true)
    expect(ipcApiMock.enableSender).not.toHaveBeenCalled()
  })

  it('stops the running sender while no port is set', async () => {
    renderUsbToggle(c, '', true)
    const button = screen.getByRole('switch', { name: c.label }) as HTMLButtonElement

    fireEvent.click(button)

    await waitFor(() => expect(ipcApiMock.disableSender).toHaveBeenCalledWith({ sender: c.sender }))
    expect(button.getAttribute('aria-checked')).toBe('false')
  })

  it('starts the sender on the port that is set', async () => {
    renderUsbToggle(c, 'COM3')
    const button = screen.getByRole('switch', { name: c.label }) as HTMLButtonElement

    fireEvent.click(button)

    await waitFor(() =>
      expect(ipcApiMock.enableSender).toHaveBeenCalledWith(
        expect.objectContaining({ sender: c.sender, devicePath: 'COM3' }),
      ),
    )
  })
})
