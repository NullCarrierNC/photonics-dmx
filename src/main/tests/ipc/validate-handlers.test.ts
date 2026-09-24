import { describe, expect, it, jest } from '@jest/globals'

jest.mock('electron', () => ({ dialog: {}, ipcMain: {} }))
jest.mock('../../utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

import { setupNodeCueHandlers } from '../../ipc/node-cue-handlers'
import { setupEffectHandlers } from '../../ipc/effect-handlers'
import { EFFECTS, NODE_CUES } from '../../../shared/ipcChannels'

type Handler = (event: unknown, payload?: unknown) => Promise<unknown>

function registerValidators(loaders: { nodeCue: unknown; effect: unknown }): Map<string, Handler> {
  const handlers = new Map<string, Handler>()
  const ipcMain = {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: jest.fn(),
  }
  const controllerManager = {
    getNodeCueLoader: () => loaders.nodeCue,
    getEffectLoader: () => loaders.effect,
  }
  setupNodeCueHandlers(ipcMain as never, controllerManager as never)
  setupEffectHandlers(ipcMain as never, controllerManager as never)
  return handlers
}

describe.each([
  ['cue', NODE_CUES.VALIDATE, 'Node cue loader is not initialized.'],
  ['effect', EFFECTS.VALIDATE, 'Effect loader is not initialized.'],
])('%s validation', (_kind, channel, missingLoader) => {
  it('answers a missing loader with a verdict carrying the reason', async () => {
    const handlers = registerValidators({ nodeCue: null, effect: null })

    await expect(handlers.get(channel)!({}, { path: '/cues/a.json' })).resolves.toEqual({
      valid: false,
      errors: [missingLoader],
    })
  })

  it('answers a payload with neither content nor path with a verdict', async () => {
    const handlers = registerValidators({ nodeCue: {}, effect: {} })

    const result = (await handlers.get(channel)!({}, {})) as { valid: boolean; errors: string[] }

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([expect.stringContaining('content or path')])
  })

  it('answers an unreadable file with a verdict carrying the read error', async () => {
    const readFile = jest.fn(async () => {
      throw new Error('not JSON')
    })
    const handlers = registerValidators({ nodeCue: { readFile }, effect: { readFile } })

    await expect(handlers.get(channel)!({}, { path: '/cues/a.json' })).resolves.toEqual({
      valid: false,
      errors: ['not JSON'],
    })
  })
})
