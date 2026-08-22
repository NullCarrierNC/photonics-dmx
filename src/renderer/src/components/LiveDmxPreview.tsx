import React from 'react'
import { useAtomValue } from 'jotai'
import { dmxValuesAtom } from '@renderer/atoms'
import type { LightingConfiguration } from '../../../photonics-dmx/types'
import LightsDmxPreview from './LightsDmxPreview'
import LightsDmxChannelsPreview from './LightsDmxChannelsPreview'

/**
 * Live-value wrappers around the DMX preview surfaces. Whatever subscribes to {@link dmxValuesAtom}
 * re-renders on every DMX frame, so the subscription sits here and the host page is left out of it.
 *
 * Surfaces that own their buffer (DMX Console's manual takeover, the calibration wizard) render the
 * underlying components directly with their own values.
 */

export const LiveLightsDmxPreview: React.FC<{ lightingConfig: LightingConfiguration }> = ({
  lightingConfig,
}) => {
  const dmxValues = useAtomValue(dmxValuesAtom)
  return <LightsDmxPreview lightingConfig={lightingConfig} dmxValues={dmxValues} />
}

export const LiveLightsDmxChannelsPreview: React.FC<{ lightingConfig: LightingConfiguration }> = ({
  lightingConfig,
}) => {
  const dmxValues = useAtomValue(dmxValuesAtom)
  return <LightsDmxChannelsPreview lightingConfig={lightingConfig} dmxValues={dmxValues} />
}
