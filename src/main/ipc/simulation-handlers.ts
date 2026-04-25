import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry'
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
import { INetCue } from '../../photonics-dmx/cues/interfaces/INetCue'
import { IAudioCue } from '../../photonics-dmx/cues/interfaces/IAudioCue'
import type { CueData } from '../../photonics-dmx/cues/types/cueTypes'

/** YARG motion cue started from Cue Simulation; stopped explicitly or replaced by another start. */
let activeSimulatedYargMotionCue: INetCue | null = null
/** Audio motion cue started from Cue Simulation. */
let activeSimulatedAudioMotionCue: IAudioCue | null = null
let simulatedAudioMotionExecutionCount = 0

function stopActiveSimulatedMotionCue(controllerManager: ControllerManager): void {
  activeSimulatedYargMotionCue?.onStop?.()
  activeSimulatedYargMotionCue = null
  activeSimulatedAudioMotionCue?.onStop?.()
  activeSimulatedAudioMotionCue = null
  simulatedAudioMotionExecutionCount = 0
  controllerManager.getLightingController()?.schedulePanTiltClear()
}

async function runActiveSimulatedMotionCue(
  controllerManager: ControllerManager,
  mockCueData: CueData,
): Promise<void> {
  if (!activeSimulatedYargMotionCue) return
  const sequencer = controllerManager.getLightingController()
  const lightManager = controllerManager.getDmxLightManager()
  if (!sequencer || !lightManager) return
  const maybePromise = activeSimulatedYargMotionCue.execute(mockCueData, sequencer, lightManager)
  if (maybePromise instanceof Promise) {
    await maybePromise
  }
}

async function runActiveSimulatedAudioMotionCue(
  controllerManager: ControllerManager,
): Promise<void> {
  if (!activeSimulatedAudioMotionCue) return
  const sequencer = controllerManager.getLightingController()
  const lightManager = controllerManager.getDmxLightManager()
  if (!sequencer || !lightManager) return
  simulatedAudioMotionExecutionCount++
  const mockAudio = createMockAudioCueData(simulatedAudioMotionExecutionCount)
  const maybePromise = activeSimulatedAudioMotionCue.execute(mockAudio, sequencer, lightManager)
  if (maybePromise instanceof Promise) {
    await maybePromise
  }
}

/**
 * Set up simulation and test-effect IPC handlers (beat/keyframe/measure/instrument, test effects, system status, available cues).
 */
