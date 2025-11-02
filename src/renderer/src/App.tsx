import { useAtom, useSetAtom } from 'jotai';
import { useState, useEffect, useCallback, useRef } from 'react';
import { activeDmxLightsConfigAtom, currentPageAtom, dmxLightsLibraryAtom, isSenderErrorAtom, lightingPrefsAtom, myDmxLightsAtom, senderErrorAtom, currentCueStateAtom, CueStateInfo, enttecProComPortAtom, senderSacnEnabledAtom, senderArtNetEnabledAtom, senderEnttecProEnabledAtom, senderIpcEnabledAtom, LightingPreferences } from './atoms';
import { Pages } from './types';
import squareLogo from './assets/images/photonics-icon.png';
import LeftMenu from './components/LeftMenu';
import HeaderProjects from './components/Header';
import Status from './pages/Status';
import MyLights from './pages/MyLights';
import LightsLayout from './pages/LightsLayout';
import NetworkDebug from './pages/NetworkDebug';
import StatusBar from './components/StatusBar';
import DmxPreview from './pages/DmxPreview';
import CueSimulation from './pages/CueSimulation';
import { DmxFixture, LightingConfiguration } from '../../photonics-dmx/types';
import { IpcRendererEvent } from 'electron';
import About from './pages/About';
import Preferences from './pages/Preferences';
import AudioSettings from './pages/AudioSettings';
import SenderErrorIndicator from './components/SenderErrorIndicator';
import { addIpcListener, removeIpcListener } from './utils/ipcHelpers';
import { useTimeout } from './utils/useTimeout';
import { AudioCaptureManager } from './services/AudioCaptureManager';
import { AudioConfig } from '../../photonics-dmx/listeners/Audio/AudioTypes';

/**
 * Main application component
 * Creates the main app layout, loads configurations from the Node process,
 * and sets up global error handling
 * 
 * @returns React component with the complete application structure
 */
