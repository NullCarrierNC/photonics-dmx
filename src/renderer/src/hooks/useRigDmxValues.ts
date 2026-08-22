import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { selectDmxBufferForRig } from '../utils/dmxPreviewBuffer'
import type { DmxValuesPayload } from '../../../shared/ipcTypes'

/**
 * Subscribes to the publisher's DMX buffers and hands the selected rig's own buffer to `apply`,
 * coalesced to one call per animation frame.
 *
 * The publisher sends at up to 44 Hz and every applied buffer re-renders whatever draws live
 * values. Only the newest buffer is kept, so a render pass slower than the send rate drops the
 * frames it missed instead of queueing them and the preview stays within a frame of the wire.
 *
 * `apply` is read through a ref, so an inline callback does not resubscribe. The rig id is read the
 * same way at flush time, so the buffer always matches the rig currently selected.
 */
export function useRigDmxValues(
  rigIdRef: MutableRefObject<string | null>,
  apply: (buffer: Record<number, number>) => void,
): void {
  const applyRef = useRef(apply)
  useEffect(() => {
    applyRef.current = apply
  }, [apply])

  useEffect(() => {
    let rafId: number | null = null
    let latest: DmxValuesPayload | null = null

    const flush = () => {
      rafId = null
      const payload = latest
      latest = null
      if (payload !== null) {
        applyRef.current(selectDmxBufferForRig(payload, rigIdRef.current))
      }
    }

    const handleDmxValues = (payload: DmxValuesPayload) => {
      latest = payload
      if (rafId === null) {
        rafId = window.requestAnimationFrame(flush)
      }
    }

    const unregister = registerIpcListener(RENDERER_RECEIVE.DMX_VALUES, handleDmxValues)
    return () => {
      unregister()
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [rigIdRef])
}
