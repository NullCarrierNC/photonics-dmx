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
import { useTimeout } from './utils/useTimeout'
import { useAppIpcListeners } from './hooks/useAppIpcListeners'
import { AudioCaptureManager } from './services/AudioCaptureManager'
import { AudioConfig } from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { useToast } from './hooks/useToast'
import ToastContainer from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useDarkMode } from './DarkModeProvider'
import type { CueStateUpdatePayload } from '../../shared/ipcTypes'
import { setAudioEnabled, savePrefs, getLightLibrary, getMyLights, getLightLayout } from './ipcApi'

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
  const [currentPage] = useAtom(currentPageAtom)
  const { isDarkMode, toggleDarkMode } = useDarkMode()
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
    (msg: string): void => {
      console.error('Sender error:', msg)
      showToast(msg, 'error', 5000)
    },
    [showToast],
  )

  // Handler for YARG listener errors (protocol/datagram version mismatch, etc.)
  const handleYargError = useCallback(
    (msg: string): void => {
      console.error('YARG error:', msg)
      showToast(`YARG: ${msg}`, 'error', 5000)
    },
    [showToast],
  )

  const handleNodeCueRuntimeError = useCallback(
    (msg: string): void => {
      console.error('Node cue runtime error:', msg)
      showToast(msg, 'error', 5000)
    },
    [showToast],
  )

  // Handler for cue state updates
  const handleCueStateUpdate = useCallback(
    (cueState: CueStateUpdatePayload): void => {
      setCueState(cueState)
    },
    [setCueState],
  )

  // Handler for sender start failures
  const handleSenderStartFailure = useCallback(
    (data: { sender: string; error: string }): void => {
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
    (data: { sender: string; error: string; autoDisabled: boolean }): void => {
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
    async (config: AudioConfig): Promise<void> => {
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
          await setAudioEnabled(false)
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
    (config: AudioConfig | undefined): void => {
      console.log('Received audio:config-update from main process', config)

      // Update AudioCaptureManager if it exists (only when config is defined; updateConfig expects Partial<AudioConfig>)
      if (config && audioCaptureManagerRef.current) {
        audioCaptureManagerRef.current.updateConfig(config)
        console.log('AudioCaptureManager configuration updated')
      }

      if (!config) return

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

  const handleToggleLeftMenu = async (): Promise<void> => {
    const newCollapsed = !isLeftMenuCollapsed
    setIsLeftMenuCollapsed(newCollapsed)
    try {
      await savePrefs({ leftMenuCollapsed: newCollapsed })
    } catch (error) {
      console.error('Failed to save left menu collapsed state:', error)
    }
  }

  // Load light library effect
  useEffect(() => {
    const loadLightLibrary = async (): Promise<void> => {
      try {
        const data = await getLightLibrary()
        setLightLibrary(data || [])
      } catch (error) {
        console.error('Failed to load light library:', error)
      }
    }

    loadLightLibrary()
  }, [setLightLibrary])

  // Load my lights effect
  useEffect(() => {
    const loadMyLights = async (): Promise<void> => {
      try {
        const data = await getMyLights()
        setMyLights(data || [])
      } catch (error) {
        console.error('Failed to load my lights:', error)
      }
    }

    loadMyLights()
  }, [setMyLights])

  // Load light layout effect
  useEffect(() => {
    const loadLightLayout = async (): Promise<void> => {
      try {
        const data = await getLightLayout('myLayout.json')
        setActiveLightsConfig(data || null)
      } catch (error) {
        console.error('Failed to load light layout:', error)
      }
    }

    loadLightLayout()
  }, [setActiveLightsConfig])

  useAppIpcListeners({
    activeConfig,
    setAppVer,
    setPrefs: setPrefs as (prefs: LightingPreferences) => void,
    setEnttecProComPort,
    setOpenDmxComPort,
    setIsLeftMenuCollapsed,
    handleSenderError,
    handleYargError,
    handleNodeCueRuntimeError,
    handleSenderNetworkError,
    handleCueStateUpdate,
    handleSenderStartFailure,
    handleAudioEnable,
    handleAudioDisable,
    handleAudioConfigUpdate,
    audioCaptureManagerRef,
  })

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