export const App = (): JSX.Element => {
  // State atoms
  const setMyLights = useSetAtom(myDmxLightsAtom);
  const setLightLibrary = useSetAtom(dmxLightsLibraryAtom);
  const [activeConfig, setActiveLightsConfig] = useAtom(activeDmxLightsConfigAtom);
  const [, setIsLibraryLoaded] = useState(false);
  const [currentPage] = useAtom(currentPageAtom);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [, setPrefs] = useAtom(lightingPrefsAtom);
  const setIsSenderError = useSetAtom(isSenderErrorAtom);
  const setSenderError = useSetAtom(senderErrorAtom);
  const setCueState = useSetAtom(currentCueStateAtom);
  const setEnttecProComPort = useSetAtom(enttecProComPortAtom);
  const setSacnEnabled = useSetAtom(senderSacnEnabledAtom);
  const setArtNetEnabled = useSetAtom(senderArtNetEnabledAtom);
  const setEnttecProEnabled = useSetAtom(senderEnttecProEnabledAtom);
  const setIpcEnabled = useSetAtom(senderIpcEnabledAtom);
  const [appVer, setAppVer] = useState('');

  // Audio capture manager ref (created once, persists for app lifetime)
  const audioCaptureManagerRef = useRef<AudioCaptureManager | null>(null);

  // Create a clearErrorTimeout callback that will be used to reset error state
  const clearErrorState = useCallback((): void => {
    setIsSenderError(false);
  }, [setIsSenderError]);

  // Set up our timeout hook for error handling
  const {  reset: resetErrorTimeout } = useTimeout(clearErrorState, 6000);

  // Handler for sender errors
  const handleSenderError = useCallback((evt: IpcRendererEvent, msg: string): void => {
    console.error('IPC event:', evt);
    console.error('IPC message:', msg);

    setIsSenderError(true);
    setSenderError(msg);

    // Reset the error timeout (clears existing timeout and sets a new one)
    resetErrorTimeout();
  }, [setIsSenderError, setSenderError, resetErrorTimeout]);

  // Handler for cue state updates
  const handleCueStateUpdate = useCallback((_evt: IpcRendererEvent, cueState: CueStateInfo): void => {
    setCueState(cueState);
  }, [setCueState]);

  // Handler for sender start failures
  const handleSenderStartFailure = useCallback((_evt: IpcRendererEvent, data: { sender: string; error: string }): void => {
    console.error(`Sender "${data.sender}" failed to start:`, data.error);

    // Update the UI state to reflect that the sender is not running
    switch (data.sender) {
      case 'sacn':
        setSacnEnabled(false);
        break;
      case 'artnet':
        setArtNetEnabled(false);
        break;
      case 'enttecpro':
        setEnttecProEnabled(false);
        break;
      case 'ipc':
        setIpcEnabled(false);
        break;
      default:
        console.warn(`Unknown sender type in failure notification: ${data.sender}`);
    }

    // Also set sender error state to show the error to the user
    setIsSenderError(true);
    setSenderError(`Failed to start ${data.sender} sender: ${data.error}`);
    resetErrorTimeout();
  }, [setSacnEnabled, setArtNetEnabled, setEnttecProEnabled, setIpcEnabled, setIsSenderError, setSenderError, resetErrorTimeout]);

  // Handler for audio:enable from main process
  const handleAudioEnable = useCallback(async (_evt: IpcRendererEvent, config: AudioConfig): Promise<void> => {
    console.log('Received audio:enable from main process', config);
    
    try {
      // Create AudioCaptureManager if it doesn't exist
      if (!audioCaptureManagerRef.current) {
        audioCaptureManagerRef.current = new AudioCaptureManager(config);
        console.log('Created AudioCaptureManager');
      } else {
        // Update config if manager already exists
        audioCaptureManagerRef.current.updateConfig(config);
      }
      
      // Start capturing audio
      await audioCaptureManagerRef.current.start(config.deviceId);
      console.log('Audio capture started');
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      setIsSenderError(true);
      // Show full error message - extract message from Error objects or convert to string
      const errorMessage = error instanceof Error 
        ? error.message 
        : error instanceof DOMException
        ? `${error.name}: ${error.message}`
        : String(error);
      setSenderError(`Failed to start audio capture: ${errorMessage}`);
      resetErrorTimeout();
      
      // Automatically disable audio in main process since it failed to start
      try {
        await window.electron.ipcRenderer.invoke('set-audio-enabled', false);
        console.log('Audio automatically disabled due to capture failure');
      } catch (disableError) {
        console.error('Failed to disable audio after capture failure:', disableError);
      }
    }
  }, [setIsSenderError, setSenderError, resetErrorTimeout]);

  // Handler for audio:disable from main process
  const handleAudioDisable = useCallback((): void => {
    console.log('Received audio:disable from main process');
    
    if (audioCaptureManagerRef.current) {
      audioCaptureManagerRef.current.stop();
      console.log('Audio capture stopped');
    }
  }, []);

  // Handler for audio:config-update from main process
  const handleAudioConfigUpdate = useCallback((_evt: IpcRendererEvent, config: AudioConfig): void => {
    console.log('Received audio:config-update from main process', config);
    
    // Update AudioCaptureManager if it exists
    if (audioCaptureManagerRef.current) {
      audioCaptureManagerRef.current.updateConfig(config);
      console.log('AudioCaptureManager configuration updated');
    }
    
    // Update lightingPrefsAtom so preview components can react to color changes
    // Merge with existing audioConfig to preserve fields like sampleRate and updateIntervalMs
    setPrefs(prev => ({
      ...prev,
      audioConfig: {
        ...prev.audioConfig,
        // Update all compatible fields from config (exclude deviceId which has type mismatch)
        fftSize: config.fftSize,
        sensitivity: config.sensitivity,
        beatDetection: config.beatDetection,
        frequencyRanges: config.frequencyRanges,
        smoothing: config.smoothing,
        colorMapping: config.colorMapping,
        enabled: config.enabled,
        // Preserve fields that exist in frontend but not in backend config
        sampleRate: prev.audioConfig?.sampleRate,
        updateIntervalMs: prev.audioConfig?.updateIntervalMs,
        // Preserve deviceId from frontend (number) rather than backend (string)
        deviceId: prev.audioConfig?.deviceId
      } as LightingPreferences['audioConfig']
    }));
    console.log('Lighting preferences updated with new audio config');
  }, [setPrefs]);

  const toggleDarkMode = (): void => {
    setIsDarkMode((prevMode) => !prevMode);
    document.documentElement.classList.toggle('dark', !isDarkMode); 
  };

  // Load light library effect
  useEffect(() => {
    const loadLightLibrary = async (): Promise<void> => {
      try {
        const data: DmxFixture[] = await window.electron.ipcRenderer.invoke('get-light-library');
        setLightLibrary(data || []);
        setIsLibraryLoaded(true); 
      } catch (error) {
        console.error("Failed to load light library:", error);
      }
    };

    loadLightLibrary();
  }, [setLightLibrary, setIsLibraryLoaded]);

  // Load my lights effect
  useEffect(() => {
    const loadMyLights = async (): Promise<void> => {
      try {
        const data: DmxFixture[] = await window.electron.ipcRenderer.invoke('get-my-lights');
        setMyLights(data || []);
        setIsLibraryLoaded(true); 
      } catch (error) {
        console.error("Failed to load my lights:", error);
      }
    };

    loadMyLights();
  }, [setMyLights, setIsLibraryLoaded]);

  // Load light layout effect
  useEffect(() => {
    const loadLightLayout = async (): Promise<void> => {
      try {
        const data: LightingConfiguration = await window.electron.ipcRenderer.invoke(
          'get-light-layout',
          'myLayout.json'
        );
        setActiveLightsConfig(data || null);
      } catch (error) {
        console.error("Failed to load light layout:", error);
      }
    };

    loadLightLayout();
  }, [setActiveLightsConfig]);

  // Use a ref to track if it's the initial mount
  const isInitialMount = useRef(true);

  useEffect(() => {
    const fetchAppVersion = async () => {
      if (isInitialMount.current) {
        // Skip saving on the initial mount
        isInitialMount.current = false;
        try {
          const ver = await window.electron.ipcRenderer.invoke('get-app-version');
          setAppVer(ver);
        } catch (error) {
          console.error("Failed to get app version:", error);
        }
        return;
      }
    };

    const getPrefs = async () => {
      const prefs = await window.electron.ipcRenderer.invoke('get-prefs');
      console.log("\n Prefs", prefs);
      
      // Prepare all preference updates in a single object
      const updatedPrefs = { ...prefs };
      
      // Initialize DMX output preferences from saved preferences or default values
      if (!prefs.dmxOutputConfig) {
        // If no saved preferences, initialize with default values (all disabled)
        const defaultConfig = {
          sacnEnabled: false,
          artNetEnabled: false,
          enttecProEnabled: false
        };
        console.log('No saved DMX output config, using defaults:', defaultConfig);
        updatedPrefs.dmxOutputConfig = defaultConfig;
      }

      // Initialize Enttec Pro COM port from saved preferences or default values
      if (prefs.enttecProPort) {
        console.log('Initializing Enttec Pro COM port from saved config:', prefs.enttecProPort);
        setEnttecProComPort(prefs.enttecProPort);
      } else {
        // If no saved preferences, initialize with default value (empty string)
        console.log('No saved Enttec Pro COM port, using default (empty string)');
        setEnttecProComPort('');
      }
      
      // Initialize Stage Kit preferences if not present
      if (!prefs.stageKitPrefs) {
        const defaultStageKitPrefs = {
          yargPriority: 'prefer-for-tracked' as 'prefer-for-tracked' | 'random' | 'never'
        };
        console.log('No saved Stage Kit preferences, using defaults:', defaultStageKitPrefs);
        updatedPrefs.stageKitPrefs = defaultStageKitPrefs;
      }
      
      // Initialize DMX settings preferences if not present
      if (!prefs.dmxSettingsPrefs) {
        const defaultDmxSettingsPrefs = {
          artNetExpanded: false,
          enttecProExpanded: false
        };
        console.log('No saved DMX settings preferences, using defaults:', defaultDmxSettingsPrefs);
        updatedPrefs.dmxSettingsPrefs = defaultDmxSettingsPrefs;
      }
      
      // Set all preferences at once to avoid race conditions
      setPrefs(updatedPrefs);
      
    }

    fetchAppVersion();
    getPrefs();

    // Set up event listener for sender errors
    addIpcListener('sender-error', handleSenderError);

    // Set up event listener for cue state updates
    addIpcListener('cue-state-update', handleCueStateUpdate);

    // Set up event listener for sender start failures
    addIpcListener('sender-start-failed', handleSenderStartFailure);

    // Set up event listeners for audio control
    addIpcListener('audio:enable', handleAudioEnable);
    addIpcListener('audio:disable', handleAudioDisable);
    addIpcListener('audio:config-update', handleAudioConfigUpdate);

    const saveLightLayout = async () => {
      if (activeConfig) {
        try {
          await window.electron.ipcRenderer.invoke('save-light-layout', 'myLayout.json', activeConfig);
        } catch (error) {
          console.error("Failed to save light layout:", error);
        }
      }
    };

    saveLightLayout();

    // Cleanup function
    return () => {
      removeIpcListener('sender-error', handleSenderError);
      removeIpcListener('cue-state-update', handleCueStateUpdate);
      removeIpcListener('sender-start-failed', handleSenderStartFailure);
      removeIpcListener('audio:enable', handleAudioEnable);
      removeIpcListener('audio:disable', handleAudioDisable);
      removeIpcListener('audio:config-update', handleAudioConfigUpdate);
      
      // Cleanup audio capture manager on unmount
      if (audioCaptureManagerRef.current) {
        audioCaptureManagerRef.current.stop();
      }
    };
  }, [activeConfig, handleSenderError, handleCueStateUpdate, handleSenderStartFailure, handleAudioEnable, handleAudioDisable]);

  const renderContent = () => {
    switch (currentPage) {
      case Pages.Status:
        return <Status />;
      case Pages.MyLights:
        return <MyLights />;
      case Pages.LightLayout:
        return <LightsLayout />;
      case Pages.CuePreview:
        return <DmxPreview />;
      case Pages.CueSimulation:
        return <CueSimulation />;
      case Pages.CueSequencer:
      //  return <CueSequencer />;
      case Pages.NetworkDebug:
        return <NetworkDebug />;
      case Pages.Preferences:
        return <Preferences />;
      case Pages.AudioSettings:
        return <AudioSettings />;
      case Pages.About:
        return <About />;
      default:
        return <Status />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-black dark:text-gray-200">
      {/* Left Sidebar */}
      <div className="fixed top-0 left-0 h-full w-[260px] shadow-lg flex flex-col bg-white dark:bg-gray-900 dark:text-white overflow-y-auto">
        {/* Sidebar Header */}
        <div className="h-16 bg-gray-800 dark:bg-gray-950 text-white flex items-center p-2">
          <img
            src={squareLogo}
            alt="Logo"
            className="h-full"
            style={{ width: 'auto', height: '100%', padding: '4px' }}
          />
          <span className="flex-grow text-left ml-2">Photonics {appVer}</span>
        </div>

        {/* Sidebar Content with LeftMenu */}
        <div className="flex-grow p-4 overflow-y-auto">
          <LeftMenu isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-grow ml-[260px] flex flex-col h-screen">
        {/* Main Content Header */}
        <div className="h-16 bg-gray-800 dark:bg-gray-950 text-white flex items-center justify-center z-10">
          <HeaderProjects />
        </div>

        {/* Scrollable Content Area - Using flex-grow to fill available space */}
        <div className="flex-grow overflow-y-auto bg-gray-200 dark:bg-gray-800">
          <SenderErrorIndicator />
          {renderContent()}
        </div>
        
        {/* Status Bar - Positioned at the bottom of the flex container */}
        <StatusBar />
      </div>
    </div>
  );
}

export default App;