export function setupSimulationHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  controllerManager.setOnConsoleEnter(() => {
    const hadYargSim = activeSimulatedYargMotionCue !== null
    stopActiveSimulatedMotionCue(controllerManager)
    if (hadYargSim) {
      sendToAllWindows(RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE, {
        ref: null,
        source: 'cleared',
        manualFallback: false,
      })
    }
  })

  ipcMain.handle(LIGHT.GET_AUDIO_CUE_GROUPS, async () => {
    try {
      const registry = AudioCueRegistry.getInstance()
      return registry.getGroupSummaries()
    } catch (error) {
      console.error('Error getting audio cue groups:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_AVAILABLE_AUDIO_CUES, async (_, groupId?: string) => {
    try {
      const registry = AudioCueRegistry.getInstance()
      const targetGroupId = groupId || registry.getDefaultGroup() || registry.getEnabledGroups()[0]
      if (!targetGroupId) return []
      return registry.getCueDetails(targetGroupId)
    } catch (error) {
      console.error('Error getting available audio cues:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_AVAILABLE_CUES, async (_, groupId?: string) => {
    try {
      const registry = YargCueRegistry.getInstance()
      const targetGroupId = groupId || 'default'
      console.log(`Getting cues for group: ${targetGroupId}`)
      const group = registry.getGroup(targetGroupId)
      if (!group) {
        console.error(`Group not found: ${targetGroupId}`)
        return []
      }
      const availableCueTypes = Array.from(group.cues.keys())
      console.log(`Found ${availableCueTypes.length} cue types in group ${targetGroupId}`)
      if (availableCueTypes.length === 0) {
        console.error(`No cue types found in group: ${targetGroupId}`)
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
      console.error('Error getting available cues:', error)
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
      console.log(
        `IPC start-test-effect called with effectId: ${effectId}, venueSize: ${venueSize}, BPM: ${bpm}, cueGroup: ${cueGroup ?? 'none'}`,
      )
      try {
        if (!controllerManager.getIsInitialized()) {
          console.log('System not initialized, initializing now before testing effect')
          await controllerManager.init()
        }
        controllerManager.startTestEffect(effectId, venueSize, bpm, cueGroup)
        return { success: true }
      } catch (error) {
        console.error('Error starting test effect:', error)
        return ipcError(error)
      }
    },
  )

  ipcMain.handle(LIGHT.STOP_TEST_EFFECT, async () => {
    try {
      await controllerManager.stopTestEffect()
      return true
    } catch (error) {
      console.error('Error stopping test effect:', error)
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
      const lighting = controllerManager.getLightingController()
      if (!lighting) return false

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
        const cueHandler = controllerManager.getCueHandler()
        if (cueHandler && effectId) {
          const cueType = getCueTypeFromId(effectId)
          if (cueType) {
            try {
              await cueHandler.handleCue(cueType, mockCueData)
            } catch (error) {
              console.error('Error handling cue in simulate beat:', error)
            }
          }
        }
      }
      sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, mockCueData)
      await runActiveSimulatedMotionCue(controllerManager, mockCueData)
      await runActiveSimulatedAudioMotionCue(controllerManager)
      lighting.onBeat()
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
      const lighting = controllerManager.getLightingController()
      if (!lighting) return false

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
        const cueHandler = controllerManager.getCueHandler()
        if (cueHandler && effectId) {
          const cueType = getCueTypeFromId(effectId)
          if (cueType) {
            try {
              await cueHandler.handleCue(cueType, mockCueData)
            } catch (error) {
              console.error('Error handling cue in simulate keyframe:', error)
            }
          }
        }
      }
      sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, mockCueData)
      await runActiveSimulatedMotionCue(controllerManager, mockCueData)
      await runActiveSimulatedAudioMotionCue(controllerManager)
      lighting.onKeyframe()
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
      const lighting = controllerManager.getLightingController()
      if (!lighting) return false

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
        const cueHandler = controllerManager.getCueHandler()
        if (cueHandler && effectId) {
          const cueType = getCueTypeFromId(effectId)
          if (cueType) {
            try {
              await cueHandler.handleCue(cueType, mockCueData)
            } catch (error) {
              console.error('Error handling cue in simulate measure:', error)
            }
          }
        }
      }
      sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, mockCueData)
      await runActiveSimulatedMotionCue(controllerManager, mockCueData)
      await runActiveSimulatedAudioMotionCue(controllerManager)
      lighting.onMeasure()
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
        const cueHandler = controllerManager.getCueHandler()
        if (cueHandler) {
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
              if (
                'handleGuitarNote' in cueHandler &&
                typeof cueHandler.handleGuitarNote === 'function'
              ) {
                cueHandler.handleGuitarNote(normalizedNote, mockCueData)
              }
              break
            }
            case 'bass': {
              const normalizedNote = String(noteType) as InstrumentNoteType
              mockCueData.bassNotes = [normalizedNote]
              if (
                'handleBassNote' in cueHandler &&
                typeof cueHandler.handleBassNote === 'function'
              ) {
                cueHandler.handleBassNote(normalizedNote, mockCueData)
              }
              break
            }
            case 'keys': {
              const normalizedNote = String(noteType) as InstrumentNoteType
              mockCueData.keysNotes = [normalizedNote]
              if (
                'handleKeysNote' in cueHandler &&
                typeof cueHandler.handleKeysNote === 'function'
              ) {
                cueHandler.handleKeysNote(normalizedNote, mockCueData)
              }
              break
            }
            case 'drums': {
              const normalizedNote = String(noteType) as DrumNoteType
              mockCueData.drumNotes = [normalizedNote]
              if (
                'handleDrumNote' in cueHandler &&
                typeof cueHandler.handleDrumNote === 'function'
              ) {
                cueHandler.handleDrumNote(normalizedNote, mockCueData)
              }
              break
            }
            default:
              console.warn(`Unknown instrument: ${instrument}`)
              return { success: false, error: `Unknown instrument: ${instrument}` }
          }

          // Run the current test cue with CueData that includes the note so the node graph
          // runs the instrument-event branch (e.g. drum-red).
          if (effectId && cueGroup) {
            const cueType = getCueTypeFromId(effectId)
            if (cueType) {
              await cueHandler.handleCue(cueType, mockCueData)
            }
          }

          sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, mockCueData)
          return { success: true }
        }
        return { success: false, error: 'No cue handler available' }
      } catch (error) {
        console.error('Error simulating instrument note:', error)
        return ipcError(error)
      }
    },
  )

  ipcMain.handle(
    LIGHT.START_YARG_MOTION_CUE_SIMULATION,
    async (_, data: { groupId: string; cueId: string }) => {
      try {
        const { groupId, cueId } = data ?? {}
        if (!groupId || !cueId) {
          return ipcError(new Error('groupId and cueId are required'))
        }
        if (!controllerManager.getIsInitialized()) {
          await controllerManager.init()
        }
        const lightManager = controllerManager.getDmxLightManager()
        const sequencer = controllerManager.getLightingController()
        if (!lightManager || !sequencer) {
          return ipcError(new Error('Lighting system not available'))
        }
        const group = YargCueRegistry.getInstance().getGroup(groupId)
        if (!group) {
          return ipcError(new Error(`YARG motion group not found: ${groupId}`))
        }
        const cue = group.motionCues?.get(cueId)
        if (!cue) {
          return ipcError(new Error(`YARG motion cue not found: ${groupId}/${cueId}`))
        }
        activeSimulatedYargMotionCue?.onStop?.()
        activeSimulatedYargMotionCue = null
        activeSimulatedAudioMotionCue?.onStop?.()
        activeSimulatedAudioMotionCue = null
        simulatedAudioMotionExecutionCount = 0
        sequencer.cancelPanTiltClear()
        const mockCueData = createMockCueData({
          venueSize: 'Small',
          bpm: 120,
          simulationCueGroup: groupId,
        })
        const maybePromise = cue.execute(mockCueData, sequencer, lightManager)
        if (maybePromise instanceof Promise) {
          await maybePromise
        }
        activeSimulatedYargMotionCue = cue
        sendToAllWindows(RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE, {
          ref: { groupId, cueId },
          source: 'auto',
          manualFallback: false,
        })
        return { success: true as const }
      } catch (error) {
        console.error('Error starting YARG motion cue simulation:', error)
        return ipcError(error)
      }
    },
  )

  ipcMain.handle(
    LIGHT.START_AUDIO_MOTION_CUE_SIMULATION,
    async (_, data: { groupId: string; cueId: string }) => {
      try {
        const { groupId, cueId } = data ?? {}
        if (!groupId || !cueId) {
          return ipcError(new Error('groupId and cueId are required'))
        }
        if (!controllerManager.getIsInitialized()) {
          await controllerManager.init()
        }
        const lightManager = controllerManager.getDmxLightManager()
        const sequencer = controllerManager.getLightingController()
        if (!lightManager || !sequencer) {
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
        activeSimulatedYargMotionCue?.onStop?.()
        activeSimulatedYargMotionCue = null
        activeSimulatedAudioMotionCue?.onStop?.()
        activeSimulatedAudioMotionCue = null
        simulatedAudioMotionExecutionCount = 0
        sequencer.cancelPanTiltClear()
        const mockAudio = createMockAudioCueData(1)
        const maybePromise = cue.execute(mockAudio, sequencer, lightManager)
        if (maybePromise instanceof Promise) {
          await maybePromise
        }
        activeSimulatedAudioMotionCue = cue
        return { success: true as const }
      } catch (error) {
        console.error('Error starting audio motion cue simulation:', error)
        return ipcError(error)
      }
    },
  )

  ipcMain.handle(LIGHT.STOP_MOTION_CUE_SIMULATION, async () => {
    try {
      const hadYargSim = activeSimulatedYargMotionCue !== null
      stopActiveSimulatedMotionCue(controllerManager)
      if (hadYargSim) {
        sendToAllWindows(RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE, {
          ref: null,
          source: 'cleared',
          manualFallback: false,
        })
      }
      return { success: true as const }
    } catch (error) {
      console.error('Error stopping motion cue simulation:', error)
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
      console.error('Error getting system status:', error)
      return ipcError(error)
    }
  })
}
