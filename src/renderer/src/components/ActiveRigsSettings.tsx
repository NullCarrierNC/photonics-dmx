import React, { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { dmxRigsAtom } from '../atoms';
import { DmxRig } from '../../../photonics-dmx/types';

const ActiveRigsSettings: React.FC = () => {
  const [rigs, setRigs] = useAtom(dmxRigsAtom);
  const [editingRig, setEditingRig] = useState<string | null>(null);
  const [editingUniverse, setEditingUniverse] = useState<number>(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Load rigs on mount
  useEffect(() => {
    const loadRigs = async () => {
      try {
        const loadedRigs = await window.electron.ipcRenderer.invoke('get-dmx-rigs');
        setRigs(loadedRigs || []);
      } catch (error) {
        console.error('Failed to load DMX rigs:', error);
      }
    };
    
    loadRigs();
  }, [setRigs]);

  const handleUniverseChange = async (rigId: string, newUniverse: number) => {
    try {
      const rig = rigs.find(r => r.id === rigId);
      if (rig) {
        const updatedRig: DmxRig = {
          ...rig,
          universe: newUniverse || 1 // Ensure minimum is 1
        };
        await window.electron.ipcRenderer.invoke('save-dmx-rig', updatedRig);
        setRigs(prev => prev.map(r => r.id === rigId ? updatedRig : r));
        setEditingRig(null);
      }
    } catch (error) {
      console.error('Failed to update rig universe:', error);
    }
  };

  const handleActiveToggle = async (rigId: string, newActive: boolean) => {
    try {
      const rig = rigs.find(r => r.id === rigId);
      if (rig) {
        const updatedRig: DmxRig = {
          ...rig,
          active: newActive
        };
        await window.electron.ipcRenderer.invoke('save-dmx-rig', updatedRig);
        setRigs(prev => prev.map(r => r.id === rigId ? updatedRig : r));
      }
    } catch (error) {
      console.error('Failed to update rig active state:', error);
    }
  };

  const handleDelete = async (rigId: string) => {
    try {
      await window.electron.ipcRenderer.invoke('delete-dmx-rig', rigId);
      setRigs(prev => prev.filter(r => r.id !== rigId));
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete rig:', error);
    }
  };

  const startEditingUniverse = (rig: DmxRig) => {
    setEditingRig(rig.id);
    setEditingUniverse(rig.universe || 1);
  };

  const cancelEditing = () => {
    setEditingRig(null);
  };

  const saveUniverse = (rigId: string) => {
    handleUniverseChange(rigId, editingUniverse);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Active Rigs
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Manage your DMX rigs. Only active rigs will output DMX data to their configured universes.
      </p>

      {rigs.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">No rigs configured. Create a rig in Lights Layout.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-200 dark:border-gray-600 rounded-lg">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left p-2 text-sm font-medium text-gray-700 dark:text-gray-300">Rig Name</th>
                <th className="text-left p-2 text-sm font-medium text-gray-700 dark:text-gray-300">Universe</th>
                <th className="text-left p-2 text-sm font-medium text-gray-700 dark:text-gray-300">Active</th>
                <th className="text-left p-2 text-sm font-medium text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rigs.map((rig) => (
                <tr key={rig.id} className="border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="p-2 text-gray-800 dark:text-gray-200">{rig.name}</td>
                  <td className="p-2">
                    {editingRig === rig.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editingUniverse}
                          onChange={(e) => setEditingUniverse(parseInt(e.target.value) || 1)}
                          min={1}
                          className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 w-20 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          autoFocus
                        />
                        <button
                          onClick={() => saveUniverse(rig.id)}
                          className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditingUniverse(rig)}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {rig.universe || 1}
                      </button>
                    )}
                  </td>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={rig.active}
                      onChange={(e) => handleActiveToggle(rig.id, e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                  </td>
                  <td className="p-2">
                    {showDeleteConfirm === rig.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Confirm?</span>
                        <button
                          onClick={() => handleDelete(rig.id)}
                          className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(null)}
                          className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-xs"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(rig.id)}
                        className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ActiveRigsSettings;

