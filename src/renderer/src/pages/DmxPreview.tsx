import React from 'react'
import { useAtom } from 'jotai'
import { lightingPrefsAtom, previewRigIdAtom } from '@renderer/atoms'
import { useActivePreviewRigs } from '@renderer/hooks/useActivePreviewRigs'
import {
  LiveLightsDmxPreview,
  LiveLightsDmxChannelsPreview,
} from '@renderer/components/LiveDmxPreview'
import StrobeChannelPreviewNotice from '@renderer/components/StrobeChannelPreviewNotice'
import DmxSettingsAccordion from '@renderer/components/PhotonicsInputOutputToggles'
import CuePreview from '@renderer/components/CuePreview'
import DmxRigSelector from '@renderer/components/DmxRigSelector'
import AudioCueSelectorPanel from '@renderer/components/AudioCueSelectorPanel'
import { useDmxPreview } from '@renderer/hooks/useDmxPreview'
import { useCuePreviewInputPlatform } from '@renderer/hooks/useCuePreviewInputPlatform'

const DmxPreview: React.FC = () => {
  const [prefs] = useAtom(lightingPrefsAtom)
  const advancedModeEnabled = prefs.advancedModeEnabled ?? false
  const [selectedRigId, setSelectedRigId] = useAtom(previewRigIdAtom)
  const activeRigs = useActivePreviewRigs()
  const { selectedRig, rigConfig } = useDmxPreview()
  const platform = useCuePreviewInputPlatform()

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

      {advancedModeEnabled && (
        <DmxRigSelector
          rigs={activeRigs}
          selectedRigId={selectedRigId}
          onRigChange={setSelectedRigId}
        />
      )}

      <hr className="my-6 border-gray-200 dark:border-gray-600" />

      {/* Audio Reactive Cue Selector - shown when Audio is the active input platform */}
      {platform === 'AUDIO' && <AudioCueSelectorPanel className="mb-4" />}

      {selectedRig !== null && rigConfig !== null && (
        <>
          <StrobeChannelPreviewNotice lightingConfig={rigConfig} className="mb-3" />
          <LiveLightsDmxPreview lightingConfig={rigConfig} />
          <CuePreview
            className={platform === 'AUDIO' ? 'mt-6' : ''}
            showAudioQuickControls={platform === 'AUDIO'}
          />
          <LiveLightsDmxChannelsPreview lightingConfig={rigConfig} />
        </>
      )}
      {selectedRig === null && (
        <p className="text-gray-600 dark:text-gray-400 mt-4">
          {advancedModeEnabled
            ? 'Please select a rig to preview DMX data.'
            : 'No active rigs configured. Create and activate a rig in Lights Layout to see DMX preview.'}
        </p>
      )}
    </div>
  )
}

export default DmxPreview
