import React, { useEffect } from 'react';
import { useAtom } from 'jotai';
import { lightingPrefsAtom, stageKitPrefsAtom } from '../atoms';

const StageKitModeSettings: React.FC = () => {
  const [prefs] = useAtom(lightingPrefsAtom);
  const [stageKitPrefs, setStageKitPrefs] = useAtom(stageKitPrefsAtom);

  useEffect(() => {
    if (prefs.stageKitPrefs) {
      setStageKitPrefs(prev => ({
        ...prev,
        ...prefs.stageKitPrefs
      }));
    }
  }, [prefs, setStageKitPrefs]);

  const handlePriorityChange = async (priority: 'prefer-for-tracked' | 'random' | 'never') => {
    const newPrefs = {
      ...stageKitPrefs,
      yargPriority: priority
    };
    
    setStageKitPrefs(newPrefs);
    
    try {
      await window.electron.ipcRenderer.invoke('save-prefs', {
        stageKitPrefs: newPrefs
      });
    } catch (error) {
      console.error('Failed to save Stage Kit preferences:', error);
    }
  };

  const priorityOptions = [
    { value: 'prefer-for-tracked', label: 'Prefer for tracked' },
    { value: 'random', label: 'Random' },
    { value: 'never', label: 'Never' }
  ];

  const getPriorityDescription = (priority: string) => {
    switch (priority) {
      case 'prefer-for-tracked':
        return 'If the song contains a venue track with lighting data default to using the StageKit cues. If YARG is auto-generating missing lighting data, randomly choose from the available cues.';
      case 'random':
        return 'Randomly choose from available cues regardless of whether the song has tracked lighting data.';
      case 'never':
        return 'Never use Stage Kit cues, only use other available lighting options.';
      default:
        return 'Controls when Stage Kit lights are used during YARG gameplay.';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-900 dark:text-white border-gray-200 dark:border-gray-600">
        Stage Kit Mode
      </h2>
      
      {/* YARG Configuration */}
      <div className="mb-8">
        <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">YARG</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Stage Kit mode re-creates the original Rock Band Stage Kit lighting effects mapped to your DMX lights. It gives the most authentic 
            RB3 style experience, but doesn't take advantange of the full capabilities of DMX lighting and animations. 
            It works well if your songs contain the correct lighting venue track. When YARG is auto-generating missing lighting data it 
            can appear very static. 
        </p>
        <div className="space-y-3">
          <div>
            <label htmlFor="stagekit-priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Stage Kit Priority
            </label>
            <select
              id="stagekit-priority"
              value={stageKitPrefs.yargPriority}
              onChange={(e) => handlePriorityChange(e.target.value as 'prefer-for-tracked' | 'random' | 'never')}
              className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {getPriorityDescription(stageKitPrefs.yargPriority)}
            </p>
          </div>
        </div>
      </div>

      {/* Rock Band 3 Enhanced */}
      <div>
        <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">Rock Band 3 Enhanced</h3>
        <div className=" ">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Due to how the RB3E networking works, Photonics doesn't use the cue system like it does with YARG. Instead it uses the 
            provided LED lighting data diirectly to re-create the original Stage Kit lighting effects. This is essentially the same as using 
            YARG in Stage Kit mode.
          </p>
        </div>
      </div>
    </div>
  );
};

export default StageKitModeSettings;
