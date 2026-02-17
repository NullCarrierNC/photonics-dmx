import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { rb3eListenerEnabledAtom, yargListenerEnabledAtom, audioListenerEnabledAtom } from '../atoms';
import { useIpcListener } from '../utils/ipcHelpers';
import { CONFIG, CUE, LIGHT, RENDERER_RECEIVE } from '../../../shared/ipcChannels';

interface Rb3ToggleProps {
  disabled?: boolean;
}

const Rb3Toggle = ({ disabled = false }: Rb3ToggleProps) => {
  const [isRb3Enabled, setIsRb3Enabled] = useAtom(rb3eListenerEnabledAtom);
  const [isYargEnabled] = useAtom(yargListenerEnabledAtom);
  const [isAudioEnabled, setIsAudioEnabled] = useAtom(audioListenerEnabledAtom);

  useEffect(() => {
    // Initialize toggle state from system status
    const initializeState = async () => {
      try {
        const response = await window.electron.ipcRenderer.invoke(LIGHT.GET_SYSTEM_STATUS);
        if (response.success) {
          setIsRb3Enabled(response.isRb3Enabled);
        }
      } catch (error) {
        console.error('Error initializing RB3E toggle state:', error);
      }
    };
    
    // Handle controllers restarted event
    const handleControllersRestarted = () => {
      console.log('Controllers restarted, refreshing RB3E toggle state');
      initializeState();
    };
    
    const cleanup = useIpcListener(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, handleControllersRestarted);
    
    // Initialize on mount
    initializeState();
    
    // Return the cleanup function
    return cleanup;
  }, []);

  const handleToggle = () => {
    const newState = !isRb3Enabled;
    setIsRb3Enabled(newState);

    if (newState) {
      window.electron.ipcRenderer.send(CUE.RB3E_LISTENER_ENABLED);
      console.log('RB3E Listener enabled');
      // Disable Audio when RB3E is enabled (mutual exclusion)
      if (isAudioEnabled) {
        setIsAudioEnabled(false);
        window.electron.ipcRenderer.invoke(CONFIG.SET_AUDIO_ENABLED, false);
      }
    } else {
      window.electron.ipcRenderer.send(CUE.RB3E_LISTENER_DISABLED);
      console.log('rb3e Listener disabled');
    }
  };

  return (
    <div className="flex items-center mb-4  w-[190px] justify-between">
      <label className={`mr-4 text-lg font-semibold ${
        (isYargEnabled || isAudioEnabled || disabled) ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'
      }`}>
        Enable RB3E
      </label>
      <button
        onClick={handleToggle}
        disabled={isYargEnabled || isAudioEnabled || disabled}
        className={`w-12 h-6 rounded-full ${
          isRb3Enabled ? 'bg-green-500' : 'bg-gray-400'
        } relative focus:outline-none ${
          (isYargEnabled || isAudioEnabled || disabled) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <div
          className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
            isRb3Enabled ? 'translate-x-6' : 'translate-x-0'
          }`}
        ></div>
      </button>
    </div>
  );
};

export default Rb3Toggle;