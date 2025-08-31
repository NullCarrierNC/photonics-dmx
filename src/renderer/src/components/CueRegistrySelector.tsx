import React, { useEffect, useState, useCallback, useRef } from 'react';

type CueRegistryType = 'YARG' | 'RB3E';

type CueGroup = {
  id: string;
  name: string;
  description: string;
  cueTypes: string[];
};

interface CueRegistrySelectorProps {
  onRegistryChange: (registryType: CueRegistryType) => void;
  onGroupChange: (groupIds: string[]) => void;
  
  /**
   * When true, the component will initialize with the currently active group selected.
   * Regardless of this setting, all available groups will be shown in the dropdown.
   */
  useActiveGroupsOnly?: boolean;
}

const CueRegistrySelector: React.FC<CueRegistrySelectorProps> = ({
  onRegistryChange,
  onGroupChange
}) => {
  const [registryType, setRegistryType] = useState<CueRegistryType>('YARG');
  const [groups, setGroups] = useState<CueGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const isMounted = useRef(false);
  const isInitialMount = useRef(true);

  // Wrap callback to avoid infinite loops
  const handleGroupChangeCallback = useCallback((groupId: string, allGroups?: CueGroup[]) => {
    // Pass the group ID directly
    onGroupChange([groupId]);
  }, [onGroupChange]);

  useEffect(() => {
    // Fetch available cue groups when component mounts or registry type changes
    const fetchGroups = async () => {
      try {
        console.log('Fetching enabled cue groups...');
        
        // This will either get the user's preference or default to all groups
        const enabledGroupIds = await window.electron.ipcRenderer.invoke('get-enabled-cue-groups');
        
        // We still need the full group objects for their descriptions
        const allGroups = await window.electron.ipcRenderer.invoke('get-cue-groups');
        
        const enabledGroups = allGroups.filter((g: CueGroup) => enabledGroupIds.includes(g.id));

        console.log(`Enabled groups:`, enabledGroups);
        setGroups(enabledGroups);
        
        // Handle group selection logic
        if (selectedGroup === '') {
          // If no group is selected and we have groups, auto-select the first one
          if (enabledGroups.length > 0 && isInitialMount.current) {
            const firstGroup = enabledGroups[0];
            setSelectedGroup(firstGroup.id);
            handleGroupChangeCallback(firstGroup.id, enabledGroups);
            isInitialMount.current = false;
          }
        } else if (!enabledGroups.some(g => g.id === selectedGroup) && enabledGroups.length > 0) {
          // If the currently selected group is no longer enabled, fallback to first group
          const firstGroup = enabledGroups[0];
          setSelectedGroup(firstGroup.id);
          handleGroupChangeCallback(firstGroup.id, enabledGroups);
        } else if (isInitialMount.current && enabledGroups.length > 0) {
          // On initial mount with a specific group selected, fire the callback
          handleGroupChangeCallback(selectedGroup, enabledGroups);
          isInitialMount.current = false;
        }

      } catch (error) {
        console.error('Error fetching cue groups:', error);
      }
    };

    if (!isMounted.current) {
      fetchGroups();
      isMounted.current = true;
    } else if (registryType) {
      // Only re-fetch if registry type changed (not on initial mount)
      fetchGroups();
    }
  }, [registryType, handleGroupChangeCallback, selectedGroup]);

  const handleRegistryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = event.target.value as CueRegistryType;
    setRegistryType(newType);
    onRegistryChange(newType);
  };

  const handleGroupChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const groupId = event.target.value;
    setSelectedGroup(groupId);
    handleGroupChangeCallback(groupId, groups);
  };

  return (
    <div className="flex items-center gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Game Type
        </label>
        <select
          value={registryType}
          onChange={handleRegistryChange}
          className="p-2 border rounded dark:bg-gray-700 dark:text-gray-200"
          style={{ width: '200px' }}
        >
          <option value="YARG">YARG</option>
          <option value="RB3E" disabled>RB3E (Uses direct)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Cue Group
        </label>
        <select
          value={selectedGroup}
          onChange={handleGroupChange}
          className="p-2 border rounded dark:bg-gray-700 dark:text-gray-200"
          style={{ width: '200px' }}
        >
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default CueRegistrySelector; 