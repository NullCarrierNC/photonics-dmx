import { useAtom, useSetAtom } from 'jotai'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  activeDmxLightsConfigAtom,
  currentPageAtom,
  dmxLightsLibraryAtom,
  isSenderErrorAtom,
  lightingPrefsAtom,
  myDmxLightsAtom,
  senderErrorAtom,
  currentCueStateAtom,
  CueStateInfo,
  enttecProComPortAtom,
  senderSacnEnabledAtom,
  senderArtNetEnabledAtom,
  senderEnttecProEnabledAtom,
  senderIpcEnabledAtom,
  LightingPreferences,
  senderOpenDmxEnabledAtom,
  openDmxComPortAtom,
} from './atoms'
import squareLogo from './assets/images/photonics-icon.png'
import LeftMenu from './components/LeftMenu'
import HeaderProjects from './components/Header'
import StatusBar from './components/StatusBar'
import { AppPageRouter } from './components/AppPageRouter'
import SenderErrorIndicator from './components/SenderErrorIndicator'
import { DmxFixture, LightingConfiguration } from '../../photonics-dmx/types'
import { addIpcListener, removeIpcListener } from './utils/ipcHelpers'
import { useTimeout } from './utils/useTimeout'
import { AudioCaptureManager } from './services/AudioCaptureManager'
import { AudioConfig } from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { useToast } from './hooks/useToast'
import ToastContainer from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { CONFIG, RENDERER_RECEIVE } from '../../shared/ipcChannels'

/**
 * Main application component
 * Creates the main app layout, loads configurations from the Node process,
 * and sets up global error handling
 *
 * @returns React component with the complete application structure
 */
