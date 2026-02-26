import { useEffect, useRef } from 'react'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'

import type { LightingConfiguration } from '../../../photonics-dmx/types'
import type { LightingPreferences } from '../atoms'
import type { AudioConfig } from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import type { AudioCaptureManager } from '../services/AudioCaptureManager'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { getAppVersion, getPrefs, saveLightLayout } from '../ipcApi'
import type { CueStateUpdatePayload } from '../../../shared/ipcTypes'

export interface UseAppIpcListenersParams {
  activeConfig: LightingConfiguration | null
  setAppVer: (v: string) => void
  setPrefs: (prefs: LightingPreferences) => void
  setEnttecProComPort: (port: string) => void
  setOpenDmxComPort: (port: string) => void
  setIsLeftMenuCollapsed: (collapsed: boolean) => void
  handleSenderError: (msg: string) => void
  handleYargError: (msg: string) => void
  handleSenderNetworkError: (data: { sender: string; error: string; autoDisabled: boolean }) => void
  handleCueStateUpdate: (cueState: CueStateUpdatePayload) => void
  handleSenderStartFailure: (data: { sender: string; error: string }) => void
  handleAudioEnable: (config: AudioConfig) => void | Promise<void>
  handleAudioDisable: (payload: undefined) => void
  handleAudioConfigUpdate: (config: AudioConfig | undefined) => void
  audioCaptureManagerRef: React.RefObject<AudioCaptureManager | null>
}

/**
 * Sets up IPC listeners for the main app window: preferences load, sender/cue/audio
 * events, and cleanup on unmount.
 */
export function useAppIpcListeners(params: UseAppIpcListenersParams): void {
  const {
    activeConfig,
    setAppVer,
    setPrefs,
    setEnttecProComPort,
    setOpenDmxComPort,
    setIsLeftMenuCollapsed,
    handleSenderError,
    handleYargError,
    handleSenderNetworkError,
    handleCueStateUpdate,
    handleSenderStartFailure,
    handleAudioEnable,
    handleAudioDisable,
    handleAudioConfigUpdate,
    audioCaptureManagerRef,
  } = params

  const isInitialMount = useRef(true)

  useEffect(() => {
    const audioCaptureManager = audioCaptureManagerRef.current
    const fetchAppVersion = async () => {
      if (isInitialMount.current) {
        isInitialMount.current = false
        try {
          const ver = await getAppVersion()
          setAppVer(ver)
        } catch (error) {
          console.error('Failed to get app version:', error)
        }
        return
      }
    }

    const loadPrefs = async () => {
      const prefs = await getPrefs()
      console.log('\n Prefs', prefs)

      const updatedPrefs = { ...prefs }

      const defaultDmxOutputConfig = {
        sacnEnabled: false,
        artNetEnabled: false,
        enttecProEnabled: false,
        openDmxEnabled: false,
      }
      if (!prefs.dmxOutputConfig) {
        console.log('No saved DMX output config, using defaults:', defaultDmxOutputConfig)
        updatedPrefs.dmxOutputConfig = defaultDmxOutputConfig
      } else {
        updatedPrefs.dmxOutputConfig = { ...defaultDmxOutputConfig, ...prefs.dmxOutputConfig }
      }

      const defaultEnttecProConfig = { port: '' }
      if (!prefs.enttecProConfig) {
        console.log('No saved Enttec Pro config, using defaults:', defaultEnttecProConfig)
        updatedPrefs.enttecProConfig = defaultEnttecProConfig
      } else {
        updatedPrefs.enttecProConfig = { ...defaultEnttecProConfig, ...prefs.enttecProConfig }
      }
      setEnttecProComPort(updatedPrefs.enttecProConfig?.port ?? '')

      const defaultOpenDmxConfig = { port: '', dmxSpeed: 40 }
      if (!prefs.openDmxConfig) {
        console.log('No saved OpenDMX config, using defaults:', defaultOpenDmxConfig)
        updatedPrefs.openDmxConfig = defaultOpenDmxConfig
      } else {
        updatedPrefs.openDmxConfig = { ...defaultOpenDmxConfig, ...prefs.openDmxConfig }
      }
      setOpenDmxComPort(updatedPrefs.openDmxConfig?.port ?? '')

      if (!prefs.stageKitPrefs) {
        const defaultStageKitPrefs = {
          yargPriority: 'prefer-for-tracked' as 'prefer-for-tracked' | 'random' | 'never',
        }
        console.log('No saved Stage Kit preferences, using defaults:', defaultStageKitPrefs)
        updatedPrefs.stageKitPrefs = defaultStageKitPrefs
      }

      const defaultDmxSettingsPrefs = {
        artNetExpanded: false,
        enttecProExpanded: false,
        sacnExpanded: false,
        openDmxExpanded: false,
      }
      if (!prefs.dmxSettingsPrefs) {
        console.log('No saved DMX settings preferences, using defaults:', defaultDmxSettingsPrefs)
        updatedPrefs.dmxSettingsPrefs = defaultDmxSettingsPrefs
      } else {
        updatedPrefs.dmxSettingsPrefs = { ...defaultDmxSettingsPrefs, ...prefs.dmxSettingsPrefs }
      }

      setPrefs(updatedPrefs)

      if (prefs.leftMenuCollapsed !== undefined) {
        setIsLeftMenuCollapsed(prefs.leftMenuCollapsed)
      }
    }

    fetchAppVersion()
    loadPrefs()

    addIpcListener(RENDERER_RECEIVE.SENDER_ERROR, handleSenderError)
    addIpcListener(RENDERER_RECEIVE.YARG_ERROR, handleYargError)
    addIpcListener(RENDERER_RECEIVE.SENDER_NETWORK_ERROR, handleSenderNetworkError)
    addIpcListener(RENDERER_RECEIVE.CUE_STATE_UPDATE, handleCueStateUpdate)
    addIpcListener(RENDERER_RECEIVE.SENDER_START_FAILED, handleSenderStartFailure)
    addIpcListener(RENDERER_RECEIVE.AUDIO_ENABLE, handleAudioEnable)
    addIpcListener(RENDERER_RECEIVE.AUDIO_DISABLE, handleAudioDisable)
    addIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, handleAudioConfigUpdate)

    const saveLayout = async () => {
      if (activeConfig) {
        try {
          await saveLightLayout(activeConfig)
        } catch (error) {
          console.error('Failed to save light layout:', error)
        }
      }
    }

    saveLayout()

    return () => {
      removeIpcListener(RENDERER_RECEIVE.SENDER_ERROR, handleSenderError)
      removeIpcListener(RENDERER_RECEIVE.YARG_ERROR, handleYargError)
      removeIpcListener(RENDERER_RECEIVE.SENDER_NETWORK_ERROR, handleSenderNetworkError)
      removeIpcListener(RENDERER_RECEIVE.CUE_STATE_UPDATE, handleCueStateUpdate)
      removeIpcListener(RENDERER_RECEIVE.SENDER_START_FAILED, handleSenderStartFailure)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_ENABLE, handleAudioEnable)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_DISABLE, handleAudioDisable)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, handleAudioConfigUpdate)

      if (audioCaptureManager) {
        audioCaptureManager.stop()
      }
    }
  }, [
    activeConfig,
    handleSenderError,
    handleYargError,
    handleSenderNetworkError,
    handleCueStateUpdate,
    handleSenderStartFailure,
    handleAudioEnable,
    handleAudioDisable,
    handleAudioConfigUpdate,
    setEnttecProComPort,
    setOpenDmxComPort,
    setPrefs,
    setAppVer,
    setIsLeftMenuCollapsed,
    audioCaptureManagerRef,
  ])
}
