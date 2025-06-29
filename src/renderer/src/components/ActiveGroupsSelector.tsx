import  { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';

interface CueGroup {
  id: string;
  name: string;
  description: string;
  cueTypes: string[];
}

interface ActiveGroupsSelectorProps {
  className?: string;
}

export interface ActiveGroupsSelectorRef {
  refreshActiveGroups: () => Promise<void>;
}

const ActiveGroupsSelector = forwardRef<ActiveGroupsSelectorRef, ActiveGroupsSelectorProps>(
  ({ className = '' }, ref) => {
    const [enabledGroups, setEnabledGroups] = useState<CueGroup[]>([]);
    const [activeGroupIds, setActiveGroupIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchActiveGroups = useCallback(async () => {
      try {
        const active = await window.electron.ipcRenderer.invoke('get-active-cue-groups');
        const newActiveGroupIds = active.map((g: CueGroup) => g.id);
        
        setActiveGroupIds(prevActive => {
          // Only update if actually different to avoid unnecessary re-renders
          if (JSON.stringify(prevActive.sort()) !== JSON.stringify(newActiveGroupIds.sort())) {
            return newActiveGroupIds;
          }
          return prevActive;
        });
      } catch (error) {
        console.error('Error fetching active groups:', error);
      }
    }, []);

    const fetchData = useCallback(async () => {
      try {
        setLoading(true);
        const [enabled, active] = await Promise.all([
          window.electron.ipcRenderer.invoke('get-enabled-cue-groups'),
          window.electron.ipcRenderer.invoke('get-active-cue-groups')
        ]);
        
        // Get full group details for enabled groups
        const enabledGroupIds = Array.isArray(enabled) ? enabled : [];
        const allGroups = await window.electron.ipcRenderer.invoke('get-cue-groups');
        const enabledGroupDetails = allGroups.filter((g: CueGroup) => enabledGroupIds.includes(g.id));
        
        setEnabledGroups(enabledGroupDetails);
        setActiveGroupIds(active.map((g: CueGroup) => g.id));
      } catch (error) {
        console.error('Error fetching group data:', error);
      } finally {
        setLoading(false);
      }
    }, []);

    // Expose refresh method to parent component
    useImperativeHandle(ref, () => ({
      refreshActiveGroups: fetchActiveGroups
    }), [fetchActiveGroups]);

    useEffect(() => {
      fetchData();
    }, [fetchData]);

    const handleGroupToggle = async (groupId: string, isActive: boolean) => {
      try {
        let updatedActiveGroupIds: string[];
        
        if (isActive) {
          // Add to active groups
          updatedActiveGroupIds = [...new Set([...activeGroupIds, groupId])];
        } else {
          // Remove from active groups
          updatedActiveGroupIds = activeGroupIds.filter(id => id !== groupId);
        }
        
        // Update backend
        const result = await window.electron.ipcRenderer.invoke('set-active-cue-groups', updatedActiveGroupIds);
        
        if (result.success) {
          setActiveGroupIds(updatedActiveGroupIds);
        } else {
          console.error('Failed to update active groups:', result.error);
          // Could show a toast notification here
        }
      } catch (error) {
        console.error('Error updating active groups:', error);
      }
    };

    if (loading) {
      return (
        <div className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg ${className}`}>
          <div className="animate-pulse">
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded mb-2"></div>
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
          </div>
        </div>
      );
    }

    if (enabledGroups.length === 0) {
      return (
        <div className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg ${className}`}>
          <p className="text-gray-600 dark:text-gray-400">No enabled cue groups found.</p>
        </div>
      );
    }

    return (
      <div className={`bg-white dark:bg-gray-800  ${className}`}>
        <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-gray-100 ">
          Active Cue Groups
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          By default all enabled groups are active. To disable a group entirely, disable it in the Preferences menu.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          If the active groups are missing a cue the system will fallback to the Default group, even if it is disabled.
        </p>
        
        <div className="space-y-0">
          {enabledGroups.map((group) => (
            <div
              key={group.name}
              className="flex items-center justify-between pl-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                <input
                  type="checkbox"
                  className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500 dark:focus:ring-blue-600"
                  checked={activeGroupIds.includes(group.id)}
                  onChange={(e) => handleGroupToggle(group.id, e.target.checked)}
                />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {group.name}
                  </span>
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    ({group.cueTypes.length} cues)
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {activeGroupIds.length === 0 && (
          <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
            <p className="text-yellow-800 dark:text-yellow-200">
              <strong>Warning:</strong> No active groups selected. Cue resolution will only use the default group as fallback.
            </p>
          </div>
        )}
      </div>
    );
  }
);

ActiveGroupsSelector.displayName = 'ActiveGroupsSelector';

export default ActiveGroupsSelector; 