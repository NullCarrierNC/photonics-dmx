import React from 'react';
import { useAtom } from 'jotai';
import { lightingPrefsAtom } from '../atoms';

const StageKitModeSettings: React.FC = () => {
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom);





  const handlePriorityChange = async (priority: 'prefer-for-tracked' | 'random' ) => {
    const newStageKitPrefs = {
      yargPriority: priority
    };
    
    // Update the global preferences
    setPrefs(prev => ({
      ...prev,
      stageKitPrefs: newStageKitPrefs
    }));
    
    try {
      // Save to backend using the specific stage kit priority handler
      await window.electron.ipcRenderer.invoke('set-stage-kit-priority', priority);
      console.log(`[StageKitModeSettings] Stage Kit priority changed to: ${priority}`);
    } catch (error) {
      console.error('Failed to save Stage Kit priority:', error);
    }
  };

  const priorityOptions = [
    { value: 'prefer-for-tracked', label: 'Prefer for tracked' },
    { value: 'random', label: 'Random' },
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Stage Kit Mode
      </h2>
      
      {/* YARG Configuration */}
      <div className="mb-8">
        <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">YARG</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Stage Kit mode re-creates the original Rock Band Stage Kit lighting effects mapped to your DMX lights. It gives the most authentic 
            RB3 style experience, but doesn't take advantange of the full capabilities of DMX lighting and animations. 
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            If you select <em>Prefer for Tracked</em> then Photonics will only use the Stage Kit cues if the song has tracked lighting data. 
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            If you select <em>Random</em> then Photonics will randomly choose from the enabled cue groups. 
            To maintain a consistent visual experience, Photonics will only change a specific cue implementation after the cue consistency window has passed.
        </p>

        <div className="space-y-3">
          <div>
            <label htmlFor="stagekit-priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Stage Kit Priority
            </label>
            <select
              id="stagekit-priority"
              value={prefs.stageKitPrefs?.yargPriority || 'prefer-for-tracked'}
              onChange={(e) => handlePriorityChange(e.target.value as 'prefer-for-tracked' | 'random')}
              className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {getPriorityDescription(prefs.stageKitPrefs?.yargPriority || 'prefer-for-tracked')}
            </p>
          </div>
        </div>
      </div>

      {/* Rock Band 3 Enhanced */}
      <div>
        <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">Rock Band 3 Enhanced</h3>
        <div className=" ">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Due to how the RB3E networking works, Photonics doesn't use the cue system like it does with YARG. Instead it uses the 
            provided LED lighting data diirectly to re-create the original Stage Kit lighting effects. This is essentially the same as using 
            YARG in Stage Kit mode.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            If you have 8 lights then each of the 8 LED positions will be mapped to a single DMX light (1-8). If two or more colours are set to the 
            same LED position then the resulting colour and brightness will be a blend of the LED values assigned to that position. E.g. Green and Blue 
            on LED's 1 with result in Cyan on DMX light 1.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            If you have 4 lights then the Stage Kit LED colours assigned to lights 5-8 will be mapped 5-&gt;1, 6-&gt;2, 7-&gt;3, 8-&gt;4. The resulting colour 
            and brightness will be a blend of the LED values assigned to 1 and 5, 2 and 6, etc. This means effects set to LEDs 1-4 and 5-8 will get blended together 
            on DMX lights 1-4.
          </p>
        </div>
      </div>
    </div>
  );
};

export default StageKitModeSettings;
