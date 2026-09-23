/**
 * The `utils/ipcHelpers` stand-in for renderer suites. It keeps every subscriber on a channel, as
 * the real fan-out does, so two components on one channel both hear an event and removing one
 * leaves the other. A suite registers it the way it registers `ipcApiMock`:
 *
 *   jest.mock('../utils/ipcHelpers', () =>
 *     jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
 *       '@renderer/tests/helpers/ipcListenerStub',
 *     ).ipcListenerStub,
 *   )
 *
 * then sends events with `emitIpc` and reads who is listening with `ipcSubscribers`. Jest gives
 * each suite its own module registry, so the subscribers are per suite.
 */

type Handler = (payload: never) => void

const channels = new Map<string, Set<Handler>>()

function add(channel: string, handler: Handler): void {
  let subscribers = channels.get(channel)
  if (!subscribers) {
    subscribers = new Set()
    channels.set(channel, subscribers)
  }
  subscribers.add(handler)
}

function remove(channel: string, handler: Handler): void {
  channels.get(channel)?.delete(handler)
}

/** The three `ipcHelpers` exports, over one subscriber set per channel. */
export const ipcListenerStub = {
  addIpcListener: add,
  removeIpcListener: remove,
  registerIpcListener: (channel: string, handler: Handler): (() => void) => {
    add(channel, handler)
    return () => remove(channel, handler)
  },
}

/** Sends `payload` to every subscriber on `channel`, oldest first. */
export function emitIpc(channel: string, payload: unknown): void {
  for (const handler of Array.from(channels.get(channel) ?? [])) {
    ;(handler as (payload: unknown) => void)(payload)
  }
}

/** The subscribers on `channel`, oldest first. */
export function ipcSubscribers(channel: string): ReadonlyArray<(payload: unknown) => void> {
  return Array.from(channels.get(channel) ?? []) as Array<(payload: unknown) => void>
}

/** Drops every subscriber, for a suite whose tests leave something mounted. */
export function resetIpcListenerStub(): void {
  channels.clear()
}
