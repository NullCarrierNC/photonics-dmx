import React from 'react'
import { MdTv } from 'react-icons/md'
import { FaUser } from 'react-icons/fa'
import {
  LightingConfiguration,
  DmxFixture,
  FixtureTypes,
  RgbDmxChannels,
  RgbwDmxChannels,
  RgbMovingHeadDmxChannels,
  RgbwMovingHeadDmxChannels,
  ConfigStrobeType,
} from '../../../photonics-dmx/types'
import { panTiltDmxToSphericalXY } from './lightsDmxPreviewMath'

interface LightsDmxPreviewProps {
  lightingConfig: LightingConfiguration
  dmxValues: Record<number, number>
}

export {
  panTiltDmxToSphericalXY,
  panTiltDmxToWizardMotorSpaceXY,
  type SphericalXYOptions,
} from './lightsDmxPreviewMath'

const previewLegendEdgeClass =
  'pointer-events-none absolute z-[1] text-[10px] sm:text-[11px] font-medium text-gray-600 dark:text-gray-400 leading-tight select-none'

/** Full preview card with stage-direction labels on the outer border (audience perspective). */
const DmxPreviewWithStageLegend: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative mt-4 rounded-lg bg-gray-200 dark:bg-gray-700 px-10 pt-9 pb-9 sm:px-14 sm:pt-10 sm:pb-10">
    <span
      className={`${previewLegendEdgeClass} top-2 sm:top-2.5 left-1/2 -translate-x-1/2 max-w-[min(92%,18rem)] text-center`}>
      Upstage (rear of stage)
    </span>
    <span
      className={`${previewLegendEdgeClass} bottom-2 sm:bottom-2.5 left-1/2 -translate-x-1/2 max-w-[min(92%,18rem)] text-center`}>
      Downstage (toward audience)
    </span>
    <span
      className={`${previewLegendEdgeClass} left-1.5 sm:left-3 top-1/2 -translate-y-1/2 w-[5.25rem] sm:w-[6rem] text-left`}>
      Stage Right
      <span className="block text-[9px] sm:text-[10px] font-normal text-gray-500 dark:text-gray-400">
        (Audience Left)
      </span>
    </span>
    <span
      className={`${previewLegendEdgeClass} right-1.5 sm:right-3 top-1/2 -translate-y-1/2 w-[5.25rem] sm:w-[6rem] text-right`}>
      Stage Left
      <span className="block text-[9px] sm:text-[10px] font-normal text-gray-500 dark:text-gray-400">
        (Audience Right)
      </span>
    </span>
    <div className="relative z-0 flex flex-col items-center">{children}</div>
  </div>
)