export const App = (): JSX.Element => {
  // State atoms
  const setMyLights = useSetAtom(myDmxLightsAtom)
  const setLightLibrary = useSetAtom(dmxLightsLibraryAtom)
  const [activeConfig, setActiveLightsConfig] = useAtom(activeDmxLightsConfigAtom)
  const [, setIsLibraryLoaded] = useState(false)
  const [currentPage] = useAtom(currentPageAtom)
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [, setPrefs] = useAtom(lightingPrefsAtom)
  const [isLeftMenuCollapsed, setIsLeftMenuCollapsed] = useState(false)
  const setIsSenderError = useSetAtom(isSenderErrorAtom)
  const setSenderError = useSetAtom(senderErrorAtom)
  const setCueState = useSetAtom(currentCueStateAtom)
  const setEnttecProComPort = useSetAtom(enttecProComPortAtom)
  const setOpenDmxComPort = useSetAtom(openDmxComPortAtom)
  const setSacnEnabled = useSetAtom(senderSacnEnabledAtom)
  const setArtNetEnabled = useSetAtom(senderArtNetEnabledAtom)
  const setEnttecProEnabled = useSetAtom(senderEnttecProEnabledAtom)
  const setOpenDmxEnabled = useSetAtom(senderOpenDmxEnabledAtom)
  const setIpcEnabled = useSetAtom(senderIpcEnabledAtom)
  const [appVer, setAppVer] = useState('')
  const { toasts, showToast, hideToast } = useToast()

  // Audio capture manager ref (created once, persists for app lifetime)
  const audioCaptureManagerRef = useRef<AudioCaptureManager | null>(null)

  // Create a clearErrorTimeout callback that will be used to reset error state
  const clearErrorState = useCallback((): void => {
    setIsSenderError(false)
  }, [setIsSenderError])

  // Set up our timeout hook for error handling
  const { reset: resetErrorTimeout } = useTimeout(clearErrorState, 6000)

  // Handler for sender errors (non-network; network errors use SENDER_NETWORK_ERROR + toast)
  const handleSenderError = useCallback(
    (_evt: unknown, msg: string): void => {
      console.error('Sender error:', msg)
      showToast(msg, 'error', 5000)
    },
    [showToast],
  )

  // Handler for YARG listener errors (protocol/datagram version mismatch, etc.)
  const handleYargError = useCallback(
    (_evt: unknown, msg: string): void => {
      console.error('YARG error:', msg)
      showToast(`YARG: ${msg}`, 'error', 5000)
    },
    [showToast],
  )

  // Handler for cue state updates
  const handleCueStateUpdate = useCallback(
    (_evt: unknown, cueState: CueStateInfo): void => {
      setCueState(cueState)
    },
    [setCueState],
  )

  // Handler for sender start failures
  const handleSenderStartFailure = useCallback(
    (_evt: unknown, data: { sender: string; error: string }): void => {
      console.error(`Sender "${data.sender}" failed to start:`, data.error)

      // Update the UI state to reflect that the sender is not running
      switch (data.sender) {
        case 'sacn':
          setSacnEnabled(false)
          break
        case 'artnet':
          setArtNetEnabled(false)
          break
        case 'enttecpro':
          setEnttecProEnabled(false)
          break
        case 'opendmx':
          setOpenDmxEnabled(false)
          break
        case 'ipc':
          setIpcEnabled(false)
          break
        default:
          console.warn(`Unknown sender type in failure notification: ${data.sender}`)
      }

      const senderName =
        data.sender === 'artnet'
          ? 'ArtNet'
          : data.sender === 'sacn'
            ? 'sACN'
            : data.sender.toUpperCase()
      showToast(`Failed to start ${senderName} sender: ${data.error}`, 'error', 5000)
    },
    [
      setSacnEnabled,
      setArtNetEnabled,
      setEnttecProEnabled,
      setOpenDmxEnabled,
      setIpcEnabled,
      showToast,
    ],
  )

  // Handler for sender network errors (invalid destinations, etc.)
  const handleSenderNetworkError = useCallback(
    (_evt: unknown, data: { sender: string; error: string; autoDisabled: boolean }): void => {
      console.error(`Sender "${data.sender}" network error:`, data.error)

      // Update the UI state to reflect that the sender is not running
      switch (data.sender) {
        case 'sacn':
          setSacnEnabled(false)
          break
        case 'artnet':
          setArtNetEnabled(false)
          break
        case 'enttecpro':
          setEnttecProEnabled(false)
          break
        case 'opendmx':
          setOpenDmxEnabled(false)
          break
        default:
          console.warn(`Unknown sender type in network error notification: ${data.sender}`)
      }

      // Show error toast message
      const senderName =
        data.sender === 'artnet'
          ? 'ArtNet'
          : data.sender === 'sacn'
            ? 'sACN'
            : data.sender.toUpperCase()
      const errorMessage = data.autoDisabled
        ? `${senderName} destination unreachable. ${senderName} has been automatically disabled. Error: ${data.error}`
        : `${senderName} network error: ${data.error}`
      showToast(errorMessage, 'error', 5000)
    },
    [setSacnEnabled, setArtNetEnabled, setEnttecProEnabled, setOpenDmxEnabled, showToast],
  )

  // Handler for audio:enable from main process
  const handleAudioEnable = useCallback(
    async (_evt: unknown, config: AudioConfig): Promise<void> => {
      console.log('Received audio:enable from main process', config)

      try {
        // Create AudioCaptureManager if it doesn't exist
        if (!audioCaptureManagerRef.current) {
          audioCaptureManagerRef.current = new AudioCaptureManager(config)
          console.log('Created AudioCaptureManager')
        } else {
          // Update config if manager already exists
          audioCaptureManagerRef.current.updateConfig(config)
        }

        // Start capturing audio
        await audioCaptureManagerRef.current.start(config.deviceId)
        console.log('Audio capture started')
      } catch (error) {
        console.error('Failed to start audio capture:', error)
        setIsSenderError(true)
        // Show full error message - extract message from Error objects or convert to string
        const errorMessage =
          error instanceof Error
            ? error.message
            : error instanceof DOMException
              ? `${error.name}: ${error.message}`
              : String(error)
        setSenderError(`Failed to start audio capture: ${errorMessage}`)
        resetErrorTimeout()

        // Automatically disable audio in main process since it failed to start
        try {
          await window.electron.ipcRenderer.invoke(CONFIG.SET_AUDIO_ENABLED, false)
          console.log('Audio automatically disabled due to capture failure')
        } catch (disableError) {
          console.error('Failed to disable audio after capture failure:', disableError)
        }
      }
    },
    [setIsSenderError, setSenderError, resetErrorTimeout],
  )

  // Handler for audio:disable from main process
  const handleAudioDisable = useCallback((): void => {
    console.log('Received audio:disable from main process')

    if (audioCaptureManagerRef.current) {
      audioCaptureManagerRef.current.stop()
      console.log('Audio capture stopped')
    }
  }, [])

  // Handler for audio:config-update from main process
  const handleAudioConfigUpdate = useCallback(
    (_evt: unknown, config: AudioConfig): void => {
      console.log('Received audio:config-update from main process', config)

      // Update AudioCaptureManager if it exists
      if (audioCaptureManagerRef.current) {
        audioCaptureManagerRef.current.updateConfig(config)
        console.log('AudioCaptureManager configuration updated')
      }

      // Update lightingPrefsAtom so preview components can react to color changes
      // Merge with existing audioConfig to preserve fields like sampleRate and updateIntervalMs
      setPrefs((prev) => ({
        ...prev,
        audioConfig: {
          ...prev.audioConfig,
          // Update all compatible fields from config (exclude deviceId which has type mismatch)
          fftSize: config.fftSize,
          sensitivity: config.sensitivity,
          beatDetection: config.beatDetection,
          smoothing: config.smoothing,
          frequencyBands: config.frequencyBands,
          enabled: config.enabled,
          linearResponse: config.linearResponse,
          // Preserve fields that exist in frontend but not in backend config
          sampleRate: prev.audioConfig?.sampleRate,
          updateIntervalMs: prev.audioConfig?.updateIntervalMs,
          // Preserve deviceId from frontend (number) rather than backend (string)
          deviceId: prev.audioConfig?.deviceId,
        } as LightingPreferences['audioConfig'],
      }))
      console.log('Lighting preferences updated with new audio config')
    },
    [setPrefs],
  )

  const toggleDarkMode = (): void => {
    setIsDarkMode((prevMode) => !prevMode)
    document.documentElement.classList.toggle('dark', !isDarkMode)
  }

  const handleToggleLeftMenu = async (): Promise<void> => {
    const newCollapsed = !isLeftMenuCollapsed
    setIsLeftMenuCollapsed(newCollapsed)
    try {
      await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
        leftMenuCollapsed: newCollapsed,
      })
    } catch (error) {
      console.error('Failed to save left menu collapsed state:', error)
    }
  }

  // Load light library effect
  useEffect(() => {
    const loadLightLibrary = async (): Promise<void> => {
      try {
        const data: DmxFixture[] = await window.electron.ipcRenderer.invoke(
          CONFIG.GET_LIGHT_LIBRARY,
        )
        setLightLibrary(data || [])
        setIsLibraryLoaded(true)
      } catch (error) {
        console.error('Failed to load light library:', error)
      }
    }

    loadLightLibrary()
  }, [setLightLibrary, setIsLibraryLoaded])

  // Load my lights effect
  useEffect(() => {
    const loadMyLights = async (): Promise<void> => {
      try {
        const data: DmxFixture[] = await window.electron.ipcRenderer.invoke(CONFIG.GET_MY_LIGHTS)
        setMyLights(data || [])
        setIsLibraryLoaded(true)
      } catch (error) {
        console.error('Failed to load my lights:', error)
      }
    }

    loadMyLights()
  }, [setMyLights, setIsLibraryLoaded])

  // Load light layout effect
  useEffect(() => {
    const loadLightLayout = async (): Promise<void> => {
      try {
        const data: LightingConfiguration = await window.electron.ipcRenderer.invoke(
          CONFIG.GET_LIGHT_LAYOUT,
          'myLayout.json',
        )
        setActiveLightsConfig(data || null)
      } catch (error) {
        console.error('Failed to load light layout:', error)
      }
    }

    loadLightLayout()
  }, [setActiveLightsConfig])

  // Use a ref to track if it's the initial mount
  const isInitialMount = useRef(true)

  useEffect(() => {
    const fetchAppVersion = async () => {
      if (isInitialMount.current) {
        // Skip saving on the initial mount
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

      // Prepare all preference updates in a single object
      const updatedPrefs = { ...prefs }

      // Initialize DMX output preferences from saved preferences or default values
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

      // Initialize Stage Kit preferences if not present
      if (!prefs.stageKitPrefs) {
        const defaultStageKitPrefs = {
          yargPriority: 'prefer-for-tracked' as 'prefer-for-tracked' | 'random' | 'never',
        }
        console.log('No saved Stage Kit preferences, using defaults:', defaultStageKitPrefs)
        updatedPrefs.stageKitPrefs = defaultStageKitPrefs
      }

      // Initialize DMX settings preferences if not present
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

      // Load left menu collapsed state
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

    // Cleanup function
    return () => {
      removeIpcListener(RENDERER_RECEIVE.SENDER_ERROR, handleSenderError)
      removeIpcListener(RENDERER_RECEIVE.YARG_ERROR, handleYargError)
      removeIpcListener(RENDERER_RECEIVE.SENDER_NETWORK_ERROR, handleSenderNetworkError)
      removeIpcListener(RENDERER_RECEIVE.CUE_STATE_UPDATE, handleCueStateUpdate)
      removeIpcListener(RENDERER_RECEIVE.SENDER_START_FAILED, handleSenderStartFailure)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_ENABLE, handleAudioEnable)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_DISABLE, handleAudioDisable)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, handleAudioConfigUpdate)

      // Cleanup audio capture manager on unmount
      if (audioCaptureManagerRef.current) {
        audioCaptureManagerRef.current.stop()
      }
    }
  }, [
    activeConfig,
    handleSenderError,
    handleSenderNetworkError,
    handleCueStateUpdate,
    handleSenderStartFailure,
    handleAudioEnable,
    handleAudioDisable,
    handleAudioConfigUpdate,
    setEnttecProComPort,
    setOpenDmxComPort,
    setPrefs,
  ])

  const sidebarWidth = isLeftMenuCollapsed ? 80 : 208

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-black dark:text-gray-200">
      {/* Left Sidebar */}
      <div
        className="fixed top-0 left-0 h-full shadow-lg flex flex-col bg-white dark:bg-gray-900 dark:text-white overflow-y-auto transition-all duration-300"
        style={{ width: `${sidebarWidth}px` }}>
        {/* Sidebar Header */}
        <div
          className={`h-16 bg-gray-800 dark:bg-gray-950 text-white flex items-center ${isLeftMenuCollapsed ? 'justify-center' : 'p-2'}`}>
          <img
            src={squareLogo}
            alt="Logo"
            className="h-full"
            style={{ width: 'auto', height: '100%', padding: '4px' }}
            title={isLeftMenuCollapsed ? `Photonics ${appVer}` : undefined}
          />
          {!isLeftMenuCollapsed && (
            <span className="flex-grow text-left ml-2">Photonics {appVer}</span>
          )}
        </div>

        {/* Sidebar Content with LeftMenu */}
        <div className={`flex-grow overflow-y-auto ${isLeftMenuCollapsed ? 'p-2' : 'p-4'}`}>
          <LeftMenu
            isDarkMode={isDarkMode}
            toggleDarkMode={toggleDarkMode}
            isCollapsed={isLeftMenuCollapsed}
            onToggleCollapse={handleToggleLeftMenu}
          />
        </div>
      </div>

      {/* Right Content Area */}
      <div
        className="flex-grow flex flex-col h-screen transition-all duration-300"
        style={{ marginLeft: `${sidebarWidth}px` }}>
        {/* Main Content Header */}
        <div className="h-16 bg-gray-800 dark:bg-gray-950 text-white flex items-center justify-center z-10">
          <HeaderProjects />
        </div>

        {/* Scrollable Content Area - Using flex-grow to fill available space */}
        <div className="flex-grow overflow-y-auto bg-gray-200 dark:bg-gray-800">
          <ErrorBoundary name="AppContent">
            <SenderErrorIndicator />
            <ErrorBoundary key={currentPage} name={`Page:${currentPage}`}>
              <AppPageRouter currentPage={currentPage} />
            </ErrorBoundary>
          </ErrorBoundary>
        </div>

        {/* Status Bar - Positioned at the bottom of the flex container */}
        <StatusBar />
      </div>
      <ToastContainer toasts={toasts} onDismiss={hideToast} />
    </div>
  )
}

export default App
