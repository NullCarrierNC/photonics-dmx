import React, { useState, useEffect } from 'react';

const AudioSensitivityControls: React.FC = () => {
  const [sensitivity, setSensitivity] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await window.electron.ipcRenderer.invoke('get-audio-config');
        setSensitivity(config?.sensitivity ?? 1.0);
      } catch (error) {
        console.error('Failed to load audio sensitivity:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  const handleSensitivityChange = async (value: number) => {
    if (isSaving) return;

    const newValue = Math.max(0.1, Math.min(5.0, value));
    setSensitivity(newValue);

    try {
      setIsSaving(true);
      const result = await window.electron.ipcRenderer.invoke('save-audio-config', {
        sensitivity: newValue
      });
      if (!result.success) {
        console.error('Failed to save audio sensitivity:', result.error);
        // Revert on failure
        const config = await window.electron.ipcRenderer.invoke('get-audio-config');
        setSensitivity(config?.sensitivity ?? 1.0);
      }
    } catch (error) {
      console.error('Failed to save audio sensitivity:', error);
      // Revert on failure
      const config = await window.electron.ipcRenderer.invoke('get-audio-config');
      setSensitivity(config?.sensitivity ?? 1.0);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setSensitivity(value);
  };

  const handleSliderBlur = () => {
    handleSensitivityChange(sensitivity);
  };

  return (
    <div>
      <label htmlFor="audio-sensitivity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Sensitivity
      </label>
      <div className="flex items-center space-x-4">
        <input
          type="range"
          id="audio-sensitivity"
          min="0.1"
          max="5.0"
          step="0.1"
          value={sensitivity}
          onChange={handleSliderChange}
          onMouseUp={handleSliderBlur}
          disabled={isLoading || isSaving}
          className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
        <input
          type="number"
          min="0.1"
          max="5.0"
          step="0.1"
          value={sensitivity}
          onChange={(e) => {
            const value = parseFloat(e.target.value) || 0.1;
            setSensitivity(Math.max(0.1, Math.min(5.0, value)));
          }}
          onBlur={() => handleSensitivityChange(sensitivity)}
          disabled={isLoading || isSaving}
          className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
        Adjust the sensitivity/gain multiplier for audio input. Higher values make the lights more reactive to audio. Range: 0.1-5.0 (default: 1.0)
      </p>
    </div>
  );
};

export default AudioSensitivityControls;

