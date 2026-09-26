/**
 * Where the beam is pointing at this step of calibration, drawn from the live console buffer.
 *
 * Before the stage references are captured the preview can only show motor space, so it draws the
 * uninverted console values. After that it can place the beam on the stage.
 */
import type { FixtureConfig, RgbMovingHeadLight } from '../../../../photonics-dmx/types'
import { getDmxPreviewLightColorCss } from '../dmxPreviewLightColor'
import { panTiltDmxToSphericalXY, panTiltDmxToWizardMotorSpaceXY } from '../LightsDmxPreview'

/**
 * First step index where the pan and tilt stage references are captured. Until then Home shows a
 * stage-relative preview.
 */
export const STAGE_LABELS_READY_STEP = 6

export function WizardBeamPreview({
  light,
  buffer,
  config,
  step,
}: {
  light: RgbMovingHeadLight
  buffer: Record<number, number>
  config: FixtureConfig
  step: number
}) {
  const ch = light.channels
  const pan = buffer[ch.pan] ?? 0
  const tilt = buffer[ch.tilt] ?? 0

  const stageLabelsReady = step >= STAGE_LABELS_READY_STEP
  const rawConsoleConfig: FixtureConfig = { ...config, invertPan: false, invertTilt: false }
  const { xPct, yPct } =
    step < STAGE_LABELS_READY_STEP
      ? panTiltDmxToWizardMotorSpaceXY(pan, tilt, rawConsoleConfig)
      : panTiltDmxToSphericalXY(pan, tilt, config)

  // Shared with the DMX previews, so added colour channels (white, amber, UV) tint the wizard
  // swatch the same way they tint the stage preview.
  const bg = getDmxPreviewLightColorCss(light, buffer)

  const baseCircleClasses =
    'w-14 h-14 rounded-full flex items-center justify-center text-sm font-semibold shadow-md relative overflow-hidden'

  const labelClass = 'text-[9px] font-medium text-gray-600 dark:text-gray-400 select-none'

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <span className="text-xs text-gray-600 dark:text-gray-400">
        {stageLabelsReady ? 'Beam direction' : 'Motor position'}
      </span>
      <div className="relative flex items-center justify-center w-[5.5rem] h-[5.5rem]">
        {stageLabelsReady ? (
          <>
            <span className={`absolute -top-0.5 left-1/2 -translate-x-1/2 ${labelClass}`}>US</span>
            <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 ${labelClass}`}>DS</span>
            <span className={`absolute left-0 top-1/2 -translate-y-1/2 ${labelClass}`}>SR</span>
            <span className={`absolute right-0 top-1/2 -translate-y-1/2 ${labelClass}`}>SL</span>
          </>
        ) : (
          <span
            className={`absolute -bottom-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap ${labelClass}`}>
            approx. until calibrated
          </span>
        )}
        <div className={baseCircleClasses} style={{ backgroundColor: bg }}>
          <div
            className="absolute rounded-full bg-red-500 z-10"
            style={{
              width: 6,
              height: 6,
              left: `${xPct}%`,
              top: `${yPct}%`,
              transform: 'translate(-50%, -50%)',
              border: '3px solid black',
              boxSizing: 'content-box',
            }}
          />
        </div>
      </div>
    </div>
  )
}
