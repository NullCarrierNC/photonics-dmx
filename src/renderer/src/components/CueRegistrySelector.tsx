import React, { useEffect, useState, useCallback, useRef } from 'react';

type CueRegistryType = 'YARG' | 'RB3E';

type CueGroup = {
  name: string;
  description: string;
  cueTypes: string[];
};

interface CueRegistrySelectorProps {
  onRegistryChange: (registryType: CueRegistryType) => void;
  onGroupChange: (groupNames: string[]) => void;
  
  /**
   * When true, the component will initialize with the currently active group selected.
   * Regardless of this setting, all available groups will be shown in the dropdown.
   */
  useActiveGroupsOnly?: boolean;
}

const CueRegistrySelector: React.FC<CueRegistrySelectorProps> = ({
  onRegistryChange,
  onGroupChange,
  useActiveGroupsOnly = true
}) => {
  const [registryType, setRegistryType] = useState<CueRegistryType>('YARG');
  const [groups, setGroups] = useState<CueGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('default');
  const isMounted = useRef(false);
  const isInitialMount = useRef(true);

  // Wrap callback to avoid infinite loops
  const handleGroupChangeCallback = useCallback((groupName: string) => {
    // Even though we're using a single dropdown, we pass the selected group as an array
    // to support the updated backend that handles multiple groups
    onGroupChange([groupName]);
  }, [onGroupChange]);

  useEffect(() => {
    // Fetch available cue groups when component mounts or registry type changes
    const fetchGroups = async () => {
      try {
        console.log('Fetching cue groups...');
        
        // Always fetch all available groups, regardless of the useActiveGroupsOnly setting
        const availableGroups = await window.electron.ipcRenderer.invoke('get-cue-groups');
        
        console.log(`Available groups:`, availableGroups);
        setGroups(availableGroups);
        
        // If useActiveGroupsOnly is true, we'll also get the currently active group
        // to set as the selected option in the dropdown
        if (useActiveGroupsOnly) {
          try {
            const activeGroups = await window.electron.ipcRenderer.invoke('get-active-cue-groups');
            console.log('Active groups:', activeGroups);
            
            if (activeGroups.length > 0) {
              // If there are active groups, use the first one as the currently selected
              setSelectedGroup(activeGroups[0].name);
              
              // Only trigger callback on initial mount
              if (isInitialMount.current) {
                handleGroupChangeCallback(activeGroups[0].name);
                isInitialMount.current = false;
              }
              return; // Skip the code below since we've already set a selected group
            }
          } catch (err) {
            console.error('Error fetching active groups:', err);
          }
        }
        
        // If we get here, either useActiveGroupsOnly is false or we failed to get active groups
        // Set default group if available, but only call onGroupChange once
        if (availableGroups.length > 0) {
          const defaultGroup = availableGroups.find(g => g.name === 'default') || availableGroups[0];
          console.log('Setting default group:', defaultGroup.name);
          setSelectedGroup(defaultGroup.name);
          
          // Only trigger callback on initial mount
          if (isInitialMount.current) {
            handleGroupChangeCallback(defaultGroup.name);
            isInitialMount.current = false;
          }
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
  }, [registryType, handleGroupChangeCallback, useActiveGroupsOnly]);

  const handleRegistryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = event.target.value as CueRegistryType;
    setRegistryType(newType);
    onRegistryChange(newType);
  };

  const handleGroupChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const groupName = event.target.value;
    setSelectedGroup(groupName);
    handleGroupChangeCallback(groupName);
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
          <option value="RB3E" disabled>RB3E (Coming Soon)</option>
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
            <option key={group.name} value={group.name}>
              {group.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default CueRegistrySelector; 