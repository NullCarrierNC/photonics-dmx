/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { installWindowApi } from '@renderer/tests/helpers/windowApiStub'

const invoke = jest.fn<(channel: string, payload?: unknown) => Promise<unknown>>()
installWindowApi(invoke)

import {
  getActiveRigs,
  getDmxRig,
  getDmxRigs,
  getLightLayout,
  getLightLibrary,
  getMyLights,
  getPrefs,
} from './config'
import { getLifecyclePhase } from './appShell'

const getters: Array<[string, () => Promise<unknown>]> = [
  ['getPrefs', getPrefs],
  ['getLightLibrary', getLightLibrary],
  ['getMyLights', getMyLights],
  ['getLightLayout', getLightLayout],
  ['getDmxRigs', getDmxRigs],
  ['getDmxRig', () => getDmxRig('rig-1')],
  ['getActiveRigs', getActiveRigs],
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
