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
  const [enabledGroupIds, setEnabledGroupIds] = useState<string[]>([]);
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
      setEnabledGroupIds(enabled); 
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
    const group = allGroups.find(g => g.name === groupName);
    if (!group) return;
    
    let updatedEnabledGroupIds: string[];
  
    if (isEnabled) {
      updatedEnabledGroupIds = [...new Set([...enabledGroupIds, group.id])];
    } else {
      updatedEnabledGroupIds = enabledGroupIds.filter(id => id !== group.id);
    }
    
    setEnabledGroupIds(updatedEnabledGroupIds);
    window.electron.ipcRenderer.invoke('set-enabled-cue-groups', updatedEnabledGroupIds);
  };

  const handleAccordionToggle = async (groupName: string) => {
    const group = allGroups.find(g => g.name === groupName);
    if (!group) return;

    // If expanding and cues haven't been loaded, fetch them
    if (!group.isExpanded && group.cues.length === 0) {
      try {
        const cueDetails = await window.electron.ipcRenderer.invoke('get-available-cues', group.id);
        
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
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">Enabled Cue Groups</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Note: Disabling the default group will prevent default cues from being selected during gameplay <em>unless no other groups contain the necessary cue</em>. 
      I.e. if the system cannot find a cue in any other group, it will fallback to use the one from the default group.</p>
      <div className="space-y-4">
        {allGroups.map((group) => (
          <div key={group.name} className="border rounded-lg border-gray-200 dark:border-gray-600">
            {/* Group Header */}
            <div 
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-t-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              onClick={() => handleAccordionToggle(group.name)}
            >
              <div className="flex items-center flex-1">
                <div className="mr-3 text-gray-600 dark:text-gray-400">
                  {group.isExpanded ? (
                    <FaChevronDown className="w-4 h-4" />
                  ) : (
                    <FaChevronRight className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold">{group.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{group.description}</p>
                </div>
              </div>
              <input
                type="checkbox"
                className="form-checkbox h-5 w-5 text-blue-600 rounded"
                checked={enabledGroupIds.includes(group.id)}
                onChange={(e) => handleGroupToggle(group.name, e.target.checked)}
                onClick={(e) => e.stopPropagation()}
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
