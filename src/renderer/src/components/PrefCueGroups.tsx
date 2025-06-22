import React, { useState, useEffect, useCallback } from 'react';
import { CueGroup } from 'src/photonics-dmx/types';

const PrefCueGroups: React.FC = () => {
  const [allGroups, setAllGroups] = useState<CueGroup[]>([]);
  const [enabledGroupNames, setEnabledGroupNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      const [all, enabled] = await Promise.all([
        window.electron.ipcRenderer.invoke('get-cue-groups'),
        window.electron.ipcRenderer.invoke('get-enabled-cue-groups')
      ]);
      setAllGroups(all);
      setEnabledGroupNames(enabled);
    } catch (e) {
      if (e instanceof Error) {
        console.error("Failed to fetch cue groups:", e.message);
      } else {
        console.error("An unknown error occurred:", e);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleGroupToggle = (groupName: string, isEnabled: boolean) => {
    let updatedEnabledGroups: string[];
  
    if (isEnabled) {
      updatedEnabledGroups = [...new Set([...enabledGroupNames, groupName])];
    } else {
      if (groupName === 'default') return;
      updatedEnabledGroups = enabledGroupNames.filter(name => name !== groupName);
    }
    
    setEnabledGroupNames(updatedEnabledGroups);
    window.electron.ipcRenderer.invoke('set-enabled-cue-groups', updatedEnabledGroups);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2">Enabled Cue Groups</h2>
        <p>Loading cue groups...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2">Enabled Cue Groups</h2>
      <div className="space-y-4">
        {allGroups.map((group) => (
          <div key={group.name} className="flex items-center justify-between p-3 rounded-md bg-gray-100 dark:bg-gray-700">
            <div>
              <h3 className="font-bold">{group.name}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{group.description}</p>
            </div>
            <input
              type="checkbox"
              className="form-checkbox h-5 w-5 text-blue-600 rounded"
              checked={enabledGroupNames.includes(group.name)}
              disabled={group.name === 'default'}
              onChange={(e) => handleGroupToggle(group.name, e.target.checked)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default PrefCueGroups;
