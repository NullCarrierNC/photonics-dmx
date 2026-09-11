/** @jest-environment jsdom */
/**
 * One output sender's on/off row: the preference gate, the switch, and what it sends when clicked.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { atom } from 'jotai'
import { lightingPrefsAtom } from '../../atoms'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../../ipcApi'

jest.mock(
  '../../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

jest.mock('../RoutedRigsHint', () => ({
  RoutedRigsHint: () => null,
}))

import SenderToggle from './SenderToggle'

const disableSender = jest.mocked(ipcApi.disableSender)

const runningAtom = atom(false)

function renderToggle(
  opts: {
    running?: boolean
    sacnEnabled?: boolean
    notReady?: boolean
    enable?: () => unknown
  } = {},
) {
  return renderWithProviders(
    <SenderToggle
      senderId="sacn"
      label="sACN Out"
      runningAtom={runningAtom}
      prefsFlag="sacnEnabled"
      notReady={opts.notReady}
      enable={opts.enable ?? (async () => ({ success: true }))}
    />,
    {
      seed: (set) => {
        set(runningAtom, opts.running ?? false)
        set(lightingPrefsAtom, {
          dmxOutputConfig: {
            sacnEnabled: opts.sacnEnabled ?? true,
            artNetEnabled: false,
            enttecProEnabled: false,
            openDmxEnabled: false,
          },
        })
      },
    },
  ).store
}

describe('SenderToggle', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  afterEach(() => cleanup())

  it('is not offered when the sender is off in preferences', () => {
    renderToggle({ sacnEnabled: false })

    expect(screen.queryByRole('button', { name: 'sACN Out' })).toBeNull()
  })

  it('sends what the sender needs to start', async () => {
    const enable = jest.fn(async () => ({ success: true }))
    const store = renderToggle({ enable })

    fireEvent.click(screen.getByRole('button', { name: 'sACN Out' }))

    await waitFor(() => expect(enable).toHaveBeenCalledTimes(1))
    expect(store.get(runningAtom)).toBe(true)
  })

  it('stops the sender when it is already running', async () => {
    renderToggle({ running: true })

    fireEvent.click(screen.getByRole('button', { name: 'sACN Out' }))

    await waitFor(() => expect(disableSender).toHaveBeenCalledWith({ sender: 'sacn' }))
  })

  it('puts the switch back when the sender refuses to start', async () => {
    const store = renderToggle({
      enable: async () => ({ success: false, error: 'port in use' }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'sACN Out' }))

    await waitFor(() => expect(store.get(runningAtom)).toBe(false))
  })

  it('blocks the switch while the sender is not ready to start', () => {
    renderToggle({ notReady: true })

    expect((screen.getByRole('button', { name: 'sACN Out' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('reports its state to assistive technology', () => {
    renderToggle({ running: true })

    expect(screen.getByRole('button', { name: 'sACN Out' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })
})
