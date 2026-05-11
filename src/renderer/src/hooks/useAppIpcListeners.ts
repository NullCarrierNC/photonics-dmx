import { useEffect, useLayoutEffect, useRef } from 'react'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'

import type { LightingPreferences } from '../atoms'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { getAppVersion, getCorruptRecoveryEvents, getPrefs, getValidationErrors } from '../ipcApi'
import type { CueStateUpdatePayload } from '../../../shared/ipcTypes'
import type { AudioConfig } from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import { OPEN_DMX_DEFAULT_REFRESH_RATE_HZ } from '../../../shared/dmxOutputRefresh'
import { createLogger } from '../../../shared/logger'
const log = createLogger('useAppIpcListeners')

export interface UseAppIpcListenersParams {
  setAppVer: (v: string) => void
  setPrefs: (prefs: LightingPreferences) => void
  setEnttecProComPort: (port: string) => void
  setOpenDmxComPort: (port: string) => void
  setIsLeftMenuCollapsed: (collapsed: boolean) => void
  handleSenderError: (msg: string) => void
  handleYargError: (payload: { type: string; message: string; autoDisabled?: boolean }) => void
  handleNodeCueRuntimeError: (msg: string) => void
  handleSenderNetworkError: (data: { sender: string; error: string; autoDisabled: boolean }) => void
  handleCueStateUpdate: (cueState: CueStateUpdatePayload) => void
  handleSenderStartFailure: (data: { sender: string; error: string }) => void
  handleCueValidationErrors: (
    errors: Array<{ source: 'node-cue' | 'effect'; errors: string[] }>,
  ) => void
  handleConfigCorruptRecovered: (payload: {
    files: { fileName: string; message?: string }[]
  }) => void
  handleAudioEnable: (config: AudioConfig) => void | Promise<void>
  handleAudioDisable: (payload: undefined) => void
  handleAudioConfigUpdate: (config: AudioConfig | undefined) => void
}

function useLatestRef<T>(value: T) {
  const r = useRef(value)
  useLayoutEffect(() => {
    r.current = value
  }, [value])
  return r
}

async function loadAndApplyPrefs(
  p: UseAppIpcListenersParams,
  isCancelled: () => boolean,
): Promise<void> {
  if (isCancelled()) {
    return
  }
  const { setPrefs, setEnttecProComPort, setOpenDmxComPort, setIsLeftMenuCollapsed } = p
  const prefs = await getPrefs()
  if (isCancelled()) {
    return
  }
  log.info('\n Prefs', prefs)

  const updatedPrefs = { ...prefs }

  const defaultDmxOutputConfig = {
    sacnEnabled: false,
    artNetEnabled: false,
    enttecProEnabled: false,
    openDmxEnabled: false,
  }
  if (!prefs.dmxOutputConfig) {
    log.info('No saved DMX output config, using defaults:', defaultDmxOutputConfig)
    updatedPrefs.dmxOutputConfig = defaultDmxOutputConfig
  } else {
    updatedPrefs.dmxOutputConfig = { ...defaultDmxOutputConfig, ...prefs.dmxOutputConfig }
  }

  const defaultEnttecProConfig = { port: '' }
  if (!prefs.enttecProConfig) {
    log.info('No saved Enttec Pro config, using defaults:', defaultEnttecProConfig)
    updatedPrefs.enttecProConfig = defaultEnttecProConfig
  } else {
    updatedPrefs.enttecProConfig = { ...defaultEnttecProConfig, ...prefs.enttecProConfig }
  }
  setEnttecProComPort(updatedPrefs.enttecProConfig?.port ?? '')

  const defaultOpenDmxConfig = { port: '', dmxSpeed: OPEN_DMX_DEFAULT_REFRESH_RATE_HZ }
  if (!prefs.openDmxConfig) {
    log.info('No saved OpenDMX config, using defaults:', defaultOpenDmxConfig)
    updatedPrefs.openDmxConfig = defaultOpenDmxConfig
  } else {
    updatedPrefs.openDmxConfig = { ...defaultOpenDmxConfig, ...prefs.openDmxConfig }
  }
  setOpenDmxComPort(updatedPrefs.openDmxConfig?.port ?? '')

  if (!prefs.stageKitPrefs) {
    const defaultStageKitPrefs = {
      yargPriority: 'prefer-for-tracked' as 'prefer-for-tracked' | 'random' | 'never',
    }
    log.info('No saved Stage Kit preferences, using defaults:', defaultStageKitPrefs)
    updatedPrefs.stageKitPrefs = defaultStageKitPrefs
  }

  const defaultDmxSettingsPrefs = {
    artNetExpanded: false,
    enttecProExpanded: false,
    sacnExpanded: false,
    openDmxExpanded: false,
  }
  if (!prefs.dmxSettingsPrefs) {
    log.info('No saved DMX settings preferences, using defaults:', defaultDmxSettingsPrefs)
    updatedPrefs.dmxSettingsPrefs = defaultDmxSettingsPrefs
  } else {
    updatedPrefs.dmxSettingsPrefs = { ...defaultDmxSettingsPrefs, ...prefs.dmxSettingsPrefs }
  }

  setPrefs(updatedPrefs)

  if (prefs.leftMenuCollapsed !== undefined) {
    setIsLeftMenuCollapsed(prefs.leftMenuCollapsed)
  }
}

