import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { yargListenerEnabledAtom, rb3eListenerEnabledAtom, audioListenerEnabledAtom } from '../atoms';
import { useIpcListener } from '../utils/ipcHelpers';
import { CONFIG, CUE, RENDERER_RECEIVE } from '../../../shared/ipcChannels';

interface AudioToggleProps {
  disabled?: boolean;
}

const AudioToggle = ({ disabled = false }: AudioToggleProps) => {
  const [isAudioEnabled, setIsAudioEnabled] = useAtom(audioListenerEnabledAtom);
  const [isYargEnabled, setIsYargEnabled] = useAtom(yargListenerEnabledAtom);
  const [isRb3Enabled, setIsRb3Enabled] = useAtom(rb3eListenerEnabledAtom);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Initialize toggle state from runtime enabled state (not config)
    const initializeState = async () => {
      try {
        const enabled = await window.electron.ipcRenderer.invoke(CONFIG.GET_AUDIO_ENABLED);
        setIsAudioEnabled(enabled);
      } catch (error) {
        console.error('Error initializing Audio toggle state:', error);
      }
    };
    
    // Handle controllers restarted event - audio is disabled on restart
    const handleControllersRestarted = () => {
      console.log('Controllers restarted, audio disabled');
      setIsAudioEnabled(false);
    };
    
    const cleanup = useIpcListener(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, handleControllersRestarted);
    
    // Initialize on mount
    initializeState();

    return cleanup;
  }, [setIsAudioEnabled]);

  const handleToggle = async () => {
    if (isSaving || disabled) return;

    const newState = !isAudioEnabled;
    setIsAudioEnabled(newState);

    try {
      setIsSaving(true);
      const result = await window.electron.ipcRenderer.invoke(CONFIG.SET_AUDIO_ENABLED, newState);
      if (!result.success) {
        console.error('Failed to save audio enabled state:', result.error);
        setIsAudioEnabled(!newState); // Revert on failure
      } else {
        // Disable YARG/RB3E when audio is enabled (mutual exclusion)
        if (newState) {
          if (isYargEnabled) {
            setIsYargEnabled(false);
            window.electron.ipcRenderer.send(CUE.YARG_LISTENER_DISABLED);
          }
          if (isRb3Enabled) {
            setIsRb3Enabled(false);
            window.electron.ipcRenderer.send(CUE.RB3E_LISTENER_DISABLED);
          }
        }
      }
    } catch (error) {
      console.error('Failed to save audio enabled state:', error);
      setIsAudioEnabled(!newState); // Revert on failure
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center mb-4 w-[190px] justify-between">
      <label className={`mr-4 text-lg font-semibold ${
        (isYargEnabled || isRb3Enabled || disabled) ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'
      }`}>
        Enable Audio
      </label>
      <button
        onClick={handleToggle}
        disabled={isYargEnabled || isRb3Enabled || disabled || isSaving}
        className={`w-12 h-6 rounded-full ${
          isAudioEnabled ? 'bg-green-500' : 'bg-gray-400'
        } relative focus:outline-none ${
          (isYargEnabled || isRb3Enabled || disabled || isSaving) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <div
          className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
            isAudioEnabled ? 'translate-x-6' : 'translate-x-0'
          }`}
        ></div>
      </button>
    </div>
  );
};

export default AudioToggle;

