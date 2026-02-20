/**
 * Utility functions for IPC communication
 */

type IpcListenerInternal = (...args: unknown[]) => void
export type IpcHandler<TPayload = unknown> = (event: unknown, payload: TPayload) => void

const activeListeners = new Map<string, Map<IpcListenerInternal, IpcListenerInternal>>()

/**
 * Add an IPC event listener with cleanup tracking
 * @param channel The IPC channel to listen on
 * @param listener The listener function (event, payload)
 */
export function addIpcListener<TPayload = unknown>(
  channel: string,
  listener: IpcHandler<TPayload>,
): void {
  const internal = listener as unknown as IpcListenerInternal
  if (!activeListeners.has(channel)) {
    activeListeners.set(channel, new Map())
  }

  const listeners = activeListeners.get(channel)!

  if (listeners.has(internal)) {
    console.warn(
      `Listener for channel "${channel}" already registered. Skipping to prevent duplicates.`,
    )
    return
  }

  const wrappedListener: IpcListenerInternal = (...args: unknown[]) => {
    listener(args[0], args[1] as TPayload)
  }

  listeners.set(internal, wrappedListener)
  window.electron.ipcRenderer.on(channel, wrappedListener)

  console.debug(`Added listener to channel "${channel}". Total listeners: ${listeners.size}`)

  if (listeners.size > 5) {
    console.warn(
      `Many listeners (${listeners.size}) for channel "${channel}". Possible memory leak?`,
    )
  }
}

/**
 * Remove an IPC event listener and update tracking
 * @param channel The IPC channel to remove the listener from
 * @param listener The listener function to remove
 */
export function removeIpcListener<TPayload = unknown>(
  channel: string,
  listener: IpcHandler<TPayload>,
): void {
  const internal = listener as unknown as IpcListenerInternal
  if (!activeListeners.has(channel)) {
    return
  }

  const listeners = activeListeners.get(channel)!

  const wrappedListener = listeners.get(internal)
  if (!wrappedListener) {
    return
  }

  window.electron.ipcRenderer.removeListener(channel, wrappedListener)
  listeners.delete(internal)

  console.debug(
    `Removed listener from channel "${channel}". Remaining listeners: ${listeners.size}`,
  )

  if (listeners.size === 0) {
    activeListeners.delete(channel)
    console.debug(`No more listeners for channel "${channel}". Removed tracking.`)
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
