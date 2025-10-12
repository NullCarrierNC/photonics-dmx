import React, { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { lightingPrefsAtom } from '../atoms';

const BrightnessSettings: React.FC = () => {
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom);
  const [localBrightness, setLocalBrightness] = useState({
    low: 40,
    medium: 100,
    high: 180,
    max: 255
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load brightness settings from preferences
  useEffect(() => {
    if (prefs.brightness) {
      setLocalBrightness(prefs.brightness);
      setIsLoaded(true);
    } else if (Object.keys(prefs).length > 0) {
      // If preferences are loaded but brightness is not set, use defaults
      setIsLoaded(true);
    }
  }, [prefs.brightness, prefs]);

  const handleBrightnessChange = async (level: keyof typeof localBrightness, value: number) => {
    const newBrightness = { ...localBrightness, [level]: value };
    setLocalBrightness(newBrightness);

    try {
      await window.electron.ipcRenderer.invoke('save-prefs', {
        brightness: newBrightness
      });
      
      // Update the preferences atom to reflect the change
      setPrefs(prev => ({
        ...prev,
        brightness: newBrightness
      }));
    } catch (error) {
      console.error('Failed to save brightness configuration:', error);
    }
  };

  const handleResetToDefaults = async () => {
    const defaultBrightness = {
      low: 40,
      medium: 100,
      high: 180,
      max: 255
    };
    
    setLocalBrightness(defaultBrightness);

    try {
      await window.electron.ipcRenderer.invoke('save-prefs', {
        brightness: defaultBrightness
      });
      
      // Update the preferences atom to reflect the change
      setPrefs(prev => ({
        ...prev,
        brightness: defaultBrightness
      }));
    } catch (error) {
      console.error('Failed to reset brightness configuration:', error);
    }
  };

  const brightnessLevels = [
    { key: 'low' as const, label: 'Low', description: 'Dim lighting for more subtle effects' },
    { key: 'medium' as const, label: 'Medium', description: 'Standard brightness level, used by most cues' },
    { key: 'high' as const, label: 'High', description: 'Used for emphasis or when two medium colours blend on one light' },
    { key: 'max' as const, label: 'Maximum', description: 'Only used by strobes' }
  ];

  // Show loading state if preferences haven't been loaded yet
  if (!isLoaded) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          DMX Brightness Levels
        </h2>
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500 dark:text-gray-400">Loading brightness settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        DMX Brightness Levels
      </h2>
      
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Configure the DMX master dimmer values for different brightness levels. These values control how bright the lights 
        appear when using low, medium, high, or maximum brightness settings. Most effects will use medium brightness. 
        Max is only used by strobes. Colour blending can cause combined brightness levels to be higher.
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
        If you have powerful lights or a small venue, you may want to decrease the brightness levels so it's not quite so intense. 
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Conversely, if you have cheaper/dimmer lights you can increase the brightness (particularly of the medium level) to make them brighter.
      </p>

      <div className="space-y-1">
        {brightnessLevels.map(({ key, label, description }) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {label}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {description}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem] text-right">
                  {localBrightness[key]}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  / 255
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <input
                type="range"
                min="0"
                max="255"
                value={localBrightness[key]}
                onChange={(e) => handleBrightnessChange(key, parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(localBrightness[key] / 255) * 100}%, #e5e7eb ${(localBrightness[key] / 255) * 100}%, #e5e7eb 100%)`
                }}
              />
              
              <input
                type="number"
                min="0"
                max="255"
                value={localBrightness[key]}
                onChange={(e) => {
                  const value = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
                  handleBrightnessChange(key, value);
                }}
                className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-4 border-t border-gray-200 dark:border-gray-600">
        <button
          onClick={handleResetToDefaults}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
};

export default BrightnessSettings;
