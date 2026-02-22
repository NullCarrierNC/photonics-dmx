import React from 'react'
import { useAtom } from 'jotai'
import { previewRigIdAtom } from '@renderer/atoms'
import LightsDmxPreview from '@renderer/components/LightsDmxPreview'
import LightsDmxChannelsPreview from '@renderer/components/LightsDmxChannelsPreview'
import DmxSettingsAccordion from '@renderer/components/PhotonicsInputOutputToggles'
import CuePreview from '@renderer/components/CuePreview'
import ActiveGroupsSelector from '@renderer/components/ActiveCueGroupsSelector'
import DmxRigSelector from '@renderer/components/DmxRigSelector'
import { useDmxPreview } from '@renderer/hooks/useDmxPreview'

const DmxPreview: React.FC = () => {
  const [selectedRigId, setSelectedRigId] = useAtom(previewRigIdAtom)
  const { selectedRig, rigConfig, dmxValues } = useDmxPreview()

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
