import React, { useEffect, useState } from 'react';
import { DmxRig } from '../../../photonics-dmx/types';

interface DmxRigSelectorProps {
  selectedRigId: string | null;
  onRigChange: (rigId: string | null) => void;
}

/**
 * Component for selecting a DMX rig to preview.
 * Shows rig name and universe in the dropdown.
 */
const DmxRigSelector: React.FC<DmxRigSelectorProps> = ({
  selectedRigId,
  onRigChange,
}) => {
  const [availableRigs, setAvailableRigs] = useState<DmxRig[]>([]);

  // Load active rigs
  useEffect(() => {
    const loadActiveRigs = async () => {
      try {
        const activeRigs: DmxRig[] = await window.electron.ipcRenderer.invoke('get-active-rigs');
        setAvailableRigs(activeRigs);
        
        // Set default selected rig to the first available rig if none selected
        if (activeRigs.length > 0 && selectedRigId === null) {
          onRigChange(activeRigs[0].id);
        }
      } catch (error) {
        console.error('Failed to load active rigs:', error);
      }
    };
    
    loadActiveRigs();
  }, [selectedRigId, onRigChange]);

  if (availableRigs.length === 0) {
    return (
      <div className="mb-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No active rigs configured. Create and activate a rig in Lights Layout to see DMX preview.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        DMX Rig:
      </label>
      <select
        value={selectedRigId ?? ''}
        onChange={(e) => onRigChange(e.target.value || null)}
        className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[200px]"
      >
        {availableRigs.map((rig) => {
          // Handle universe 0 correctly (0 is a valid universe, only default to 1 if undefined/null)
          const universe = rig.universe !== undefined && rig.universe !== null ? rig.universe : 1;
          return (
            <option key={rig.id} value={rig.id}>
              {rig.name} (Universe {universe})
            </option>
          );
        })}
      </select>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Select a rig to preview its DMX configuration and channel mappings.
      </p>
    </div>
  );
};

export default DmxRigSelector;

