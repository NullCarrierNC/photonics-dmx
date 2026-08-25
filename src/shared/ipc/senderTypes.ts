/**
 * Wire sender and DMX console channels: sACN and Art-Net configuration, sender enable state and manual console control.
 *
 * Part of the IpcInvokeMap contract, recomposed in shared/ipcTypes.ts.
 */

import { LIGHT } from '../ipcChannels'
import type { FixtureConfig, SenderConfig } from '../../photonics-dmx/types'
import type { IpcErrorResult, IpcSuccessResult } from './common'

export interface SenderInvokeMap {
  [LIGHT.UPDATE_SACN_CONFIG]: {
    request: {
      universe?: number
      networkInterface?: string
      useUnicast?: boolean
      unicastDestination?: string
      refreshRateHz?: number
    }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.UPDATE_ARTNET_CONFIG]: {
    request: {
      host: string
      universe: number
      net: number
      subnet: number
      subuni: number
      port: number
      refreshRateHz?: number
    }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.SENDER_ENABLE]: {
    request: SenderConfig
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.SENDER_DISABLE]: {
    request: { sender: string }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.SENDER_DISABLE_ALL]: {
    request: void
    response: { disabled: string[] }
  }
  [LIGHT.CONSOLE_ENABLE]: {
    request: { rigId: string }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.CONSOLE_DISABLE]: {
    request: void
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.CONSOLE_UPDATE_CHANNEL]: {
    request: {
      rigId: string
      lightId: string
      fixtureId: string
      channelName: string
      channelNumber: number
    }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.CONSOLE_SET_HOME]: {
    request: {
      rigId: string
      lightId: string
      fixtureId: string
      panHome: number
      tiltHome: number
    }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.CONSOLE_SET_FIXTURE_CONFIG]: {
    request: {
      rigId: string
      lightId: string
      fixtureId: string
      config: Partial<FixtureConfig>
    }
    response: IpcSuccessResult | IpcErrorResult
  }
}
