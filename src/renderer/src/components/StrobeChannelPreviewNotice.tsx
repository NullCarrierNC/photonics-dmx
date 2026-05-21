import React from 'react'
import type { LightingConfiguration } from '../../../photonics-dmx/types'
import { getStrobeChannelLightsInConfig } from '../../../photonics-dmx/helpers/strobeChannelRigInspection'

interface StrobeChannelPreviewNoticeProps {
  /** Rig config to inspect. The notice self-gates: it renders null when no strobe-channel lights. */
  lightingConfig: LightingConfiguration | null | undefined
  /** Optional class hook for margin/spacing tweaks at the call site. */
  className?: string
}

/**
 * Info banner shown above a 2D/3D rig preview when the rig contains lights using the new
 * hardware-strobe-channel feature. Those lights appear solid in the preview during strobe cues
 * because the runtime publisher latches RGB to a steady on-phase colour while the (off-canvas)
 * hardware strobe channel chops it. This explains the behaviour up front so users don't think
 * it's a preview bug.
 *
 * Self-gating: returns null when there are no qualifying lights, so callers can always render it
 * unconditionally next to their preview surface.
 */
const StrobeChannelPreviewNotice: React.FC<StrobeChannelPreviewNoticeProps> = ({
  lightingConfig,
  className,
}) => {
  if (!lightingConfig) {
    return null
  }
  const lights = getStrobeChannelLightsInConfig(lightingConfig)
  if (lights.length === 0) {
    return null
  }
  const count = lights.length
  const noun = count === 1 ? 'light has' : 'lights have'
  const pronoun = count === 1 ? 'It will' : 'They will'
  return (
    <div
      role="status"
      className={`p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 text-sm${
        className ? ` ${className}` : ''
      }`}>
      <strong className="font-semibold">Preview note: </strong>
      {count} {noun} a hardware strobe channel configured. {pronoun} appear <strong>solid</strong>{' '}
      in this preview during strobe cues — real DMX hardware will strobe them at the configured
      speed.
    </div>
  )
}

export default StrobeChannelPreviewNotice
