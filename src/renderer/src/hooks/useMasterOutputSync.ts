import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  abandonMasterOutputSyncAtom,
  receiveMasterOutputAtom,
  refreshMasterOutputAtom,
} from '../state/masterOutput'

/**
 * Keeps this window's copy of the master output controls in step with main.
 *
 * Mounted once per window, including the windows with no sidebar to show the state, because Escape
 * blacks out from any of them and the toggle has to read the current value to invert it.
 */
export function useMasterOutputSync(): void {
  const refresh = useSetAtom(refreshMasterOutputAtom)
  const receive = useSetAtom(receiveMasterOutputAtom)
  const abandon = useSetAtom(abandonMasterOutputSyncAtom)

  useEffect(() => {
    void refresh()
    return () => {
      abandon()
    }
  }, [refresh, abandon])

  useEffect(() => {
    return registerIpcListener(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, () => {
      void refresh()
    })
  }, [refresh])

  useEffect(() => {
    return registerIpcListener(RENDERER_RECEIVE.MASTER_OUTPUT_CHANGED, (snapshot) => {
      receive(snapshot)
    })
  }, [receive])
}
