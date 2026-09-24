/**
 * The preload bridge for renderer suites that run the real `ipcApi` wrappers or `utils/ipcHelpers`,
 * since jsdom has no `window.api`. `invoke` resolves undefined unless the suite answers it, and
 * `receive` keeps each subscriber, so `emitWindowApi` reaches it and its unsubscribe removes it, as
 * the preload does.
 *
 * A suite that mocks `ipcApi` and `ipcHelpers` with `ipcApiMock` and `ipcListenerStub` needs none
 * of this. It is for suites whose code reaches the bridge itself.
 */
import { jest } from '@jest/globals'

type Handler = (payload: unknown) => void

export interface WindowApiStub {
  invoke: jest.Mock<(channel: string, payload?: unknown) => Promise<unknown>>
  send: jest.Mock<(channel: string, payload?: unknown) => void>
  sendToMain: jest.Mock<(channel: string, payload?: unknown) => void>
  receive: jest.Mock<(channel: string, handler: Handler) => () => void>
}

const subscribers = new Map<string, Set<Handler>>()

/**
 * Puts a fresh bridge on `window.api` and drops every earlier subscriber. `answer` decides what an
 * invoke resolves to, which is undefined by default.
 */
export function installWindowApi(
  answer: (channel: string, payload?: unknown) => unknown = () => undefined,
): WindowApiStub {
  subscribers.clear()
  const api: WindowApiStub = {
    invoke: jest.fn(async (channel: string, payload?: unknown) => answer(channel, payload)),
    send: jest.fn(),
    sendToMain: jest.fn(),
    receive: jest.fn((channel: string, handler: Handler) => {
      let onChannel = subscribers.get(channel)
      if (!onChannel) {
        onChannel = new Set()
        subscribers.set(channel, onChannel)
      }
      onChannel.add(handler)
      return () => {
        onChannel.delete(handler)
      }
    }),
  }
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true })
  return api
}

/** Sends `payload` to every subscriber the bridge holds on `channel`, oldest first. */
export function emitWindowApi(channel: string, payload: unknown): void {
  for (const handler of Array.from(subscribers.get(channel) ?? [])) {
    handler(payload)
  }
}
