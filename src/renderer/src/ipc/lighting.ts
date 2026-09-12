/**
 * Direct lighting control: stage kit, clock rate, and the manual DMX console buffer.
 */
import type { FixtureConfig } from '../../../photonics-dmx/types'
import { CONFIG, LIGHT } from '../../../shared/ipcChannels'

// ---------------------------------------------------------------------------
// Stage kit
// ---------------------------------------------------------------------------

export const getStageKitPriority = () => window.api.invoke(CONFIG.GET_STAGE_KIT_PRIORITY, undefined)

export const setStageKitPriority = (priority: 'prefer-for-tracked' | 'random' | 'never') =>
  window.api.invoke(CONFIG.SET_STAGE_KIT_PRIORITY, priority)

// ---------------------------------------------------------------------------
// Clock rate
// ---------------------------------------------------------------------------

export const getClockRate = () => window.api.invoke(CONFIG.GET_CLOCK_RATE, undefined)

export const setClockRate = (clockRate: number) =>
  window.api.invoke(CONFIG.SET_CLOCK_RATE, clockRate)

// ---------------------------------------------------------------------------
// DMX Console (exclusive manual buffer)
// ---------------------------------------------------------------------------

export const enableConsole = (rigId: string) => window.api.invoke(LIGHT.CONSOLE_ENABLE, { rigId })

export const disableConsole = () => window.api.invoke(LIGHT.CONSOLE_DISABLE, undefined)

export const sendConsoleDmx = (buffer: Record<number, number>) =>
  window.api.send(LIGHT.CONSOLE_SEND_DMX, buffer)

export const updateConsoleChannel = (payload: {
  rigId: string
  lightId: string
  fixtureId: string
  channelName: string
  channelNumber: number
}) => window.api.invoke(LIGHT.CONSOLE_UPDATE_CHANNEL, payload)

export const setConsoleFixtureConfig = (payload: {
  rigId: string
  lightId: string
  fixtureId: string
  config: Partial<FixtureConfig>
}) => window.api.invoke(LIGHT.CONSOLE_SET_FIXTURE_CONFIG, payload)
