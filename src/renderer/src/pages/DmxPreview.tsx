import React, { useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { senderIpcEnabledAtom } from '@renderer/atoms'
import LightsDmxPreview from '@renderer/components/LightsDmxPreview'
import LightsDmxChannelsPreview from '@renderer/components/LightsDmxChannelsPreview'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { CONFIG, LIGHT, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import DmxSettingsAccordion from '@renderer/components/PhotonicsInputOutputToggles'
import CuePreview from '@renderer/components/CuePreview'
import ActiveGroupsSelector from '@renderer/components/ActiveCueGroupsSelector'
import DmxRigSelector from '@renderer/components/DmxRigSelector'
import { DmxRig, LightingConfiguration } from '../../../photonics-dmx/types'

const DmxPreview: React.FC = () => {
  const [_isIpcEnabled] = useAtom(senderIpcEnabledAtom)
  // Store DMX values per universe: Map<universe, Record<channel, value>>
  const [dmxValuesByUniverse, setDmxValuesByUniverse] = useState<
    Map<number, Record<number, number>>
  >(new Map())
  const [selectedRigId, setSelectedRigId] = useState<string | null>(null)
  const [selectedRig, setSelectedRig] = useState<DmxRig | null>(null)
  const [rigConfig, setRigConfig] = useState<LightingConfiguration | null>(null)

  // Load rig configuration when rig selection changes
  useEffect(() => {
    const loadRigConfig = async () => {
      if (!selectedRigId) {
        setSelectedRig(null)
        setRigConfig(null)
        return
      }

      try {
        const rig: DmxRig = await window.electron.ipcRenderer.invoke(
          CONFIG.GET_DMX_RIG,
          selectedRigId,
        )
        if (rig) {
          setSelectedRig(rig)
          setRigConfig(rig.config)

          // Automatically enable IPC sender for preview functionality when rig is selected
          window.electron.ipcRenderer.send(LIGHT.SENDER_ENABLE, { sender: 'ipc' })
          console.log('IPC sender enabled for preview functionality')
        }
      } catch (error) {
        console.error('Failed to load rig configuration:', error)
        setSelectedRig(null)
        setRigConfig(null)
      }
    }

    loadRigConfig()
  }, [selectedRigId])

  // Listen for IPC messages to receive DMX values with universe information.
  useEffect(() => {
    const handleDmxValues = (
      _: unknown,
      data: { universeBuffer: Record<number, number>; universe: number } | Record<number, number>,
    ) => {
      // Handle both old format (just Record<number, number>) and new format (with universe)
      let universeBuffer: Record<number, number>
      let universe: number

      if (
        'universeBuffer' in data &&
        'universe' in data &&
        typeof data === 'object' &&
        data !== null
      ) {
        // New format with universe
        universeBuffer = data.universeBuffer || {}
        universe = data.universe
      } else {
        // Old format - just the buffer (backward compatibility)
        universeBuffer = data as Record<number, number>
        // Default to universe 1 for old format
        universe = 1
      }

      // Update the universe-specific buffer
      setDmxValuesByUniverse((prev) => {
        const newMap = new Map(prev)
        newMap.set(universe, universeBuffer)
        return newMap
      })
    }
    type DmxPayload =
      | { universeBuffer: Record<number, number>; universe: number }
      | Record<number, number>
    addIpcListener<DmxPayload>(RENDERER_RECEIVE.DMX_VALUES, handleDmxValues)

    return () => {
      removeIpcListener(RENDERER_RECEIVE.DMX_VALUES, handleDmxValues)
    }
  }, []) // Empty deps - we use functional updates for state

  // Get DMX values for the selected rig's universe
  // Handle universe 0 correctly (0 is a valid universe, only default to 1 if undefined/null)
  const rigUniverse =
    selectedRig?.universe !== undefined && selectedRig?.universe !== null ? selectedRig.universe : 1
  const dmxValues = selectedRig !== null ? dmxValuesByUniverse.get(rigUniverse) || {} : {}

  return (
    <div className="p-6 w-full mx-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">DMX Preview</h1>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        The DMX Preview allows you to see what your lighting rig should be doing. The preview uses
        the actual DMX channel data being
        <em> sent</em> by Photonics This is useful for debugging/testing your setup and confirming
        the configuration of your lights is correct.
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        <strong>Note:</strong> It does not monitor for sACN/ArtNet data on the network.
      </p>

      <DmxSettingsAccordion startOpen={true} />
      <ActiveGroupsSelector />

      {/* Rig Selector */}
      <DmxRigSelector selectedRigId={selectedRigId} onRigChange={setSelectedRigId} />

      <hr className="my-6 border-gray-200 dark:border-gray-600" />

      {selectedRig !== null && rigConfig !== null && (
        <>
          <LightsDmxPreview lightingConfig={rigConfig} dmxValues={dmxValues} />
          <CuePreview />
          <LightsDmxChannelsPreview lightingConfig={rigConfig} dmxValues={dmxValues} />
        </>
      )}
      {selectedRig === null && (
        <p className="text-gray-600 dark:text-gray-400 mt-4">
          Please select a rig to preview DMX data.
        </p>
      )}
    </div>
  )
}

export default DmxPreview