const LightsDmxPreview: React.FC<LightsDmxPreviewProps> = ({ lightingConfig, dmxValues }) => {
  const layoutId = lightingConfig.lightLayout?.id ?? 'front'
  const isStacked = layoutId === 'stacked'
  /**
   * Helper function to calculate the light's color based on DMX values.
   */
  const getLightColor = (light: DmxFixture): string => {
    const { channels, fixture } = light

    if (fixture === FixtureTypes.STROBE) {
      // For strobe fixtures, use only masterDimmer for brightness
      const dimmer = dmxValues[channels.masterDimmer] ?? 0
      const scale = dimmer / 255

      // Represent strobe with grayscale color
      return `rgb(${Math.round(255 * scale)}, ${Math.round(255 * scale)}, ${Math.round(255 * scale)})`
    }

    if (
      fixture === FixtureTypes.RGB ||
      fixture === FixtureTypes.RGBS ||
      fixture === FixtureTypes.RGBMH
    ) {
      // For RGB fixtures, cast to RgbDmxChannels and calculate color
      const rgbChannels = channels as RgbDmxChannels
      const red = dmxValues[rgbChannels.red] || 0
      const green = dmxValues[rgbChannels.green] || 0
      const blue = dmxValues[rgbChannels.blue] || 0
      const dimmer = dmxValues[rgbChannels.masterDimmer] ?? 0
      const scale = dimmer / 255

      return `rgb(${Math.round(red * scale)}, ${Math.round(green * scale)}, ${Math.round(blue * scale)})`
    }

    if (
      fixture === FixtureTypes.RGBW ||
      fixture === FixtureTypes.RGBWS ||
      fixture === FixtureTypes.RGBWMH
    ) {
      // For RGBW fixtures, cast to RgbwDmxChannels and calculate color
      const rgbwChannels = channels as RgbwDmxChannels
      const red = dmxValues[rgbwChannels.red] || 0
      const green = dmxValues[rgbwChannels.green] || 0
      const blue = dmxValues[rgbwChannels.blue] || 0
      const white = dmxValues[rgbwChannels.white] || 0
      const dimmer = dmxValues[rgbwChannels.masterDimmer] ?? 0
      const scale = dimmer / 255

      return `rgb(${Math.round((red + white) * scale)}, ${Math.round((green + white) * scale)}, ${Math.round((blue + white) * scale)})`
    }

    // Default to black if fixture type is unknown
    return 'rgb(0, 0, 0)'
  }

  const isMovingHead = (light: DmxFixture): boolean =>
    light.fixture === FixtureTypes.RGBMH || light.fixture === FixtureTypes.RGBWMH

  /**
   * Helper function to render individual light circles (moving heads include pan/tilt dot overlay).
   */
  const renderLightCircle = (light: DmxFixture, index: number) => {
    const baseCircleClasses =
      'w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold shadow-md'

    const subtitleClass = 'text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 select-none'

    if (!isMovingHead(light)) {
      return (
        <div
          key={light.id || `light-${index}`}
          className="flex flex-col items-center mx-2 shrink-0">
          <div className="relative flex items-center justify-center w-20 h-20">
            <div
              className={baseCircleClasses}
              style={{
                backgroundColor: getLightColor(light),
              }}>
              {light.position}
            </div>
          </div>
          <span className={`${subtitleClass} invisible`} aria-hidden>
            upstage / downstage
          </span>
        </div>
      )
    }

    const channels = light.channels as RgbMovingHeadDmxChannels | RgbwMovingHeadDmxChannels
    const pan = dmxValues[channels.pan] ?? 0
    const tilt = dmxValues[channels.tilt] ?? 0
    const { xPct, yPct } = panTiltDmxToSphericalXY(pan, tilt, light.config)

    return (
      <div key={light.id || `light-${index}`} className="flex flex-col items-center mx-2 shrink-0">
        <div className="relative flex items-center justify-center w-20 h-20">
          <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 text-[9px] font-medium text-gray-600 dark:text-gray-400 select-none">
            US
          </span>
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] font-medium text-gray-600 dark:text-gray-400 select-none">
            DS
          </span>
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[9px] font-medium text-gray-600 dark:text-gray-400 select-none">
            SR
          </span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[9px] font-medium text-gray-600 dark:text-gray-400 select-none">
            SL
          </span>
          <div
            className={`${baseCircleClasses} relative overflow-hidden`}
            style={{
              backgroundColor: getLightColor(light),
            }}>
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
            <span className="relative z-0">{light.position}</span>
          </div>
        </div>
      </div>
    )
  }

  /**
   * Helper function to render a row of lights.
   */
  const renderLightRow = (lights: DmxFixture[]) => (
    <div className="flex justify-center gap-x-4 mb-4">
      {lights.map((light, index) => renderLightCircle(light, index))}
    </div>
  )

  /**
   * Helper function to render people icons between front and back rows.
   */
  const renderPeople = () => (
    <div className="flex justify-center mt-1">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="mx-2 ">
          <FaUser size={20} className="text-gray-600 dark:text-gray-300" />
        </div>
      ))}
    </div>
  )

  /**
   * Helper function to render the strobe indicator.
   */
  const renderStrobeIndicator = (light: DmxFixture) => (
    <div
      key={light.id}
      className="w-24 h-8 flex items-center justify-center text-white dark:text-white rounded mt-4 mx-auto"
      style={{
        backgroundColor: getLightColor(light),
      }}>
      Strobe
    </div>
  )

  if (isStacked) {
    return (
      <DmxPreviewWithStageLegend>
        <div className="mb-1">
          <MdTv size={30} className="text-gray-600 dark:text-gray-300" />
        </div>

        {lightingConfig?.frontLights.length > 0 && (
          <div className="w-full flex flex-col items-center">
            <div className="mb-1 text-lg font-semibold text-gray-700 dark:text-gray-300">Top</div>
            {renderLightRow(lightingConfig.frontLights)}
          </div>
        )}

        {lightingConfig?.backLights.length > 0 && (
          <div className="w-full flex flex-col items-center mt-2">
            <div className="mb-1 text-lg font-semibold text-gray-700 dark:text-gray-300">
              Bottom
            </div>
            <div className="flex justify-center gap-x-4 mb-4">
              {[...lightingConfig.backLights]
                .reverse()
                .map((light, index) => renderLightCircle(light, index))}
            </div>
          </div>
        )}

        {lightingConfig?.strobeType === ConfigStrobeType.Dedicated &&
          lightingConfig.strobeLights.map((strobeLight) => renderStrobeIndicator(strobeLight))}

        {((lightingConfig?.frontLights.length ?? 0) > 0 ||
          (lightingConfig?.backLights.length ?? 0) > 0) &&
          renderPeople()}
      </DmxPreviewWithStageLegend>
    )
  }

  return (
    <DmxPreviewWithStageLegend>
      <div className="mb-1">
        <MdTv size={30} className="text-gray-600 dark:text-gray-300" />
      </div>

      {lightingConfig?.frontLights.length > 0 && (
        <div className="w-full flex flex-col items-center">
          <div className="mb-1 text-lg font-semibold text-gray-700 dark:text-gray-300">Front</div>
          {renderLightRow(lightingConfig.frontLights)}
        </div>
      )}

      {lightingConfig?.strobeType === ConfigStrobeType.Dedicated &&
        lightingConfig.strobeLights.map((strobeLight) => renderStrobeIndicator(strobeLight))}

      {lightingConfig?.backLights.length > 0 && renderPeople()}

      {lightingConfig?.backLights.length > 0 && (
        <div className="w-full flex flex-col items-center mt-3">
          <div className="mb-1 text-lg font-semibold text-gray-700 dark:text-gray-300">Back</div>
          <div className="flex justify-center gap-x-4 mb-4">
            {[...lightingConfig.backLights]
              .reverse()
              .map((light, index) => renderLightCircle(light, index))}
          </div>
        </div>
      )}
    </DmxPreviewWithStageLegend>
  )
}

export default LightsDmxPreview
