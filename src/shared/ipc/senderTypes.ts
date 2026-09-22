/**
 * Wire sender and DMX console channels: sACN and Art-Net configuration, sender enable state and manual console control.
 *
 * Part of the IpcInvokeMap contract, recomposed in shared/ipcTypes.ts.
 */

import { LIGHT } from '../ipcChannels'
import type { FixtureConfig, SenderConfig } from '../../photonics-dmx/types'
import type { MasterOutputSnapshot } from '../../photonics-dmx/controllers/MasterOutputState'
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
  [LIGHT.UPDATE_ENTTEC_CONFIG]: {
    request: {
      devicePath: string
      dmxSpeed?: number
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
  [LIGHT.GET_MASTER_OUTPUT]: {
    request: void
    response: MasterOutputSnapshot
  }
  /**
   * Partial update: omitted fields are left alone, so the fader and the two toggles can each
   * drive the channel without reading the others first. The response is the resulting state, so a
   * clamped level corrects the UI rather than leaving it out of step with the rig.
   */
  [LIGHT.SET_MASTER_OUTPUT]: {
    request: {
      dimmerPercent?: number
      blackout?: boolean
      strobeOutputEnabled?: boolean
    }
    response: (IpcSuccessResult & { state: MasterOutputSnapshot }) | IpcErrorResult
  }
  [LIGHT.CONSOLE_ENABLE]: {
    request: { rigId: string }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.CONSOLE_DISABLE]: {
    request: void
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
