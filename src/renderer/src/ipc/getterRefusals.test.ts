/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const invoke = jest.fn<(channel: string, payload?: unknown) => Promise<unknown>>()
;(window as unknown as { api: unknown }).api = { invoke, receive: jest.fn(), send: jest.fn() }

import {
  getActiveRigs,
  getDmxRig,
  getDmxRigs,
  getLightLayout,
  getLightLibrary,
  getMyLights,
  getPrefs,
} from './config'
import { getRb3Enabled, getYargEnabled } from './listeners'
import { getLifecyclePhase } from './appShell'

const getters: Array<[string, () => Promise<unknown>]> = [
  ['getPrefs', getPrefs],
  ['getLightLibrary', getLightLibrary],
  ['getMyLights', getMyLights],
  ['getLightLayout', getLightLayout],
  ['getDmxRigs', getDmxRigs],
  ['getDmxRig', () => getDmxRig('rig-1')],
  ['getActiveRigs', getActiveRigs],
  ['getYargEnabled', getYargEnabled],
  ['getRb3Enabled', getRb3Enabled],
  ['getLifecyclePhase', getLifecyclePhase],
]

describe.each(getters)('%s', (_name, get) => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('throws the reason main gave when it refuses', async () => {
    invoke.mockResolvedValue({ success: false, error: 'config not loaded' })

    await expect(get()).rejects.toThrow('config not loaded')
  })

  it('returns the value main answers with', async () => {
    const value = { anything: true }
    invoke.mockResolvedValue(value)

    await expect(get()).resolves.toBe(value)
  })
})
