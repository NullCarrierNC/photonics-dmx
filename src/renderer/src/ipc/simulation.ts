/**
 * Test effects and cue simulation.
 */
import { LIGHT } from '../../../shared/ipcChannels'

// ---------------------------------------------------------------------------
// Test effects and simulation
// ---------------------------------------------------------------------------

export const startTestEffect = (
  effectId: string,
  venueSize?: 'NoVenue' | 'Small' | 'Large',
  bpm?: number,
  cueGroup?: string,
) => window.api.invoke(LIGHT.START_TEST_EFFECT, { effectId, venueSize, bpm, cueGroup })

export const startRb3TestEffect = (
  effectId: string,
  venueSize?: 'NoVenue' | 'Small' | 'Large',
  bpm?: number,
  cueGroup?: string,
) => window.api.invoke(LIGHT.START_RB3_TEST_EFFECT, { effectId, venueSize, bpm, cueGroup })

export const setRb3SimLedState = (state: {
  red: number
  green: number
  blue: number
  yellow: number
  fog: boolean
}) => window.api.invoke(LIGHT.SET_RB3_SIM_LED_STATE, state)

export const stopTestEffect = () => window.api.invoke(LIGHT.STOP_TEST_EFFECT, undefined)

export const simulatePostProcessing = (state: string) =>
  window.api.invoke(LIGHT.SIMULATE_POST_PROCESSING, { state })

export const simulateBeat = (data?: {
  venueSize?: 'NoVenue' | 'Small' | 'Large'
  bpm?: number
  cueGroup?: string
  effectId?: string | null
}) => window.api.invoke(LIGHT.SIMULATE_BEAT, data)

export const simulateKeyframe = (data?: {
  venueSize?: 'NoVenue' | 'Small' | 'Large'
  bpm?: number
  cueGroup?: string
  effectId?: string | null
}) => window.api.invoke(LIGHT.SIMULATE_KEYFRAME, data)

export const simulateMeasure = (data?: {
  venueSize?: 'NoVenue' | 'Small' | 'Large'
  bpm?: number
  cueGroup?: string
  effectId?: string | null
}) => window.api.invoke(LIGHT.SIMULATE_MEASURE, data)

export const simulateInstrumentNote = (data: {
  instrument: string
  noteType: string
  venueSize?: 'NoVenue' | 'Small' | 'Large'
  bpm?: number
  cueGroup?: string
  effectId?: string | null
}) => window.api.invoke(LIGHT.SIMULATE_INSTRUMENT_NOTE, data)
