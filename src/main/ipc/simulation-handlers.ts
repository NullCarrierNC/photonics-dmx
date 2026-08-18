import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { CueRegistry } from '../../photonics-dmx/cues/registries/CueRegistry'
import { getCueRegistry } from '../../photonics-dmx/cues/registries/cueRegistries'
import {
  DrumNoteType,
  InstrumentNoteType,
  getCueTypeFromId,
} from '../../photonics-dmx/cues/types/cueTypes'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { sendToAllWindows } from '../utils/windowUtils'
import { ipcError } from './ipcResult'
import { createMockAudioCueData, createMockCueData } from './mockCueData'
import { LIGHT, RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
import { isNonEmptyString, isPlainObject } from './inputValidation'
const log = createLogger('simulation-handlers')

/**
 * The motion-cue simulation state now lives in a ControllerManager-owned {@link MotionCueSimulator}
 * so it is reset when the controller graph is rebuilt (each cue is still executed once per active rig
 * chain so secondary rigs see the same motion at the same time).
 */

/**
 * Set up simulation and test-effect IPC handlers (beat/keyframe/measure/instrument, test effects, system status, available cues).
 */
export function setupSimulationHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  const sim = controllerManager.getMotionCueSimulator()

  const stopMotionSimAndNotify = (): void => {
    const hadYargSim = sim.hasNetCueActive('yarg')
    sim.stop()
    if (hadYargSim) {
      sendToAllWindows(RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE, {
        ref: null,
        source: 'cleared',
        manualFallback: false,
      })
    }
  }

  controllerManager.setOnConsoleEnter(stopMotionSimAndNotify)
  // Enabling RB3E hands the rig chains to the listener; stop any running simulation with the
  // same teardown so the renderer's motion-sim state clears too.
  controllerManager.setOnSimulationPreempt(stopMotionSimAndNotify)

  // Simulation dispatches through the same chain cue handlers RB3E drives (cue mode re-dispatches
  // the RB3 look at ~30 Hz), so simulation requests are refused while the RB3E listener is enabled.
  const rb3Blocked = (): boolean => controllerManager.getIsRb3Enabled()
  const RB3_BLOCKED_ERROR = 'Disable RB3E before simulating cues'

  ipcMain.handle(LIGHT.GET_AUDIO_CUE_GROUPS, async () => {
    try {
      const registry = AudioCueRegistry.getInstance()
      return registry.getGroupSummaries()
    } catch (error) {
      log.error('Error getting audio cue groups:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_AVAILABLE_AUDIO_CUES, async (_, groupId?: unknown) => {
    try {
      const registry = AudioCueRegistry.getInstance()
      const resolvedGroupId = typeof groupId === 'string' ? groupId : undefined
      const targetGroupId =
        resolvedGroupId || registry.getDefaultGroupId() || registry.getEnabledGroups()[0]
      if (!targetGroupId) return []
      return registry.getCueDetails(targetGroupId)
    } catch (error) {
      log.error('Error getting available audio cues:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_AVAILABLE_CUES, async (_, groupId?: unknown) => {
    try {
      const registry = CueRegistry.getInstance()
      const targetGroupId =
        typeof groupId === 'string' && groupId.trim() !== '' ? groupId : 'default'
      log.info(`Getting cues for group: ${targetGroupId}`)
      const group = registry.getGroup(targetGroupId)
      if (!group) {
        log.error(`Group not found: ${targetGroupId}`)
        return []
      }
      const availableCueTypes = Array.from(group.cues.keys())
      log.info(`Found ${availableCueTypes.length} cue types in group ${targetGroupId}`)
      if (availableCueTypes.length === 0) {
        log.error(`No cue types found in group: ${targetGroupId}`)
        return []
      }
      return availableCueTypes.map((cueType) => {
        const implementation = group.cues.get(cueType)
        const yargDescription = implementation!.description
        return {
          id: cueType,
          yargDescription,
          rb3Description:
            'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
          groupName: group.name,
        }
      })
    } catch (error) {
      log.error('Error getting available cues:', error)
      return []
    }
  })

  ipcMain.handle(
    LIGHT.START_TEST_EFFECT,
    async (
      _,
      data: {
        effectId: string
        venueSize?: 'NoVenue' | 'Small' | 'Large'
        bpm?: number
        cueGroup?: string
      },
    ) => {
      const { effectId, venueSize, bpm, cueGroup } = data ?? {}
      log.info(
        `IPC start-test-effect called with effectId: ${effectId}, venueSize: ${venueSize}, BPM: ${bpm}, cueGroup: ${cueGroup ?? 'none'}`,
      )
      try {
        if (rb3Blocked()) {
          return { success: false, error: RB3_BLOCKED_ERROR }
        }
        if (!controllerManager.getIsInitialized()) {
          log.info('System not initialized, initializing now before testing effect')
          await controllerManager.init()
        }
        controllerManager.startTestEffect(effectId, venueSize, bpm, cueGroup)
        return { success: true }
      } catch (error) {
        log.error('Error starting test effect:', error)
        return ipcError(error)
      }
    },
  )

  // RB3 twin of START_TEST_EFFECT: dispatches the selected RB3 cue through the RB3 chain runtime
  // (own registry / rb3CueHandler slots) rather than the YARG test-effect runner. The runner
  // re-dispatches on an interval so a held strobe re-fires `cue-called` continuously (a single
  // dispatch would flash once). Firing is refused while the live RB3E listener owns the rig chains
  // (same guard as every simulate handler).
  ipcMain.handle(
    LIGHT.START_RB3_TEST_EFFECT,
    async (
      _,
      data: {
        effectId: string
        venueSize?: 'NoVenue' | 'Small' | 'Large'
        bpm?: number
        cueGroup?: string
      },
    ) => {
      const { effectId, venueSize, bpm, cueGroup } = data ?? {}
      try {
        if (rb3Blocked()) {
          return { success: false, error: RB3_BLOCKED_ERROR }
        }
        if (!getCueTypeFromId(effectId)) {
          return { success: false, error: `Unknown RB3 cue: ${effectId}` }
        }
        controllerManager.startRb3TestEffect(effectId, venueSize, bpm, cueGroup)
        return { success: true }
      } catch (error) {
        log.error('Error starting RB3 test effect:', error)
        return ipcError(error)
      }
    },
  )

  ipcMain.handle(
    LIGHT.SET_RB3_SIM_LED_STATE,
    async (
      _,
      data: { red?: unknown; green?: unknown; blue?: unknown; yellow?: unknown; fog?: unknown },
    ) => {
      try {
        if (rb3Blocked()) {
          return { success: false, error: RB3_BLOCKED_ERROR }
        }
        // Clamp each bank to a valid 8-bit mask; ignore non-numeric input rather than throw.
        const mask = (v: unknown): number => {
          const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0
          return Math.max(0, Math.min(255, n))
        }
        controllerManager.setRb3SimulationLedState({
          red: mask(data?.red),
          green: mask(data?.green),
          blue: mask(data?.blue),
          yellow: mask(data?.yellow),
          fog: data?.fog === true,
        })
        return { success: true }
      } catch (error) {
        log.error('Error setting RB3 simulation LED state:', error)
        return ipcError(error)
      }
    },
  )

  ipcMain.handle(LIGHT.STOP_TEST_EFFECT, async () => {
    try {
      await controllerManager.stopTestEffect()
      return true
    } catch (error) {
      log.error('Error stopping test effect:', error)
      return false
    }
  })

  ipcMain.handle(
    LIGHT.SIMULATE_BEAT,
    async (
      _,
      data?: {
        venueSize?: 'NoVenue' | 'Small' | 'Large'
        bpm?: number
        cueGroup?: string
        effectId?: string | null
      },
    ) => {
      if (rb3Blocked() || !controllerManager.getIsInitialized()) return false
      // Make sure every chain has a YARG handler so the fanout `handleCue` actually
      // reaches secondary rigs even when no real network listener has run.
      controllerManager.ensureChainsHaveHandlersForSimulation('yarg')
      const fanout = controllerManager.getChainFanout()

      const mockCueData = data
        ? createMockCueData({
            venueSize: data.venueSize ?? 'Small',
            bpm: data.bpm ?? 120,
            effectId: data.effectId ?? undefined,
            beat: 'Strong',
            keyframe: 'Unknown',
            simulationCueGroup: data.cueGroup,
          })
        : createMockCueData({
            beat: 'Strong',
            keyframe: 'Unknown',
          })

      if (data) {
        const { effectId } = data
        if (effectId) {
          const cueType = getCueTypeFromId(effectId)
          if (cueType) {
            try {
              await fanout.handleCue(cueType, mockCueData)
            } catch (error) {
              log.error('Error handling cue in simulate beat:', error)
            }
          }
        }
      }
      sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, mockCueData)
      await sim.runAll(mockCueData)
      fanout.onBeat()
      return true
    },
  )

  ipcMain.handle(
    LIGHT.SIMULATE_KEYFRAME,
    async (
      _,
      data?: {
        venueSize?: 'NoVenue' | 'Small' | 'Large'
        bpm?: number
        cueGroup?: string
        effectId?: string | null
      },
    ) => {
      if (rb3Blocked() || !controllerManager.getIsInitialized()) return false
      controllerManager.ensureChainsHaveHandlersForSimulation('yarg')
      const fanout = controllerManager.getChainFanout()

      const mockCueData = data
        ? createMockCueData({
            venueSize: data.venueSize ?? 'Small',
            bpm: data.bpm ?? 120,
            effectId: data.effectId ?? undefined,
            beat: 'Unknown',
            keyframe: 'Next',
            simulationCueGroup: data.cueGroup,
          })
        : createMockCueData({
            beat: 'Unknown',
            keyframe: 'Next',
          })

      if (data) {
        const { effectId } = data
        if (effectId) {
          const cueType = getCueTypeFromId(effectId)
          if (cueType) {
            try {
              await fanout.handleCue(cueType, mockCueData)
            } catch (error) {
              log.error('Error handling cue in simulate keyframe:', error)
            }
          }
        }
      }
      sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, mockCueData)
      await sim.runAll(mockCueData)
      fanout.onKeyframe()
      return true
    },
  )

  ipcMain.handle(
    LIGHT.SIMULATE_MEASURE,
    async (
      _,
      data?: {
        venueSize?: 'NoVenue' | 'Small' | 'Large'
        bpm?: number
        cueGroup?: string
        effectId?: string | null
      },
    ) => {
      if (rb3Blocked() || !controllerManager.getIsInitialized()) return false
      controllerManager.ensureChainsHaveHandlersForSimulation('yarg')
      const fanout = controllerManager.getChainFanout()

      const mockCueData = data
        ? createMockCueData({
            venueSize: data.venueSize ?? 'Small',
            bpm: data.bpm ?? 120,
            effectId: data.effectId ?? undefined,
            beat: 'Measure',
            keyframe: 'Unknown',
            simulationCueGroup: data.cueGroup,
          })
        : createMockCueData({
            beat: 'Measure',
            keyframe: 'Unknown',
          })

      if (data) {
        const { effectId } = data
        if (effectId) {
          const cueType = getCueTypeFromId(effectId)
          if (cueType) {
            try {
              await fanout.handleCue(cueType, mockCueData)
            } catch (error) {
              log.error('Error handling cue in simulate measure:', error)
            }
          }
        }
      }
      sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, mockCueData)
      await sim.runAll(mockCueData)
      fanout.onMeasure()
      return true
    },
  )

  ipcMain.handle(
    LIGHT.SIMULATE_INSTRUMENT_NOTE,
    async (
      _,
      data: {
        instrument: string
        noteType: string
        venueSize?: 'NoVenue' | 'Small' | 'Large'
        bpm?: number
        cueGroup?: string
        effectId?: string | null
      },
    ) => {
      try {
        const { instrument, noteType, venueSize = 'Small', bpm = 120, cueGroup, effectId } = data
        if (rb3Blocked()) {
          return { success: false, error: RB3_BLOCKED_ERROR }
        }
        if (!controllerManager.getIsInitialized()) {
          return { success: false, error: 'Lighting system not initialized' }
        }
        controllerManager.ensureChainsHaveHandlersForSimulation('yarg')
        const fanout = controllerManager.getChainFanout()

        const mockCueData = createMockCueData({
          venueSize,
          bpm,
          effectId: effectId ?? undefined,
          beat: 'Unknown',
          keyframe: 'Unknown',
          simulationCueGroup: cueGroup,
        })
        switch (instrument) {
          case 'guitar': {
            const normalizedNote = String(noteType) as InstrumentNoteType
            mockCueData.guitarNotes = [normalizedNote]
            fanout.handleGuitarNote(normalizedNote, mockCueData)
            break
          }
          case 'bass': {
            const normalizedNote = String(noteType) as InstrumentNoteType
            mockCueData.bassNotes = [normalizedNote]
            fanout.handleBassNote(normalizedNote, mockCueData)
            break
          }
          case 'keys': {
            const normalizedNote = String(noteType) as InstrumentNoteType
            mockCueData.keysNotes = [normalizedNote]
            fanout.handleKeysNote(normalizedNote, mockCueData)
            break
          }
          case 'drums': {
            const normalizedNote = String(noteType) as DrumNoteType
            mockCueData.drumNotes = [normalizedNote]
            fanout.handleDrumNote(normalizedNote, mockCueData)
            break
          }
          default:
            log.warn(`Unknown instrument: ${instrument}`)
            return { success: false, error: `Unknown instrument: ${instrument}` }
        }

        // Run the current test cue with CueData that includes the note so the node graph
        // runs the instrument-event branch (e.g. drum-red).
        if (effectId && cueGroup) {
          const cueType = getCueTypeFromId(effectId)
          if (cueType) {
            await fanout.handleCue(cueType, mockCueData)
          }
        }

        sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, mockCueData)
        return { success: true }
      } catch (error) {
        log.error('Error simulating instrument note:', error)
        return ipcError(error)
      }
    },
  )

  ipcMain.handle(LIGHT.START_YARG_MOTION_CUE_SIMULATION, async (_, data: unknown) => {
    try {
      if (rb3Blocked()) {
        return ipcError(new Error(RB3_BLOCKED_ERROR))
      }
      if (!isPlainObject(data)) {
        return ipcError(new Error('Invalid motion simulation payload'))
      }
      const groupId = data.groupId
      const cueId = data.cueId
      if (!isNonEmptyString(groupId) || !isNonEmptyString(cueId)) {
        return ipcError(new Error('groupId and cueId are required'))
      }
      if (!controllerManager.getIsInitialized()) {
        await controllerManager.init()
      }
      const fanout = controllerManager.getChainFanout()
      if (fanout.getChains().length === 0) {
        return ipcError(new Error('Lighting system not available'))
      }
      const group = CueRegistry.getInstance().getGroup(groupId)
      if (!group) {
        return ipcError(new Error(`YARG motion group not found: ${groupId}`))
      }
      const cue = group.motionCues?.get(cueId)
      if (!cue) {
        return ipcError(new Error(`YARG motion cue not found: ${groupId}/${cueId}`))
      }
      sim.clearActive()
      // Cancel pending pan/tilt clears on every chain — without this, secondary rigs
      // would clear pan/tilt mid-motion after the previous simulation stopped.
      fanout.cancelPanTiltClear()
      const mockCueData = createMockCueData({
        venueSize: 'Small',
        bpm: 120,
        simulationCueGroup: groupId,
      })
      // Execute the motion cue once per active rig chain. The cue instance is shared
      // (registry singleton) but each chain's call binds a per-sequencer engine internally.
      for (const chain of fanout.getChains()) {
        const maybePromise = cue.execute(mockCueData, chain.sequencer, chain.dmxLightManager)
        if (maybePromise instanceof Promise) {
          await maybePromise
        }
      }
      sim.setNetCue('yarg', cue)
      sendToAllWindows(RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE, {
        ref: { groupId, cueId },
        source: 'auto',
        manualFallback: false,
      })
      return { success: true as const }
    } catch (error) {
      log.error('Error starting YARG motion cue simulation:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.START_RB3_MOTION_CUE_SIMULATION, async (_, data: unknown) => {
    try {
      if (rb3Blocked()) {
        return ipcError(new Error(RB3_BLOCKED_ERROR))
      }
      if (!isPlainObject(data)) {
        return ipcError(new Error('Invalid motion simulation payload'))
      }
      const groupId = data.groupId
      const cueId = data.cueId
      if (!isNonEmptyString(groupId) || !isNonEmptyString(cueId)) {
        return ipcError(new Error('groupId and cueId are required'))
      }
      if (!controllerManager.getIsInitialized()) {
        await controllerManager.init()
      }
      const fanout = controllerManager.getChainFanout()
      if (fanout.getChains().length === 0) {
        return ipcError(new Error('Lighting system not available'))
      }
      const group = getCueRegistry('rb3').getGroup(groupId)
      if (!group) {
        return ipcError(new Error(`RB3 motion group not found: ${groupId}`))
      }
      const cue = group.motionCues?.get(cueId)
      if (!cue) {
        return ipcError(new Error(`RB3 motion cue not found: ${groupId}/${cueId}`))
      }
      sim.clearActive()
      fanout.cancelPanTiltClear()
      const mockCueData = createMockCueData({
        venueSize: 'Small',
        bpm: 120,
        simulationCueGroup: groupId,
      })
      // Execute once to start the (time-driven) motion; RB3 motion has no beat to re-run on.
      for (const chain of fanout.getChains()) {
        const maybePromise = cue.execute(mockCueData, chain.sequencer, chain.dmxLightManager)
        if (maybePromise instanceof Promise) {
          await maybePromise
        }
      }
      sim.setNetCue('rb3', cue)
      sendToAllWindows(RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE, {
        ref: { groupId, cueId },
        source: 'auto',
        manualFallback: false,
      })
      return { success: true as const }
    } catch (error) {
      log.error('Error starting RB3 motion cue simulation:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.START_AUDIO_MOTION_CUE_SIMULATION, async (_, data: unknown) => {
    try {
      if (rb3Blocked()) {
        return ipcError(new Error(RB3_BLOCKED_ERROR))
      }
      if (!isPlainObject(data)) {
        return ipcError(new Error('Invalid motion simulation payload'))
      }
      const groupId = data.groupId
      const cueId = data.cueId
      if (!isNonEmptyString(groupId) || !isNonEmptyString(cueId)) {
        return ipcError(new Error('groupId and cueId are required'))
      }
      if (!controllerManager.getIsInitialized()) {
        await controllerManager.init()
      }
      const fanout = controllerManager.getChainFanout()
      if (fanout.getChains().length === 0) {
        return ipcError(new Error('Lighting system not available'))
      }
      const group = AudioCueRegistry.getInstance().getGroup(groupId)
      if (!group) {
        return ipcError(new Error(`Audio motion group not found: ${groupId}`))
      }
      const cue = group.motionCues?.get(cueId)
      if (!cue) {
        return ipcError(new Error(`Audio motion cue not found: ${groupId}/${cueId}`))
      }
      sim.clearActive()
      fanout.cancelPanTiltClear()
      const mockAudio = createMockAudioCueData(1)
      for (const chain of fanout.getChains()) {
        const maybePromise = cue.execute(mockAudio, chain.sequencer, chain.dmxLightManager)
        if (maybePromise instanceof Promise) {
          await maybePromise
        }
      }
      sim.setAudioCue(cue)
      return { success: true as const }
    } catch (error) {
      log.error('Error starting audio motion cue simulation:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.STOP_MOTION_CUE_SIMULATION, async () => {
    try {
      const hadYargSim = sim.hasNetCueActive('yarg')
      sim.stop()
      if (hadYargSim) {
        sendToAllWindows(RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE, {
          ref: null,
          source: 'cleared',
          manualFallback: false,
        })
      }
      return { success: true as const }
    } catch (error) {
      log.error('Error stopping motion cue simulation:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_SYSTEM_STATUS, async () => {
    try {
      return {
        success: true,
        isYargEnabled: controllerManager.getIsYargEnabled(),
        isRb3Enabled: controllerManager.getIsRb3Enabled(),
        senderStatus: controllerManager.getSenderStatus(),
      }
    } catch (error) {
      log.error('Error getting system status:', error)
      return ipcError(error)
    }
  })
}
