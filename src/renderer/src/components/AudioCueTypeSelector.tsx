import React, { useState, useEffect, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { audioConfigAtom } from '../atoms';

interface AudioCueTypeOption {
  value: string;
  label: string;
}

const AudioCueTypeSelector: React.FC = () => {
  const audioConfig = useAtomValue(audioConfigAtom);
  const [isSaving, setIsSaving] = useState(false);
  const [availableCueTypes, setAvailableCueTypes] = useState<AudioCueTypeOption[]>([
    { value: 'BasicLayered', label: 'Basic Layered' }
  ]);
  const [isLoadingCues, setIsLoadingCues] = useState(true);

  // Fetch available cue types from registry
  const fetchAvailableCueTypes = useCallback(async () => {
    try {
      setIsLoadingCues(true);
      const cues = await window.electron.ipcRenderer.invoke('get-available-audio-cues');
      if (Array.isArray(cues) && cues.length > 0) {
        setAvailableCueTypes(cues);
      }
    } catch (error) {
      console.error('Failed to fetch available audio cue types:', error);
    } finally {
      setIsLoadingCues(false);
    }
  }, []);

  useEffect(() => {
    fetchAvailableCueTypes();
  }, [fetchAvailableCueTypes]);

  const handleCueTypeChange = async (value: string) => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const updatedConfig = {
        ...audioConfig,
        activeCueType: value
      };

      await window.electron.ipcRenderer.invoke('save-audio-config', updatedConfig);
      
      // Atom will be updated via audio:config-update IPC message from backend
    } catch (error) {
      console.error('Failed to save audio cue type:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Load current cue type on mount (config should already be loaded, but ensure it's set)
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await window.electron.ipcRenderer.invoke('get-audio-config');
        // Config will be updated via audio:config-update IPC message
        if (!config?.activeCueType) {
          // If no cue type is set, default to BasicLayered
          await window.electron.ipcRenderer.invoke('save-audio-config', {
            ...config,
            activeCueType: 'BasicLayered'
          });
        }
      } catch (error) {
        console.error('Failed to load audio config:', error);
      }
    };

    loadConfig();
  }, []);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Audio Cue Type
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Select the visual effect style for audio-reactive lighting. Each cue type applies frequency ranges differently.
          </p>
        </div>
      </div>
      
      <select
        value={audioConfig?.activeCueType || 'BasicLayered'}
        onChange={(e) => handleCueTypeChange(e.target.value)}
        disabled={isSaving || isLoadingCues}
        className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {isLoadingCues ? (
          <option>Loading cue types...</option>
        ) : (
          availableCueTypes.map(cueType => (
            <option key={cueType.value} value={cueType.value}>
              {cueType.label}
            </option>
          ))
        )}
      </select>

      {isSaving && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Saving...</p>
      )}
    </div>
  );
};

export default AudioCueTypeSelector;