/**
 * Sets up IPC listeners for the main app window. Subscriptions register once; handlers always see
 * the latest props via a ref. Initial fetches (version, prefs, validation, corrupt recovery) run
 * on mount only — not on unrelated state changes (e.g. layout config edits).
 */
export function useAppIpcListeners(params: UseAppIpcListenersParams): void {
  const latest = useLatestRef(params)

  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled

    void (async () => {
      try {
        const ver = await getAppVersion()
        if (!isCancelled()) {
          latest.current.setAppVer(ver)
        }
      } catch (error) {
        log.error('Failed to get app version:', error)
      }
    })()

    void (async () => {
      try {
        await loadAndApplyPrefs(latest.current, isCancelled)
      } catch (error) {
        log.error('Failed to load preferences:', error)
      }
    })()

    void (async () => {
      try {
        const errors = await getValidationErrors()
        if (!isCancelled() && errors.length > 0) {
          latest.current.handleCueValidationErrors(errors)
        }
      } catch (error) {
        log.error('Failed to fetch validation errors:', error)
      }
    })()

    void (async () => {
      try {
        const { files } = await getCorruptRecoveryEvents()
        if (!isCancelled() && files.length > 0) {
          latest.current.handleConfigCorruptRecovered({ files })
        }
      } catch (error) {
        log.error('Failed to fetch config corrupt recovery events:', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [latest])

  useEffect(() => {
    const p = () => latest.current
    const onSenderError = (msg: string) => p().handleSenderError(msg)
    const onYargError = (payload: { type: string; message: string; autoDisabled?: boolean }) =>
      p().handleYargError(payload)
    const onNodeCueRuntimeError = (msg: string) => p().handleNodeCueRuntimeError(msg)
    const onSenderNetworkError = (data: { sender: string; error: string; autoDisabled: boolean }) =>
      p().handleSenderNetworkError(data)
    const onCueStateUpdate = (state: CueStateUpdatePayload) => p().handleCueStateUpdate(state)
    const onSenderStartFailed = (data: { sender: string; error: string }) =>
      p().handleSenderStartFailure(data)
    const onAudioEnable = (config: AudioConfig) => p().handleAudioEnable(config)
    const onAudioDisable = () => p().handleAudioDisable(undefined)
    const onAudioConfigUpdate = (c: AudioConfig | undefined) => p().handleAudioConfigUpdate(c)
    const onConfigCorrupt = (ev: { files: { fileName: string; message?: string }[] }) =>
      p().handleConfigCorruptRecovered(ev)

    addIpcListener(RENDERER_RECEIVE.SENDER_ERROR, onSenderError)
    addIpcListener(RENDERER_RECEIVE.YARG_ERROR, onYargError)
    addIpcListener(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, onNodeCueRuntimeError)
    addIpcListener(RENDERER_RECEIVE.SENDER_NETWORK_ERROR, onSenderNetworkError)
    addIpcListener(RENDERER_RECEIVE.CUE_STATE_UPDATE, onCueStateUpdate)
    addIpcListener(RENDERER_RECEIVE.SENDER_START_FAILED, onSenderStartFailed)
    addIpcListener(RENDERER_RECEIVE.AUDIO_ENABLE, onAudioEnable)
    addIpcListener(RENDERER_RECEIVE.AUDIO_DISABLE, onAudioDisable)
    addIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, onAudioConfigUpdate)
    addIpcListener(RENDERER_RECEIVE.CONFIG_CORRUPT_RECOVERED, onConfigCorrupt)

    return () => {
      removeIpcListener(RENDERER_RECEIVE.SENDER_ERROR, onSenderError)
      removeIpcListener(RENDERER_RECEIVE.YARG_ERROR, onYargError)
      removeIpcListener(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, onNodeCueRuntimeError)
      removeIpcListener(RENDERER_RECEIVE.SENDER_NETWORK_ERROR, onSenderNetworkError)
      removeIpcListener(RENDERER_RECEIVE.CUE_STATE_UPDATE, onCueStateUpdate)
      removeIpcListener(RENDERER_RECEIVE.SENDER_START_FAILED, onSenderStartFailed)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_ENABLE, onAudioEnable)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_DISABLE, onAudioDisable)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, onAudioConfigUpdate)
      removeIpcListener(RENDERER_RECEIVE.CONFIG_CORRUPT_RECOVERED, onConfigCorrupt)
    }
  }, [latest])
}
