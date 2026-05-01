/**
 * Host-injected channel emit for renderer updates. Keeps domain code free of Electron / main IPC.
 */
export interface RuntimeBroadcaster {
  emit(channel: string, payload: unknown): void
}

/** Test / headless stubs where no renderer exists. */
export function noopRuntimeBroadcaster(): RuntimeBroadcaster {
  return {
    emit: () => {},
  }
}
