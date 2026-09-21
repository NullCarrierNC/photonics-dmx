/**
 * Direct lighting control: stage kit, clock rate, master output, and the manual DMX console buffer.
 */
import type { FixtureConfig } from '../../../photonics-dmx/types'
import { CONFIG, LIGHT } from '../../../shared/ipcChannels'
import type { MotionRuntimeDomain } from '../../../shared/ipc/common'

// ---------------------------------------------------------------------------
// Motion runtime
// ---------------------------------------------------------------------------

/** The motion cue a domain is running now (a simulation first, else the live handler's pick). */
export const getRunningMotionCue = (domain: MotionRuntimeDomain) =>
  window.api.invoke(LIGHT.GET_RUNNING_MOTION_CUE, { domain })

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
// Master output (dimmer / blackout / strobe gate)
// ---------------------------------------------------------------------------

export const getMasterOutput = () => window.api.invoke(LIGHT.GET_MASTER_OUTPUT, undefined)

/** Partial update: omitted fields are left as they are. Returns the resulting state. */
export const setMasterOutput = (update: {
  dimmerPercent?: number
  blackout?: boolean
  strobeOutputEnabled?: boolean
}) => window.api.invoke(LIGHT.SET_MASTER_OUTPUT, update)

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
