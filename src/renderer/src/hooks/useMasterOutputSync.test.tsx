/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { render, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { useMasterOutputSync } from './useMasterOutputSync'
import { masterOutputAtom } from '../state/masterOutput'
import { LIGHT, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import * as ipcHelpers from '../utils/ipcHelpers'
import { installWindowApi } from '@renderer/tests/helpers/windowApiStub'

const invoke = jest.fn() as jest.MockedFunction<
  (channel: string, data: unknown) => Promise<unknown>
>

const FULL = { dimmerPercent: 100, blackout: false, strobeOutputEnabled: true }

beforeEach(() => {
  jest.clearAllMocks()
  invoke.mockImplementation(() => Promise.resolve(FULL))
  installWindowApi(invoke)
})

const Harness = () => {
  useMasterOutputSync()
  return null
}

/** Captures the push handlers the hook registers, keyed by channel. */
function captureListeners() {
  const handlers = new Map<string, (payload: never) => void>()
  const unsubscribe = jest.fn()
  const spy = jest
    .spyOn(ipcHelpers, 'registerIpcListener')
    .mockImplementation((channel, handler) => {
      handlers.set(channel, handler as (payload: never) => void)
      return unsubscribe
    })
  return { handlers, unsubscribe, spy }
}

function mount() {
  const store = createStore()
  const utils = render(
    <Provider store={store}>
      <Harness />
    </Provider>,
  )
  return { ...utils, store }
}

describe('useMasterOutputSync', () => {
  it('seeds this window from main on mount', async () => {
    invoke.mockImplementation(() =>
      Promise.resolve({ dimmerPercent: 45, blackout: true, strobeOutputEnabled: false }),
    )
    const { store } = mount()

    await waitFor(() => expect(store.get(masterOutputAtom).dimmerPercent).toBe(45))
    expect(store.get(masterOutputAtom).blackout).toBe(true)
  })

  it('follows a blackout latched from another window', async () => {
    const { handlers, spy } = captureListeners()
    const { store } = mount()
    await waitFor(() => expect(handlers.has(RENDERER_RECEIVE.MASTER_OUTPUT_CHANGED)).toBe(true))

    handlers.get(RENDERER_RECEIVE.MASTER_OUTPUT_CHANGED)!({ ...FULL, blackout: true } as never)

    expect(store.get(masterOutputAtom).blackout).toBe(true)
    spy.mockRestore()
  })

  it('re-reads main when controllers restart', async () => {
    const { handlers, spy } = captureListeners()
    mount()
    await waitFor(() => expect(handlers.has(RENDERER_RECEIVE.CONTROLLERS_RESTARTED)).toBe(true))
    const before = invoke.mock.calls.filter((c) => c[0] === LIGHT.GET_MASTER_OUTPUT).length

    handlers.get(RENDERER_RECEIVE.CONTROLLERS_RESTARTED)!(undefined as never)

    await waitFor(() =>
      expect(invoke.mock.calls.filter((c) => c[0] === LIGHT.GET_MASTER_OUTPUT).length).toBe(
        before + 1,
      ),
    )
    spy.mockRestore()
  })

  it('drops both subscriptions when the window goes', async () => {
    const { unsubscribe, spy } = captureListeners()
    const { unmount } = mount()

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })
})
