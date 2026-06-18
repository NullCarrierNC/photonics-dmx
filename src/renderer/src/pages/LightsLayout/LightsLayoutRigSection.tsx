import React from 'react'
import type { DmxRig } from '../../../../photonics-dmx/types'
import { ConfigStrobeType } from '../../../../photonics-dmx/types'
import { saveDmxRig } from '../../ipcApi'
import { createLogger } from '../../../../shared/logger'
const log = createLogger('LightsLayoutRigSection')

interface LightsLayoutRigSectionProps {
  rigs: DmxRig[]
  activeRigId: string | null
  setActiveRigId: (id: string) => void
  rigName: string
  setRigName: (name: string) => void
  onRigsChange: (rigs: DmxRig[]) => void
  /** Return false to cancel a rig change or new rig when there are unsaved edits. */
  onBeforeDiscardingUnsaved: () => Promise<boolean>
  /** Clone the selected rig (handles its own unsaved-changes guard). */
  onDuplicate: () => void
  /** Delete the selected rig (shows its own confirmation). */
  onDelete: () => void
}

const LightsLayoutRigSection: React.FC<LightsLayoutRigSectionProps> = ({
  rigs,
  activeRigId,
  setActiveRigId,
  rigName,
  setRigName,
  onRigsChange,
  onBeforeDiscardingUnsaved,
  onDuplicate,
  onDelete,
}) => (
  <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rig:</label>
        <select
          value={activeRigId || ''}
          onChange={async (e) => {
            const nextId = e.target.value
            if (!(await onBeforeDiscardingUnsaved())) return
            setActiveRigId(nextId)
          }}
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
          if (!(await onBeforeDiscardingUnsaved())) return
          const newRig: DmxRig = {
            id: crypto.randomUUID(),
            name: `Rig ${rigs.length + 1}`,
            active: true,
            config: {
              numLights: 0,
              lightLayout: { id: 'front', label: 'Front only' },
              strobeType: ConfigStrobeType.None,
              frontLights: [],
              backLights: [],
              strobeLights: [],
            },
          }
          try {
            await saveDmxRig(newRig)
            onRigsChange([...rigs, newRig])
            setActiveRigId(newRig.id)
            setRigName(newRig.name)
          } catch (error) {
            log.error('Failed to create new rig:', error)
          }
        }}
        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm">
        New Rig
      </button>

      <button
        onClick={onDuplicate}
        disabled={!activeRigId}
        title="Create a copy of the selected rig"
        className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
        Duplicate
      </button>

      <button
        onClick={onDelete}
        disabled={rigs.length <= 1}
        title={rigs.length <= 1 ? 'You need at least one rig' : 'Delete the selected rig'}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
        Delete
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
