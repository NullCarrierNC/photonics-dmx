/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { createStore } from 'jotai'
import {
  applyMasterOutputAtom,
  masterOutputAtom,
  receiveMasterOutputAtom,
  toggleBlackoutAtom,
} from './masterOutput'
import { LIGHT } from '../../../shared/ipcChannels'
import { installWindowApi } from '@renderer/tests/helpers/windowApiStub'

const invoke = jest.fn() as jest.MockedFunction<
  (channel: string, data: unknown) => Promise<unknown>
>

const FULL = { dimmerPercent: 100, blackout: false, strobeOutputEnabled: true }

function mockInvoke(state = FULL) {
  invoke.mockImplementation((channel: string, data: unknown) => {
    if (channel === LIGHT.GET_MASTER_OUTPUT) return Promise.resolve(state)
    if (channel === LIGHT.SET_MASTER_OUTPUT) {
      return Promise.resolve({ success: true, state: { ...state, ...(data as object) } })
    }
    return Promise.resolve(undefined)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockInvoke()
  installWindowApi(invoke)
})

function setsMasterOutput(): unknown[] {
  return invoke.mock.calls.filter((c) => c[0] === LIGHT.SET_MASTER_OUTPUT).map((c) => c[1])
}

describe('master output state', () => {
  it('toggles blackout from the value held now, not the one held when it was wired up', async () => {
    const store = createStore()
    // The shortcut listener registers once and keeps the same setter for the life of the window,
    // so a toggle that read a captured value would flip the wrong way from the second press on.
    const toggle = () => store.set(toggleBlackoutAtom)

    toggle()
    await Promise.resolve()
    expect(store.get(masterOutputAtom).blackout).toBe(true)

    toggle()
    await Promise.resolve()
    expect(store.get(masterOutputAtom).blackout).toBe(false)

    expect(setsMasterOutput()).toEqual([{ blackout: true }, { blackout: false }])
  })

  it('takes a broadcast from another writer', () => {
    const store = createStore()

    store.set(receiveMasterOutputAtom, { ...FULL, blackout: true })

    expect(store.get(masterOutputAtom).blackout).toBe(true)
  })

  it('drops a broadcast that lands while our own write is in flight', async () => {
    let settle: (() => void) | undefined
    invoke.mockImplementation((channel: string, data: unknown) => {
      if (channel === LIGHT.SET_MASTER_OUTPUT) {
        return new Promise((resolve) => {
          settle = () => resolve({ success: true, state: { ...FULL, ...(data as object) } })
        })
      }
      return Promise.resolve(FULL)
    })

    const store = createStore()
    store.set(toggleBlackoutAtom)
    await Promise.resolve()

    // Main announcing the state from before our write would undo the optimistic value.
    store.set(receiveMasterOutputAtom, { ...FULL, blackout: false })
    expect(store.get(masterOutputAtom).blackout).toBe(true)

    settle?.()
    await Promise.resolve()
    await Promise.resolve()

    // Once nothing is in flight, a broadcast is taken again.
    store.set(receiveMasterOutputAtom, { ...FULL, blackout: false })
    expect(store.get(masterOutputAtom).blackout).toBe(false)
  })

  it('re-reads main when a live update is refused', async () => {
    invoke.mockImplementation((channel: string) => {
      if (channel === LIGHT.SET_MASTER_OUTPUT) {
        return Promise.resolve({ success: false, error: 'refused' })
      }
      return Promise.resolve(FULL)
    })

    const store = createStore()
    await store.set(applyMasterOutputAtom, { blackout: true })
    await Promise.resolve()

    expect(invoke.mock.calls.filter((c) => c[0] === LIGHT.GET_MASTER_OUTPUT)).toHaveLength(1)
  })
})
