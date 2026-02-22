import React from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { DmxRig } from '../../../../photonics-dmx/types'
import { ConfigStrobeType } from '../../../../photonics-dmx/types'
import { CONFIG } from '../../../../shared/ipcChannels'

interface LightsLayoutRigSectionProps {
  rigs: DmxRig[]
  activeRigId: string | null
  setActiveRigId: (id: string) => void
  rigName: string
  setRigName: (name: string) => void
  onRigsChange: (rigs: DmxRig[]) => void
}

const LightsLayoutRigSection: React.FC<LightsLayoutRigSectionProps> = ({
  rigs,
  activeRigId,
  setActiveRigId,
  rigName,
  setRigName,
  onRigsChange,
}) => (
  <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rig:</label>
        <select
          value={activeRigId || ''}
          onChange={(e) => setActiveRigId(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[200px]">
          {rigs.map((rig) => (
            <option key={rig.id} value={rig.id}>
              {rig.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={async () => {
          const newRig: DmxRig = {
            id: uuidv4(),
            name: `Rig ${rigs.length + 1}`,
            active: true,
            config: {
              numLights: 0,
              lightLayout: { id: 'front', label: 'Front' },
              strobeType: ConfigStrobeType.None,
              frontLights: [],
              backLights: [],
              strobeLights: [],
            },
          }
          try {
            await window.electron.ipcRenderer.invoke(CONFIG.SAVE_DMX_RIG, newRig)
            onRigsChange([...rigs, newRig])
            setActiveRigId(newRig.id)
            setRigName(newRig.name)
          } catch (error) {
            console.error('Failed to create new rig:', error)
          }
        }}
        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm">
        New Rig
      </button>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Name:</label>
        <input
          type="text"
          value={rigName}
          onChange={(e) => setRigName(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[150px]"
          placeholder="Rig Name"
        />
      </div>
    </div>
  </div>
)

export default LightsLayoutRigSection
