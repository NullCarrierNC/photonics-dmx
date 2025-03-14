/**
 * Utility functions for IPC communication
 */

// Keep track of active listeners to avoid duplicates and memory leaks
const activeListeners = new Map<string, Map<(...args: any[]) => void, (...args: any[]) => void>>();

/**
 * Add an IPC event listener with cleanup tracking
 * @param channel The IPC channel to listen on
 * @param listener The listener function
 */
export function addIpcListener(channel: string, listener: (...args: any[]) => void): void {
  // Initialize the map of listeners for this channel if it doesn't exist
  if (!activeListeners.has(channel)) {
    activeListeners.set(channel, new Map());
  }
  
  const listeners = activeListeners.get(channel)!;
  
  // Check if this exact listener function is already registered
  if (listeners.has(listener)) {
    console.warn(`Listener for channel "${channel}" already registered. Skipping to prevent duplicates.`);
    return;
  }
  
  // Create a wrapped listener that we can keep track of
  const wrappedListener = (...args: any[]) => {
    listener(...args);
  };
  
  // Map the original listener to the wrapped one
  listeners.set(listener, wrappedListener);
  
  // Add the wrapped listener to the IPC renderer
  window.electron.ipcRenderer.on(channel, wrappedListener);
  
  // Log the current listener count
  console.debug(`Added listener to channel "${channel}". Total listeners: ${listeners.size}`);
  
  // Warn if too many listeners are added to the same channel
  if (listeners.size > 5) {
    console.warn(`Many listeners (${listeners.size}) for channel "${channel}". Possible memory leak?`);
  }
}

/**
 * Remove an IPC event listener and update tracking
 * @param channel The IPC channel to remove the listener from
 * @param listener The listener function to remove
 */
export function removeIpcListener(channel: string, listener: (...args: any[]) => void): void {
  if (!activeListeners.has(channel)) {
    return;
  }
  
  const listeners = activeListeners.get(channel)!;
  
  // Get the wrapped listener that was registered
  const wrappedListener = listeners.get(listener);
  if (!wrappedListener) {
    return;
  }
  
  
  // Step 1: Temporarily store all other listeners for this channel
  const otherListeners = new Array<[(...args: any[]) => void, (...args: any[]) => void]>();
  listeners.forEach((wrapped, original) => {
    if (original !== listener) {
      otherListeners.push([original, wrapped]);
    }
  });
  
  // Step 2: Remove all listeners from this channel
  window.electron.ipcRenderer.removeAllListeners(channel);
  
  // Step 3: Re-add all the other listeners except the one we want to remove
  otherListeners.forEach(([_, wrapped]) => {
    window.electron.ipcRenderer.on(channel, wrapped);
  });
  
  // Update our tracking
  listeners.delete(listener);
  
  // Log the operation
  console.debug(`Removed listener from channel "${channel}". Remaining listeners: ${listeners.size}`);
  
  // Clean up the channel entry if no listeners remain
  if (listeners.size === 0) {
    activeListeners.delete(channel);
    console.debug(`No more listeners for channel "${channel}". Removed tracking.`);
  }
}

/**
 * Register an IPC event handler that will be automatically cleaned up on component unmount
 * Designed to be used in a React useEffect hook
 * 
 * @param channel The IPC channel to listen on
 * @param listener The listener function
 * @returns A cleanup function to be returned from useEffect
 */
export function useIpcListener(channel: string, listener: (...args: any[]) => void): () => void {
  // Register the listener
  addIpcListener(channel, listener);
  
  // Return a cleanup function
  return () => {
    removeIpcListener(channel, listener);
  };
} 