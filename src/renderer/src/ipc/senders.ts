/**
 * Network discovery and sender enable/disable.
 */
import type { SenderConfig } from '../../../shared/ipcTypes'
import { LIGHT } from '../../../shared/ipcChannels'

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export const getNetworkInterfaces = () => window.api.invoke(LIGHT.GET_NETWORK_INTERFACES, undefined)

export const updateSacnConfig = (config: {
  universe?: number
  networkInterface?: string
  useUnicast?: boolean
  unicastDestination?: string
  refreshRateHz?: number
}) => window.api.invoke(LIGHT.UPDATE_SACN_CONFIG, config)

export const updateArtNetConfig = (config: {
  host: string
  universe: number
  net: number
  subnet: number
  subuni: number
  port: number
  refreshRateHz?: number
}) => window.api.invoke(LIGHT.UPDATE_ARTNET_CONFIG, config)

// ---------------------------------------------------------------------------
// Sender management
// ---------------------------------------------------------------------------

export const enableSender = (config: SenderConfig) => window.api.invoke(LIGHT.SENDER_ENABLE, config)

export const disableSender = (config: { sender: string }) =>
  window.api.invoke(LIGHT.SENDER_DISABLE, config)
