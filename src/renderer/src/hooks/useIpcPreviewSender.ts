import { useEffect } from 'react'
import { disableSender, enableSender } from '../ipcApi'
import { wasRefused } from '../ipc/ipcResult'
import type { IpcSenderConfig } from '../../../photonics-dmx/types'
import { createLogger } from '../../../shared/logger'

const log = createLogger('useIpcPreviewSender')

/**
 * Number of mounted views currently wanting the preview stream. Several surfaces show live DMX at
 * once (the preview, the console, the calibration wizard), so a plain enable on mount and disable
 * on unmount would let whichever unmounts first cut the stream out from under the others.
 */
let viewers = 0

/**
 * Turning the sender off immediately on unmount would also break two ordinary cases: StrictMode
 * mounts, unmounts and remounts in development, and moving between two preview pages unmounts the
 * old one before the new one mounts. Both would stop and restart the stream for no reason, so the
 * last viewer leaving schedules the stop and a new viewer arriving first cancels it.
 */
const RELEASE_GRACE_MS = 250
let releaseTimer: ReturnType<typeof setTimeout> | null = null

/** Whether the stream is on. Tracked apart from the count, because a viewer arriving during the
 *  grace period finds it still running and must not ask for it a second time. */
let streamOn = false

function acquire(): void {
  viewers += 1
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer)
    releaseTimer = null
  }
  if (!streamOn) {
    streamOn = true
    // A refused or failed start leaves the stream off, so the next viewer asks for it again.
    const failed = (reason: unknown): void => {
      log.error('Failed to enable the IPC preview sender', reason)
      streamOn = false
    }
    enableSender({ sender: 'ipc' } as IpcSenderConfig).then((result) => {
      if (wasRefused(result)) failed(result.error)
    }, failed)
  }
}

function release(): void {
  viewers = Math.max(0, viewers - 1)
  if (viewers > 0 || releaseTimer !== null) {
    return
  }
  releaseTimer = setTimeout(() => {
    releaseTimer = null
    if (viewers > 0) {
      return
    }
    streamOn = false
    disableSender({ sender: 'ipc' }).catch((err) =>
      log.error('Failed to disable the IPC preview sender', err),
    )
  }, RELEASE_GRACE_MS)
}

/**
 * Keeps the IPC preview stream running for as long as at least one view needs it.
 *
 * The stream makes the publisher build and serialise a buffer per rig on every frame, so leaving it
 * on once a preview has been opened costs that work for the rest of the session on pages that show
 * nothing.
 */
export function useIpcPreviewSender(): void {
  useEffect(() => {
    acquire()
    return release
  }, [])
}

/** Test seam: forget any counted viewers and cancel a pending stop. */
export function __resetIpcPreviewSenderForTests(): void {
  viewers = 0
  streamOn = false
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer)
    releaseTimer = null
  }
}
