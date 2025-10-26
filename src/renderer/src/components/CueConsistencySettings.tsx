import React, { useState, useEffect, useCallback } from 'react';

const CueConsistencySettings: React.FC = () => {
  const [consistencyWindow, setConsistencyWindow] = useState(60000);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadConsistencyWindow = async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke('get-cue-consistency-window');
        if (result.success) {
          setConsistencyWindow(result.windowMs);
        }
      } catch (error) {
        console.error('Failed to load consistency window:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadConsistencyWindow();
  }, []);

  const handleConsistencyWindowChange = useCallback(async (value: number) => {
    if (isSaving) return;
    
    const newValue = Math.max(0, Math.min(300000, value)); // Clamp to 0-300000
    setConsistencyWindow(newValue);
    
    try {
      setIsSaving(true);
      const result = await window.electron.ipcRenderer.invoke('set-cue-consistency-window', newValue);
      if (result.success) {
        setConsistencyWindow(result.windowMs);
      } else {
        console.error('Failed to save consistency window:', result.error);
        // Revert to previous value on failure
        setConsistencyWindow(consistencyWindow);
      }
    } catch (error) {
      console.error('Failed to save consistency window:', error);
      // Revert to previous value on failure
      setConsistencyWindow(consistencyWindow);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, consistencyWindow]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    // Only update the local state immediately, don't save on every keystroke
    setConsistencyWindow(Math.max(0, Math.min(300000, value)));
  };

  const handleInputBlur = () => {
    // Save when the user finishes editing (loses focus)
    handleConsistencyWindowChange(consistencyWindow);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 dark:border-gray-700">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Cue Consistency Settings
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Prevents rapid randomization changes when the same cue is called within a short time window. 
        This helps maintain visual consistency during rapid cue transitions. I.e. if Cue A from Group B was 
        selected, each time Cue A is called within this window will use the same implementation as the previous call.
      </p>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="consistency-window" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Consistency Window
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="number"
              id="consistency-window"
              min="0"
              max="300000"
              step="100"
              value={consistencyWindow}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isSaving}
              placeholder="60000"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              milliseconds
            </span>
          </div>
          
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Set to 0 to disable consistency throttling. Default is 60000ms (60 seconds). Maximum is 300000ms (5 minutes).
          </p>
        </div>
      </div>
    </div>
  );
};

export default CueConsistencySettings;
