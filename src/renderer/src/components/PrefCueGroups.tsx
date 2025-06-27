import React, { useState, useEffect, useCallback } from 'react';
import { CueGroup } from 'src/photonics-dmx/types';
import { FaChevronDown, FaChevronRight } from 'react-icons/fa';

interface CueInfo {
  id: string;
  yargDescription: string;
  rb3Description: string;
  groupName?: string;
}

interface GroupCueDetails extends CueGroup {
  cues: CueInfo[];
  isExpanded: boolean;
}

const PrefCueGroups: React.FC = () => {
  const [allGroups, setAllGroups] = useState<GroupCueDetails[]>([]);
  const [enabledGroupNames, setEnabledGroupNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      const [all, enabled] = await Promise.all([
        window.electron.ipcRenderer.invoke('get-cue-groups'),
        window.electron.ipcRenderer.invoke('get-enabled-cue-groups')
      ]);
      
      // Transform groups and add expanded state
      const groupsWithDetails: GroupCueDetails[] = all.map((group: CueGroup) => ({
        ...group,
        cues: [],
        isExpanded: false
      }));
      
      setAllGroups(groupsWithDetails);
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

  const handleAccordionToggle = async (groupName: string) => {
    const group = allGroups.find(g => g.name === groupName);
    if (!group) return;

    // If expanding and cues haven't been loaded, fetch them
    if (!group.isExpanded && group.cues.length === 0) {
      try {
        const cueDetails = await window.electron.ipcRenderer.invoke('get-available-cues', groupName);
        
        // Update the group with cue details
        setAllGroups(prevGroups => 
          prevGroups.map(g => 
            g.name === groupName 
              ? { ...g, cues: cueDetails, isExpanded: true }
              : g
          )
        );
        return;
      } catch (error) {
        console.error('Error fetching cue details:', error);
      }
    }

    // Toggle expanded state
    setAllGroups(prevGroups => 
      prevGroups.map(g => 
        g.name === groupName 
          ? { ...g, isExpanded: !g.isExpanded }
          : g
      )
    );
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
          <div key={group.name} className="border rounded-lg border-gray-200 dark:border-gray-600">
            {/* Group Header */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-t-lg">
              <div className="flex items-center flex-1">
                <button
                  onClick={() => handleAccordionToggle(group.name)}
                  className="mr-3 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                >
                  {group.isExpanded ? (
                    <FaChevronDown className="w-4 h-4" />
                  ) : (
                    <FaChevronRight className="w-4 h-4" />
                  )}
                </button>
                <div className="flex-1">
                  <h3 className="font-bold">{group.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{group.description}</p>
                </div>
              </div>
              <input
                type="checkbox"
                className="form-checkbox h-5 w-5 text-blue-600 rounded"
                checked={enabledGroupNames.includes(group.name)}
                disabled={group.name === 'default'}
                onChange={(e) => handleGroupToggle(group.name, e.target.checked)}
              />
            </div>

            {/* Cue Details (Expanded Content) */}
            {group.isExpanded && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                {group.cues.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No cues found in this group.
                  </p>
                ) : (
                  <div className="space-y-1">
                    <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 ">
                      Cues in this group ({group.cues.length}):
                    </h4>
                                                              {group.cues.sort((a, b) => a.id.localeCompare(b.id)).map((cue) => (
                        <div key={cue.id} className="pl-4">
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            <span className="font-medium text-gray-800 dark:text-gray-200">{cue.id}:</span> {cue.yargDescription}
                          </p>
                        </div>
                     ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PrefCueGroups;
