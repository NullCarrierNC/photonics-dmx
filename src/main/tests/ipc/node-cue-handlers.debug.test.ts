import { describe, it, expect, jest } from '@jest/globals'

jest.mock('electron', () => ({ dialog: {}, ipcMain: {} }))
jest.mock('../../utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

import { setupNodeCueHandlers } from '../../ipc/node-cue-handlers'
import { NODE_CUES } from '../../../shared/ipcChannels'
import { NodeCueLoader } from '../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'

function setup() {
  const loader = new NodeCueLoader({
    baseDir: '/unused',
    registries: {} as never,
    effectLoader: {} as never,
    runtimeBroadcaster: noopRuntimeBroadcaster(),
  })
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipcMain = {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
    on: jest.fn(),
  }
  setupNodeCueHandlers(ipcMain as never, { getNodeCueLoader: () => loader } as never)
  return { loader, setDebug: handlers.get(NODE_CUES.SET_DEBUG)! }
}

describe('node-cue debug channel', () => {
  it('turns debug logging on and off through the loader that built the cues', async () => {
    const { loader, setDebug } = setup()

    await expect(setDebug({}, true)).resolves.toEqual({ success: true, enabled: true })
    expect(loader.isDebugEnabled()).toBe(true)

    await expect(setDebug({}, false)).resolves.toEqual({ success: true, enabled: false })
    expect(loader.isDebugEnabled()).toBe(false)
  })
})
