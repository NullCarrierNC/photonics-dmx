import { describe, expect, it, jest } from '@jest/globals'
import { setupIpcHandlers } from '../../ipc'
import { ALL_INVOKE_CHANNELS, ALL_SEND_CHANNELS, RENDERER_SEND } from '../../../shared/ipcChannels'

jest.mock('../../utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

/**
 * A collaborator whose every member is a function answering another stub, so each setup function
 * can reach whatever it needs at registration. A member named in `members` answers that value.
 */
function deepStub(members: Record<string, unknown> = {}): unknown {
  const fn = (): unknown => deepStub()
  return new Proxy(fn, {
    get: (_target, prop) => {
      if (prop === 'then') return undefined
      if (typeof prop === 'string' && prop in members) return members[prop]
      return deepStub()
    },
  })
}

function register(controllerManager: unknown = deepStub(), windowManager: unknown = deepStub()) {
  const handled: string[] = []
  const listened: string[] = []
  const ipcMain = {
    handle: (channel: string) => handled.push(channel),
    on: (channel: string) => listened.push(channel),
  }
  setupIpcHandlers(ipcMain as never, controllerManager as never, windowManager as never, () => {})
  return { handled, listened }
}

const sorted = (channels: readonly string[]): string[] => [...channels].sort()

describe('setupIpcHandlers', () => {
  it('handles every invoke channel exactly once', () => {
    const sendChannels = new Set<string>(ALL_SEND_CHANNELS)
    const invokeChannels = ALL_INVOKE_CHANNELS.filter((channel) => !sendChannels.has(channel))

    expect(sorted(register().handled)).toEqual(sorted(invokeChannels))
  })

  it('listens once on every send channel and on the unsaved-changes report', () => {
    expect(sorted(register().listened)).toEqual(
      sorted([...ALL_SEND_CHANNELS, RENDERER_SEND.UNSAVED_CHANGES]),
    )
  })

  it('mirrors the audio data to the window manager', () => {
    let mirror: ((data: unknown) => void) | undefined
    const controllerManager = deepStub({
      getListenerLifecycle: () =>
        deepStub({
          audio: deepStub({
            setBroadcastAudioMirror: (fn: (data: unknown) => void) => {
              mirror = fn
            },
          }),
        }),
    })
    const broadcastAudioMirror = jest.fn()
    register(controllerManager, deepStub({ broadcastAudioMirror }))

    const data = { level: 0.5 }
    mirror!(data)

    expect(broadcastAudioMirror).toHaveBeenCalledWith(data)
  })
})
