/**
 * Utility functions for IPC communication.
 * Uses one native ipcRenderer listener per channel and fans out to in-process subscribers,
 * so the multiple components can listen without increasing the subscriber count.
 */

export type IpcHandler<TPayload = unknown> = (event: unknown, payload: TPayload) => void

type NativeHandler = (event: unknown, ...args: unknown[]) => void

interface ChannelState {
  nativeHandler: NativeHandler
  subscribers: Set<IpcHandler>
}

const registry = new Map<string, ChannelState>()

/**
 * Add an IPC event listener with cleanup tracking.
 * At most one native ipcRenderer listener exists per channel; events are fanned out to subscribers.
 *
 * @param channel The IPC channel to listen on
 * @param listener The listener function (event, payload)
 */
export function addIpcListener<TPayload = unknown>(
  channel: string,
  listener: IpcHandler<TPayload>,
): void {
  if (!registry.has(channel)) {
    const subscribers = new Set<IpcHandler>()
    const nativeHandler: NativeHandler = (event: unknown, ...args: unknown[]) => {
      const payload = args[0]
      subscribers.forEach((fn) => {
        try {
          fn(event, payload)
        } catch (err) {
          console.error(`[ipcHelpers] Subscriber error on channel "${channel}":`, err)
        }
      })
    }
    window.electron.ipcRenderer.on(channel, nativeHandler)
    registry.set(channel, { nativeHandler, subscribers })
  }

  const state = registry.get(channel)!
  if (state.subscribers.has(listener as IpcHandler)) {
    console.warn(
      `Listener for channel "${channel}" already registered. Skipping to prevent duplicates.`,
    )
    return
  }
  state.subscribers.add(listener as IpcHandler)
}

/**
 * Remove an IPC event listener and update tracking.
 * When the last subscriber is removed, the native ipcRenderer listener is removed.
 *
 * @param channel The IPC channel to remove the listener from
 * @param listener The listener function to remove
 */
export function removeIpcListener<TPayload = unknown>(
  channel: string,
  listener: IpcHandler<TPayload>,
): void {
  const state = registry.get(channel)
  if (!state) {
    return
  }

  state.subscribers.delete(listener as IpcHandler)

  if (state.subscribers.size === 0) {
    window.electron.ipcRenderer.removeListener(channel, state.nativeHandler)
    registry.delete(channel)
  }
}

/**
 * Register an IPC event handler that will be automatically cleaned up on component unmount.
 * Designed to be used in a React useEffect hook (returns a cleanup function).
 *
 * @param channel The IPC channel to listen on
 * @param listener The listener function (event, payload)
 * @returns A cleanup function to be returned from useEffect
 */
export function registerIpcListener<TPayload = unknown>(
  channel: string,
  listener: IpcHandler<TPayload>,
): () => void {
  addIpcListener(channel, listener)
  return () => {
    removeIpcListener(channel, listener)
  }
}
