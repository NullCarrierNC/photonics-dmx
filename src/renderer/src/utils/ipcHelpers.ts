/**
 * Utility functions for IPC event subscriptions.
 * Uses one native listener per channel and fans out to in-process subscribers,
 * so multiple components can listen without increasing the native listener count.
 */

import type { IpcEventChannel, IpcEventMap } from '../../../shared/ipcTypes'

export type IpcHandler<TPayload = unknown> = (payload: TPayload) => void

interface ChannelState {
  subscribers: Set<IpcHandler>
  cleanup: () => void
}

const registry = new Map<string, ChannelState>()

/**
 * Add an IPC event listener with fan-out.
 * At most one native listener exists per channel; events are fanned out to all subscribers.
 *
 * @param channel The RENDERER_RECEIVE channel to listen on
 * @param listener The listener function (payload)
 */
export function addIpcListener<T extends IpcEventChannel>(
  channel: T,
  listener: IpcHandler<IpcEventMap[T]>,
): void {
  if (!registry.has(channel)) {
    const subscribers = new Set<IpcHandler>()
    const cleanup = window.api.receive(channel, (payload: IpcEventMap[T]) => {
      subscribers.forEach((fn) => {
        try {
          fn(payload)
        } catch (err) {
          console.error(`[ipcHelpers] Subscriber error on channel "${channel}":`, err)
        }
      })
    })
    registry.set(channel, { subscribers, cleanup })
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
 * Remove an IPC event listener.
 * The native listener is kept alive; only the subscriber is removed from the fan-out set.
 *
 * @param channel The RENDERER_RECEIVE channel
 * @param listener The listener function to remove
 */
export function removeIpcListener<T extends IpcEventChannel>(
  channel: T,
  listener: IpcHandler<IpcEventMap[T]>,
): void {
  const state = registry.get(channel)
  if (!state) {
    return
  }
  state.subscribers.delete(listener as IpcHandler)
}

/**
 * Register an IPC event handler that is automatically cleaned up on component unmount.
 * Returns a cleanup function to use as the return value of a React useEffect hook.
 *
 * @param channel The RENDERER_RECEIVE channel to listen on
 * @param listener The listener function (payload)
 * @returns A cleanup function to be returned from useEffect
 */
export function registerIpcListener<T extends IpcEventChannel>(
  channel: T,
  listener: IpcHandler<IpcEventMap[T]>,
): () => void {
  addIpcListener(channel, listener)
  return () => {
    removeIpcListener(channel, listener)
  }
}
