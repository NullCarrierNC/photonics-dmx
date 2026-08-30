import React from 'react'
import { useAtom } from 'jotai'
import type { PostProcessing } from '../../../photonics-dmx/cues/types/cueTypes'
import { isVenueEffectActive } from '../../../photonics-dmx/helpers/venuePostProcessing'
import { postProcessingLabel } from '../utils/postProcessingLabel'
import { lightingPrefsAtom } from '../atoms'

/**
 * The venue post-processing the game is running, as one cell of the cue information grid. While the
 * lights follow it this reports the rig rather than the game, so it takes the keyframe field's chip
 * and greens only for a look that alters the rig. Otherwise it stays plain text.
 */
const PostProcessingStatus: React.FC<{ state: PostProcessing | undefined }> = ({ state }) => {
  const [lightingPrefs] = useAtom(lightingPrefsAtom)
  const lightsFollowPostProcessing = lightingPrefs.venuePostProcessingEnabled ?? true
  const label = postProcessingLabel(state)
  const active = state ? isVenueEffectActive(state) : false
  return (
    <div>
      <p className="font-medium">Post-Processing:</p>
      {lightsFollowPostProcessing ? (
        <div
          className={`p-2 rounded ${active ? 'bg-emerald-200 dark:bg-emerald-900' : 'bg-gray-100 dark:bg-gray-600'}`}>
          <p className={active ? 'font-bold' : undefined}>{label}</p>
        </div>
      ) : (
        <p>{label}</p>
      )}
    </div>
  )
}

export default PostProcessingStatus
