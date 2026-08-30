import { useAtom, useSetAtom } from 'jotai'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  activeDmxLightsConfigAtom,
  currentPageAtom,
  dmxLightsLibraryAtom,
  dmxRigsAtom,
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
  syncOutputSenderAtoms,
  yargListenerEnabledAtom,
  rb3eListenerEnabledAtom,
} from './atoms'
import squareLogo from './assets/images/photonics-icon.png'
import LeftMenu from './components/LeftMenu'
import HeaderProjects from './components/Header'
import StatusBar from './components/StatusBar'
import { AppPageRouter } from './components/AppPageRouter'
import SenderErrorIndicator from './components/SenderErrorIndicator'
import LifecycleFailedBanner from './components/LifecycleFailedBanner'
import { useTimeout } from './utils/useTimeout'
import { useAppIpcListeners } from './hooks/useAppIpcListeners'
import { AudioCaptureManager } from './services/AudioCaptureManager'
import { AudioConfig } from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { useToast } from './hooks/useToast'
import { useYargErrorHandler } from './hooks/useYargErrorHandler'
import ToastContainer from './components/Toast'
import { ConfirmModalHost } from './components/ConfirmModalHost'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useDarkMode } from './DarkModeProvider'
import type { CueStateUpdatePayload, NodeCueRuntimeErrorPayload } from '../../shared/ipcTypes'
import {
  setAudioEnabled,
  savePrefs,
  getLightLibrary,
  getMyLights,
  getLightLayout,
  getDmxRigs,
  getSystemStatus,
} from './ipcApi'
import { registerIpcListener } from './utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
const log = createLogger('App')

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
  const setDmxRigs = useSetAtom(dmxRigsAtom)
  const [, setActiveLightsConfig] = useAtom(activeDmxLightsConfigAtom)
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
  const setYargEnabled = useSetAtom(yargListenerEnabledAtom)
  const setRb3Enabled = useSetAtom(rb3eListenerEnabledAtom)
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
      log.error('Sender error:', msg)
      showToast(msg, 'error', 5000)
    },
    [showToast],
  )

  const handleYargError = useYargErrorHandler({ showToast, setYargEnabled })

  const handleRb3Error = useCallback(
    (payload: { type: string; message: string; autoDisabled?: boolean }): void => {
      log.error('RB3E error:', payload)
      if (payload.autoDisabled) {
        setRb3Enabled(false)
      }
      showToast(`RB3E: ${payload.message}`, 'error', 5000)
    },
    [showToast, setRb3Enabled],
  )

  const handleNodeCueRuntimeError = useCallback(
    (payload: NodeCueRuntimeErrorPayload): void => {
      const text = payload?.nodeId ? `${payload.nodeId}: ${payload.message}` : payload?.message
      log.error('Node cue runtime error:', text)
      showToast(text ?? 'Node cue runtime error', 'error', 5000)
    },
    [showToast],
  )

  const handleCueValidationErrors = useCallback(
    (errors: Array<{ source: 'node-cue' | 'effect'; errors: string[] }>): void => {
      for (const { source, errors: messages } of errors) {
        const label = source === 'node-cue' ? 'Cue file' : 'Effect file'
        const message =
          messages.length === 1
            ? `${label} validation failed: ${messages[0]}`
            : `${label} validation failed (${messages.length} files): ${messages.join('; ')}`
        showToast(message, 'error', 7000)
      }
    },
    [showToast],
  )

  const handleConfigCorruptRecovered = useCallback(
    (payload: { files: { fileName: string; message?: string }[] }): void => {
      const list = payload.files.map((f) => f.fileName).join(', ')
      showToast(
        `A local settings file was invalid. Defaults were restored; your original file was saved as a backup. (${list})`,
        'warning',
        10000,
      )
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
      log.error(`Sender "${data.sender}" failed to start:`, data.error)

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
          log.warn(`Unknown sender type in failure notification: ${data.sender}`)
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
      log.error(`Sender "${data.sender}" network error:`, data.error)

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
          log.warn(`Unknown sender type in network error notification: ${data.sender}`)
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
      log.info('Received audio:enable from main process', config)

      try {
        // Create AudioCaptureManager if it doesn't exist
        if (!audioCaptureManagerRef.current) {
          audioCaptureManagerRef.current = new AudioCaptureManager(config)
          log.info('Created AudioCaptureManager')
        } else {
          // Update config if manager already exists
          audioCaptureManagerRef.current.updateConfig(config)
        }

        // Start capturing audio
        await audioCaptureManagerRef.current.start(config.deviceId)
        log.info('Audio capture started')
      } catch (error) {
        log.error('Failed to start audio capture:', error)
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
          log.info('Audio automatically disabled due to capture failure')
        } catch (disableError) {
          log.error('Failed to disable audio after capture failure:', disableError)
        }
      }
    },
    [setIsSenderError, setSenderError, resetErrorTimeout],
  )

  // Handler for audio:disable from main process
  const handleAudioDisable = useCallback((): void => {
    log.info('Received audio:disable from main process')

    if (audioCaptureManagerRef.current) {
      audioCaptureManagerRef.current.stop()
      log.info('Audio capture stopped')
    }
  }, [])

  // Handler for audio:config-update from main process
  const handleAudioConfigUpdate = useCallback(
    (config: AudioConfig | undefined): void => {
      log.info('Received audio:config-update from main process', config)

      // Update AudioCaptureManager if it exists (only when config is defined; updateConfig expects Partial<AudioConfig>)
      if (config && audioCaptureManagerRef.current) {
        audioCaptureManagerRef.current.updateConfig(config)
        log.info('AudioCaptureManager configuration updated')
      }

      if (!config) return

      // Update lightingPrefsAtom so preview components can react to colour changes. The main
      // process sends the whole merged config, so the stored config is replaced outright. `bands`
      // is copied so the atom never shares the array the IPC payload came in on.
      setPrefs((prev) => ({
        ...prev,
        audioConfig: { ...config, bands: [...config.bands] },
      }))
      log.info('Lighting preferences updated with new audio config')
    },
    [setPrefs],
  )

  // After a controller restart the main process auto-restores senders from preferences and may
  // mutate rigs via template-sync (see `syncRigsWithUserLights` in the main process). Sync the
  // renderer atoms so the UI reflects the actual runtime state without waiting on a navigation.
  useEffect(() => {
    const handleControllersRestarted = () => {
      getSystemStatus()
        .then((status) => {
          if (status?.success && status.senderStatus) {
            syncOutputSenderAtoms(status.senderStatus)
          }
        })
        .catch((err) => {
          log.error('App: failed to sync sender status after restart', err)
        })

      getDmxRigs()
        .then((rigs) => setDmxRigs(rigs || []))
        .catch((err) => log.error('App: failed to refresh DMX rigs after restart', err))
    }

    return registerIpcListener(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, handleControllersRestarted)
  }, [setDmxRigs])

  const handleToggleLeftMenu = async (): Promise<void> => {
    const newCollapsed = !isLeftMenuCollapsed
    setIsLeftMenuCollapsed(newCollapsed)
    try {
      await savePrefs({ leftMenuCollapsed: newCollapsed })
    } catch (error) {
      log.error('Failed to save left menu collapsed state:', error)
    }
  }

  // Load light library effect
  useEffect(() => {
    const loadLightLibrary = async (): Promise<void> => {
      try {
        const data = await getLightLibrary()
        setLightLibrary(data || [])
      } catch (error) {
        log.error('Failed to load light library:', error)
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
        log.error('Failed to load my lights:', error)
      }
    }

    loadMyLights()
  }, [setMyLights])

  // Load light layout effect
  useEffect(() => {
    const loadLightLayout = async (): Promise<void> => {
      try {
        const data = await getLightLayout()
        setActiveLightsConfig(data || null)
      } catch (error) {
        log.error('Failed to load light layout:', error)
      }
    }

    loadLightLayout()
  }, [setActiveLightsConfig])

  // Load DMX rigs at app start so any page that surfaces rig-aware UI (e.g. RoutedRigsHint
  // under the wire-sender toggles on the Status page) has data on first paint instead of
  // waiting for a route that happens to fetch rigs itself (Lights Layout, DMX Console, etc.).
  useEffect(() => {
    const loadDmxRigs = async (): Promise<void> => {
      try {
        const rigs = await getDmxRigs()
        setDmxRigs(rigs || [])
      } catch (error) {
        log.error('Failed to load DMX rigs:', error)
      }
    }

    loadDmxRigs()
  }, [setDmxRigs])

  useAppIpcListeners({
    setAppVer,
    setPrefs: setPrefs as (prefs: LightingPreferences) => void,
    setEnttecProComPort,
    setOpenDmxComPort,
    setIsLeftMenuCollapsed,
    handleSenderError,
    handleYargError,
    handleRb3Error,
    handleNodeCueRuntimeError,
    handleSenderNetworkError,
    handleCueStateUpdate,
    handleSenderStartFailure,
    handleCueValidationErrors,
    handleConfigCorruptRecovered,
    handleAudioEnable,
    handleAudioDisable,
    handleAudioConfigUpdate,
  })

  useEffect(() => {
    return () => {
      audioCaptureManagerRef.current?.stop()
    }
  }, [])

  const sidebarWidth = isLeftMenuCollapsed ? 80 : 218

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

        {/* Controller-failure notice, above the page so it shows whichever page is open */}
        <LifecycleFailedBanner />

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
      <ConfirmModalHost />
    </div>
  )
}

export default App
