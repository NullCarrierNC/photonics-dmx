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
        console.log('Fetching enabled cue groups...');
        
        // This will either get the user's preference or default to all groups
        const enabledGroupNames = await window.electron.ipcRenderer.invoke('get-enabled-cue-groups');
        
        // We still need the full group objects for their descriptions
        const allGroups = await window.electron.ipcRenderer.invoke('get-cue-groups');
        
        const enabledGroups = allGroups.filter((g: CueGroup) => enabledGroupNames.includes(g.name));

        console.log(`Enabled groups:`, enabledGroups);
        setGroups(enabledGroups);
        
        // If the currently selected group is no longer enabled, select the first available one
        if (!enabledGroupNames.includes(selectedGroup) && enabledGroups.length > 0) {
          const newSelected = enabledGroups[0].name;
          setSelectedGroup(newSelected);
          handleGroupChangeCallback(newSelected);
        } else if (isInitialMount.current && enabledGroups.length > 0) {
          // On initial mount, ensure the callback is fired with the default active group
          const defaultGroup = enabledGroups.find(g => g.name === 'default') || enabledGroups[0];
          setSelectedGroup(defaultGroup.name);
          handleGroupChangeCallback(defaultGroup.name);
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