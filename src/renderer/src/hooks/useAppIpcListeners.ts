import { useEffect, useRef } from 'react'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'

import type { LightingConfiguration } from '../../../photonics-dmx/types'
import type { LightingPreferences } from '../atoms'
import type { AudioConfig } from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import type { CueStateInfo } from '../atoms'
import type { AudioCaptureManager } from '../services/AudioCaptureManager'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'

export interface UseAppIpcListenersParams {
  activeConfig: LightingConfiguration | null
  setAppVer: (v: string) => void
  setPrefs: (prefs: LightingPreferences) => void
  setEnttecProComPort: (port: string) => void
  setOpenDmxComPort: (port: string) => void
  setIsLeftMenuCollapsed: (collapsed: boolean) => void
  handleSenderError: (evt: unknown, msg: string) => void
  handleYargError: (evt: unknown, msg: string) => void
  handleSenderNetworkError: (
    evt: unknown,
    data: { sender: string; error: string; autoDisabled: boolean },
  ) => void
  handleCueStateUpdate: (evt: unknown, cueState: CueStateInfo) => void
  handleSenderStartFailure: (evt: unknown, data: { sender: string; error: string }) => void
  handleAudioEnable: (evt: unknown, config: AudioConfig) => void | Promise<void>
  handleAudioDisable: (evt: unknown) => void
  handleAudioConfigUpdate: (evt: unknown, config: AudioConfig) => void
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
    const fetchAppVersion = async () => {
      if (isInitialMount.current) {
        isInitialMount.current = false
        try {
          const ver = await window.electron.ipcRenderer.invoke(CONFIG.GET_APP_VERSION)
          setAppVer(ver)
        } catch (error) {
          console.error('Failed to get app version:', error)
        }
        return
      }
    }

    const getPrefs = async () => {
      const prefs = await window.electron.ipcRenderer.invoke(CONFIG.GET_PREFS)
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
    getPrefs()

    addIpcListener<string>(RENDERER_RECEIVE.SENDER_ERROR, handleSenderError)
    addIpcListener<string>(RENDERER_RECEIVE.YARG_ERROR, handleYargError)
    addIpcListener<{ sender: string; error: string; autoDisabled: boolean }>(
      RENDERER_RECEIVE.SENDER_NETWORK_ERROR,
      handleSenderNetworkError,
    )
    addIpcListener<CueStateInfo>(RENDERER_RECEIVE.CUE_STATE_UPDATE, handleCueStateUpdate)
    addIpcListener<{ sender: string; error: string }>(
      RENDERER_RECEIVE.SENDER_START_FAILED,
      handleSenderStartFailure,
    )
    addIpcListener<AudioConfig>(RENDERER_RECEIVE.AUDIO_ENABLE, handleAudioEnable)
    addIpcListener<unknown>(RENDERER_RECEIVE.AUDIO_DISABLE, handleAudioDisable)
    addIpcListener<AudioConfig>(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, handleAudioConfigUpdate)

    const saveLightLayout = async () => {
      if (activeConfig) {
        try {
          await window.electron.ipcRenderer.invoke(
            CONFIG.SAVE_LIGHT_LAYOUT,
            'myLayout.json',
            activeConfig,
          )
        } catch (error) {
          console.error('Failed to save light layout:', error)
        }
      }
    }

    saveLightLayout()

    return () => {
      removeIpcListener(RENDERER_RECEIVE.SENDER_ERROR, handleSenderError)
      removeIpcListener(RENDERER_RECEIVE.YARG_ERROR, handleYargError)
      removeIpcListener(RENDERER_RECEIVE.SENDER_NETWORK_ERROR, handleSenderNetworkError)
      removeIpcListener(RENDERER_RECEIVE.CUE_STATE_UPDATE, handleCueStateUpdate)
      removeIpcListener(RENDERER_RECEIVE.SENDER_START_FAILED, handleSenderStartFailure)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_ENABLE, handleAudioEnable)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_DISABLE, handleAudioDisable)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, handleAudioConfigUpdate)

      if (audioCaptureManagerRef.current) {
        audioCaptureManagerRef.current.stop()
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
