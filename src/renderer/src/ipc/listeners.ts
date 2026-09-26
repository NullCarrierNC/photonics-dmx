/**
 * RB3E and the game listeners.
 */
import { CUE } from '../../../shared/ipcChannels'
import { orThrow } from './ipcResult'

// ---------------------------------------------------------------------------
// RB3E
// ---------------------------------------------------------------------------

export const getRb3Mode = () => window.api.invoke(CUE.RB3E_GET_MODE, undefined).then(orThrow)

export const getRb3Stats = () => window.api.invoke(CUE.RB3E_GET_STATS, undefined).then(orThrow)

// ---------------------------------------------------------------------------
// Listener management
// ---------------------------------------------------------------------------

export const enableYarg = () => window.api.send(CUE.YARG_LISTENER_ENABLED, undefined)

export const disableYarg = () => window.api.send(CUE.YARG_LISTENER_DISABLED, undefined)

export const enableRb3 = () => window.api.send(CUE.RB3E_LISTENER_ENABLED, undefined)

export const disableRb3 = () => window.api.send(CUE.RB3E_LISTENER_DISABLED, undefined)

export const setListenCueData = (shouldListen: boolean) =>
  window.api.send(CUE.SET_LISTEN_CUE_DATA, shouldListen)

export const setCueStyle = (style: 'simple' | 'complex') => window.api.send(CUE.CUE_STYLE, style)
