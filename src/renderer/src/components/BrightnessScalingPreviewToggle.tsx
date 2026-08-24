import React from 'react'
import { useAtom } from 'jotai'
import { previewBrightnessScalingAtom } from '@renderer/atoms'
import type { LightingConfiguration } from '../../../photonics-dmx/types'
import { configHasBrightnessScaling } from '../../../photonics-dmx/helpers/brightnessScaling'

interface BrightnessScalingPreviewToggleProps {
  /** Renders null when no light in the rig is scaled. */
  lightingConfig: LightingConfiguration | null | undefined
  /** Spacing hook for the call site. */
  className?: string
}

/**
 * Checkbox that applies the rig's brightness scaling to the preview surfaces. Off by default, since
 * only the wire carries scaled values and the shift drawn here demonstrates the trim rather than
 * simulating it. Self-gating, so callers can render it unconditionally.
 */
const BrightnessScalingPreviewToggle: React.FC<BrightnessScalingPreviewToggleProps> = ({
  lightingConfig,
  className,
}) => {
  const [enabled, setEnabled] = useAtom(previewBrightnessScalingAtom)

  if (!lightingConfig || !configHasBrightnessScaling(lightingConfig)) {
    return null
  }

  return (
    <label
      className={`flex items-center gap-1.5 select-none${className ? ` ${className}` : ''}`}
      title="Show the colour shift your brightness scaling produces. Hardware always receives the scaled values; the preview normally shows the unscaled colour the cue asked for.">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        className="h-3.5 w-3.5 text-blue-600 border-gray-300 rounded"
      />
      <span className="text-[10px] sm:text-[11px] font-medium leading-tight text-gray-600 dark:text-gray-400">
        Preview Brightness Scaling
      </span>
    </label>
  )
}

export default BrightnessScalingPreviewToggle
