import React, { useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { dmxValuesAtom, previewBrightnessScalingAtom } from '@renderer/atoms'
import type { LightingConfiguration } from '../../../photonics-dmx/types'
import { applyBrightnessScalingToDmxValues } from '../../../photonics-dmx/helpers/brightnessScaling'
import LightsDmxPreview from './LightsDmxPreview'
import LightsDmxChannelsPreview from './LightsDmxChannelsPreview'
import BrightnessScalingPreviewToggle from './BrightnessScalingPreviewToggle'

/**
 * Live-value wrappers around the DMX preview surfaces. Whatever subscribes to {@link dmxValuesAtom}
 * re-renders on every DMX frame, so the subscription sits here and the host page is left out of it.
 *
 * Surfaces that own their buffer (the DMX Console, the calibration wizard) render the underlying
 * components directly, and without the scaling view, since manual output bypasses it on the wire.
 */

/**
 * The frame every live surface draws. Scaling the values here rather than in the colour
 * reconstruction keeps the discs, the 3D stage, the swatch rows and the channel table in agreement.
 */
function useEffectiveDmxValues(lightingConfig: LightingConfiguration): Record<number, number> {
  const dmxValues = useAtomValue(dmxValuesAtom)
  const scalingEnabled = useAtomValue(previewBrightnessScalingAtom)
  return useMemo(
    () =>
      scalingEnabled ? applyBrightnessScalingToDmxValues(lightingConfig, dmxValues) : dmxValues,
    [scalingEnabled, lightingConfig, dmxValues],
  )
}

export const LiveLightsDmxPreview: React.FC<{ lightingConfig: LightingConfiguration }> = ({
  lightingConfig,
}) => {
  const dmxValues = useEffectiveDmxValues(lightingConfig)
  return (
    <LightsDmxPreview
      lightingConfig={lightingConfig}
      dmxValues={dmxValues}
      // In the card rather than on the page, so every host places it identically.
      cornerControls={<BrightnessScalingPreviewToggle lightingConfig={lightingConfig} />}
    />
  )
}

export const LiveLightsDmxChannelsPreview: React.FC<{ lightingConfig: LightingConfiguration }> = ({
  lightingConfig,
}) => {
  const dmxValues = useEffectiveDmxValues(lightingConfig)
  return <LightsDmxChannelsPreview lightingConfig={lightingConfig} dmxValues={dmxValues} />
}
