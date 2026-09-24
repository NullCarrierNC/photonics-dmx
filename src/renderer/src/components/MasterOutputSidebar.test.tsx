/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import MasterOutputSidebar from './MasterOutputSidebar'
import { useMasterOutputSync } from '../hooks/useMasterOutputSync'
import { lightingPrefsAtom } from '../atoms'
import { LIGHT, CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import * as ipcHelpers from '../utils/ipcHelpers'
import { installWindowApi } from '@renderer/tests/helpers/windowApiStub'
import { ToastStack } from './Toast'

/**
 * The sidebar renders shared state that WindowShell keeps in step with main, so the two are
 * exercised together here. On their own the buttons would have nothing seeding them.
 */
function Sidebar() {
  useMasterOutputSync()
  return (
    <>
      <MasterOutputSidebar />
      <ToastStack />
    </>
  )
}

const invoke = jest.fn() as jest.MockedFunction<
  (channel: string, data: unknown) => Promise<unknown>
>

function mockInvoke(state = { dimmerPercent: 100, blackout: false, strobeOutputEnabled: true }) {
  invoke.mockImplementation((channel: string, data: unknown) => {
    if (channel === LIGHT.GET_MASTER_OUTPUT) return Promise.resolve(state)
    if (channel === LIGHT.SET_MASTER_OUTPUT) {
      return Promise.resolve({
        success: true,
        state: { ...state, ...(data as object) },
      })
    }
    if (channel === CONFIG.SAVE_PREFS) return Promise.resolve({ success: true })
    return Promise.resolve(undefined)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockInvoke()
  installWindowApi(invoke)
})

async function renderSidebar() {
  const store = createStore()
  store.set(lightingPrefsAtom, { masterDimmerPercent: 100, strobeOutputEnabled: true })
  const utils = render(
    <Provider store={store}>
      <Sidebar />
    </Provider>,
  )
  await waitFor(() => expect(invoke).toHaveBeenCalledWith(LIGHT.GET_MASTER_OUTPUT, undefined))
  return { ...utils, store }
}

function setsMasterOutput(): unknown[] {
  return invoke.mock.calls.filter((c) => c[0] === LIGHT.SET_MASTER_OUTPUT).map((c) => c[1])
}

function savedPrefs(): unknown[] {
  return invoke.mock.calls.filter((c) => c[0] === CONFIG.SAVE_PREFS).map((c) => c[1])
}

describe('MasterOutputSidebar', () => {
  it('seeds itself from main rather than from prefs', async () => {
    mockInvoke({ dimmerPercent: 45, blackout: true, strobeOutputEnabled: false })
    await renderSidebar()

    await waitFor(() => expect(screen.getByText('45%')).toBeTruthy())
    expect(screen.getByText('Blacked Out')).toBeTruthy()
    expect(screen.getByText('Strobes Disabled')).toBeTruthy()
  })

  it('applies a fader move live but only writes prefs when the gesture ends', async () => {
    await renderSidebar()
    const fader = screen.getByLabelText('Master dimmer') as HTMLInputElement

    fireEvent.change(fader, { target: { value: '60' } })

    await waitFor(() => expect(setsMasterOutput()).toContainEqual({ dimmerPercent: 60 }))
    expect(savedPrefs()).toHaveLength(0)

    fireEvent.pointerUp(fader)
    await waitFor(() => expect(savedPrefs()).toContainEqual({ masterDimmerPercent: 60 }))
  })

  it('writes nothing when a key that moves nothing comes up on the fader', async () => {
    await renderSidebar()
    const fader = screen.getByLabelText('Master dimmer') as HTMLInputElement

    fireEvent.keyUp(fader, { key: 'Shift' })
    fireEvent.keyUp(fader, { key: 'Tab' })
    fireEvent.blur(fader)

    expect(savedPrefs()).toHaveLength(0)
  })

  it('toggles blackout live and never persists it', async () => {
    await renderSidebar()

    fireEvent.click(screen.getByText('Blackout (Off)'))

    await waitFor(() => expect(setsMasterOutput()).toContainEqual({ blackout: true }))
    expect(savedPrefs()).toHaveLength(0)
    expect(screen.getByText('Blacked Out')).toBeTruthy()
  })

  it('ignores stale master-output reads when a newer read completes first', async () => {
    const resolvers: Array<(value: unknown) => void> = []
    invoke.mockImplementation((channel: string, data: unknown) => {
      if (channel === LIGHT.GET_MASTER_OUTPUT) {
        return new Promise((resolve) => {
          resolvers.push(resolve)
        })
      }
      if (channel === LIGHT.SET_MASTER_OUTPUT) {
        return Promise.resolve({
          success: true,
          state: {
            dimmerPercent: 100,
            blackout: false,
            strobeOutputEnabled: true,
            ...(data as object),
          },
        })
      }
      if (channel === CONFIG.SAVE_PREFS) return Promise.resolve({ success: true })
      return Promise.resolve(undefined)
    })

    let restartHandler: (() => void) | undefined
    const register = jest
      .spyOn(ipcHelpers, 'registerIpcListener')
      .mockImplementation((channel, handler) => {
        if (channel === RENDERER_RECEIVE.CONTROLLERS_RESTARTED) {
          restartHandler = handler as () => void
        }
        return jest.fn()
      })

    const store = createStore()
    store.set(lightingPrefsAtom, { masterDimmerPercent: 100, strobeOutputEnabled: true })
    render(
      <Provider store={store}>
        <Sidebar />
      </Provider>,
    )

    await waitFor(() => expect(resolvers).toHaveLength(1))
    restartHandler?.()
    await waitFor(() => expect(resolvers).toHaveLength(2))

    resolvers[1]!({ dimmerPercent: 80, blackout: false, strobeOutputEnabled: true })
    await waitFor(() => expect(screen.getByText('80%')).toBeTruthy())

    resolvers[0]!({ dimmerPercent: 10, blackout: false, strobeOutputEnabled: true })
    await waitFor(() => expect(screen.getByText('80%')).toBeTruthy())
    expect(screen.queryByText('10%')).toBeNull()
    register.mockRestore()
  })

  it('re-fetches master output when controllers restart', async () => {
    const register = jest.spyOn(ipcHelpers, 'registerIpcListener')
    let restartHandler: (() => void) | undefined
    register.mockImplementation((channel, handler) => {
      if (channel === RENDERER_RECEIVE.CONTROLLERS_RESTARTED) {
        restartHandler = handler as () => void
      }
      return jest.fn()
    })

    mockInvoke({ dimmerPercent: 100, blackout: false, strobeOutputEnabled: true })
    await renderSidebar()
    expect(invoke).toHaveBeenCalledTimes(1)

    mockInvoke({ dimmerPercent: 25, blackout: true, strobeOutputEnabled: false })
    restartHandler?.()

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
    // The restart restores the dimmer, the blackout flag and the strobe flag together.
    await waitFor(() => expect(screen.getByText('25%')).toBeTruthy())
    expect(screen.getByText('Blacked Out')).toBeTruthy()
    expect(screen.getByText('Strobes Disabled')).toBeTruthy()
    register.mockRestore()
  })

  it('removes the restart listener on unmount', async () => {
    const unsubscribe = jest.fn()
    const register = jest
      .spyOn(ipcHelpers, 'registerIpcListener')
      .mockImplementation((channel) =>
        channel === RENDERER_RECEIVE.CONTROLLERS_RESTARTED ? unsubscribe : jest.fn(),
      )

    const { unmount } = await renderSidebar()

    unmount()

    expect(unsubscribe).toHaveBeenCalled()
    register.mockRestore()
  })

  it('keeps a local interaction that happens while the mount read is still pending', async () => {
    const resolvers: Array<(value: unknown) => void> = []
    invoke.mockImplementation((channel: string, data: unknown) => {
      if (channel === LIGHT.GET_MASTER_OUTPUT) {
        return new Promise((resolve) => {
          resolvers.push(resolve)
        })
      }
      if (channel === LIGHT.SET_MASTER_OUTPUT) {
        return Promise.resolve({
          success: true,
          state: {
            dimmerPercent: 100,
            blackout: false,
            strobeOutputEnabled: true,
            ...(data as object),
          },
        })
      }
      if (channel === CONFIG.SAVE_PREFS) return Promise.resolve({ success: true })
      return Promise.resolve(undefined)
    })

    const store = createStore()
    store.set(lightingPrefsAtom, { masterDimmerPercent: 100, strobeOutputEnabled: true })
    render(
      <Provider store={store}>
        <Sidebar />
      </Provider>,
    )
    await waitFor(() => expect(resolvers).toHaveLength(1))

    const fader = screen.getByLabelText('Master dimmer') as HTMLInputElement
    fireEvent.change(fader, { target: { value: '60' } })
    await waitFor(() => expect(screen.getByText('60%')).toBeTruthy())

    // The mount read was in flight before the drag and resolves with a value from before it.
    resolvers[0]!({ dimmerPercent: 100, blackout: false, strobeOutputEnabled: true })
    await waitFor(() => expect(screen.getByText('60%')).toBeTruthy())
    expect(screen.queryByText('100%')).toBeNull()
  })

  it('ignores an older live response that resolves after a newer one', async () => {
    const setResolvers: Array<() => void> = []
    invoke.mockImplementation((channel: string, data: unknown) => {
      if (channel === LIGHT.GET_MASTER_OUTPUT) {
        return Promise.resolve({ dimmerPercent: 100, blackout: false, strobeOutputEnabled: true })
      }
      if (channel === LIGHT.SET_MASTER_OUTPUT) {
        return new Promise((resolve) => {
          setResolvers.push(() =>
            resolve({
              success: true,
              state: {
                dimmerPercent: 100,
                blackout: false,
                strobeOutputEnabled: true,
                ...(data as object),
              },
            }),
          )
        })
      }
      if (channel === CONFIG.SAVE_PREFS) return Promise.resolve({ success: true })
      return Promise.resolve(undefined)
    })

    const store = createStore()
    store.set(lightingPrefsAtom, { masterDimmerPercent: 100, strobeOutputEnabled: true })
    render(
      <Provider store={store}>
        <Sidebar />
      </Provider>,
    )

    const fader = screen.getByLabelText('Master dimmer') as HTMLInputElement
    fireEvent.change(fader, { target: { value: '60' } })
    await waitFor(() => expect(setResolvers).toHaveLength(1))
    fireEvent.change(fader, { target: { value: '70' } })
    await waitFor(() => expect(setResolvers).toHaveLength(2))

    // The newer request (70) settles first, then the older one (60) settles after it.
    setResolvers[1]!()
    await waitFor(() => expect(screen.getByText('70%')).toBeTruthy())

    setResolvers[0]!()
    await waitFor(() => expect(screen.getByText('70%')).toBeTruthy())
    expect(screen.queryByText('60%')).toBeNull()
  })

  it('does not apply a read that resolves after unmount', async () => {
    const resolvers: Array<(value: unknown) => void> = []
    invoke.mockImplementation((channel: string) => {
      if (channel === LIGHT.GET_MASTER_OUTPUT) {
        return new Promise((resolve) => {
          resolvers.push(resolve)
        })
      }
      return Promise.resolve(undefined)
    })

    const store = createStore()
    store.set(lightingPrefsAtom, { masterDimmerPercent: 100, strobeOutputEnabled: true })
    const { unmount } = render(
      <Provider store={store}>
        <Sidebar />
      </Provider>,
    )
    await waitFor(() => expect(resolvers).toHaveLength(1))

    unmount()
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    resolvers[0]!({ dimmerPercent: 42, blackout: false, strobeOutputEnabled: true })
    await Promise.resolve()
    await Promise.resolve()

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('re-reads main when a live update is refused', async () => {
    let failNextSet = false
    invoke.mockImplementation((channel: string, data: unknown) => {
      if (channel === LIGHT.GET_MASTER_OUTPUT) {
        return Promise.resolve({ dimmerPercent: 100, blackout: false, strobeOutputEnabled: true })
      }
      if (channel === LIGHT.SET_MASTER_OUTPUT) {
        if (failNextSet) {
          failNextSet = false
          return Promise.resolve({ success: false, error: 'refused' })
        }
        return Promise.resolve({
          success: true,
          state: {
            dimmerPercent: 100,
            blackout: false,
            strobeOutputEnabled: true,
            ...(data as object),
          },
        })
      }
      if (channel === CONFIG.SAVE_PREFS) return Promise.resolve({ success: true })
      return Promise.resolve(undefined)
    })

    const store = createStore()
    store.set(lightingPrefsAtom, { masterDimmerPercent: 100, strobeOutputEnabled: true })
    render(
      <Provider store={store}>
        <Sidebar />
      </Provider>,
    )
    await waitFor(() => expect(invoke).toHaveBeenCalledWith(LIGHT.GET_MASTER_OUTPUT, undefined))
    const getCallCount = () =>
      invoke.mock.calls.filter((c) => c[0] === LIGHT.GET_MASTER_OUTPUT).length
    const getCallsBefore = getCallCount()

    failNextSet = true
    fireEvent.click(screen.getByText('Blackout (Off)'))

    await waitFor(() => expect(getCallCount()).toBeGreaterThan(getCallsBefore))
  })

  it('says so when the dimmer level it persists is refused, and keeps the live level', async () => {
    invoke.mockImplementation((channel: string, data: unknown) => {
      if (channel === LIGHT.GET_MASTER_OUTPUT) {
        return Promise.resolve({ dimmerPercent: 100, blackout: false, strobeOutputEnabled: true })
      }
      if (channel === LIGHT.SET_MASTER_OUTPUT) {
        return Promise.resolve({
          success: true,
          state: {
            dimmerPercent: 100,
            blackout: false,
            strobeOutputEnabled: true,
            ...(data as object),
          },
        })
      }
      if (channel === CONFIG.SAVE_PREFS)
        return Promise.resolve({ success: false, error: 'disk full' })
      return Promise.resolve(undefined)
    })
    const { store } = await renderSidebar()
    const fader = screen.getByLabelText('Master dimmer') as HTMLInputElement

    fireEvent.change(fader, { target: { value: '30' } })
    fireEvent.pointerUp(fader)

    expect(await screen.findByText('Could not save the master dimmer level.')).toBeTruthy()
    expect(fader.value).toBe('30')
    expect(store.get(lightingPrefsAtom).masterDimmerPercent).toBe(100)
  })

  it('says so when the strobe gate it persists is refused', async () => {
    invoke.mockImplementation((channel: string, data: unknown) => {
      if (channel === LIGHT.GET_MASTER_OUTPUT) {
        return Promise.resolve({ dimmerPercent: 100, blackout: false, strobeOutputEnabled: true })
      }
      if (channel === LIGHT.SET_MASTER_OUTPUT) {
        return Promise.resolve({
          success: true,
          state: {
            dimmerPercent: 100,
            blackout: false,
            strobeOutputEnabled: true,
            ...(data as object),
          },
        })
      }
      if (channel === CONFIG.SAVE_PREFS) return Promise.reject(new Error('bridge gone'))
      return Promise.resolve(undefined)
    })
    await renderSidebar()

    fireEvent.click(screen.getByText('Strobes Enabled'))

    expect(await screen.findByText('Could not save the strobe output setting.')).toBeTruthy()
  })

  it('toggles the strobe gate live and persists it', async () => {
    await renderSidebar()

    fireEvent.click(screen.getByText('Strobes Enabled'))

    await waitFor(() => expect(setsMasterOutput()).toContainEqual({ strobeOutputEnabled: false }))
    await waitFor(() => expect(savedPrefs()).toContainEqual({ strobeOutputEnabled: false }))
    expect(screen.getByText('Strobes Disabled')).toBeTruthy()
  })
})
