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
import type { MasterOutputSnapshot } from '../../../photonics-dmx/controllers/MasterOutputState'
import {
  installWindowApi,
  type WindowApiAnswers,
  type WindowApiStub,
} from '@renderer/tests/helpers/windowApiStub'

const FULL: MasterOutputSnapshot = {
  dimmerPercent: 100,
  blackout: false,
  strobeOutputEnabled: true,
}

let answers: WindowApiAnswers
let api: WindowApiStub

beforeEach(() => {
  jest.clearAllMocks()
  answers = {
    [LIGHT.GET_MASTER_OUTPUT]: () => FULL,
    [LIGHT.SET_MASTER_OUTPUT]: (request) => ({ success: true, state: { ...FULL, ...request } }),
  }
  api = installWindowApi(answers)
})

function callsOn(channel: string): unknown[] {
  return api.invoke.mock.calls.filter((c) => c[0] === channel).map((c) => c[1])
}

function setsMasterOutput(): unknown[] {
  return callsOn(LIGHT.SET_MASTER_OUTPUT)
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
    answers[LIGHT.SET_MASTER_OUTPUT] = (request) =>
      new Promise((resolve) => {
        settle = () => resolve({ success: true, state: { ...FULL, ...request } })
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
    answers[LIGHT.SET_MASTER_OUTPUT] = () => ({ success: false, error: 'refused' })

    const store = createStore()
    await store.set(applyMasterOutputAtom, { blackout: true })
    await Promise.resolve()

    expect(callsOn(LIGHT.GET_MASTER_OUTPUT)).toHaveLength(1)
  })
})
