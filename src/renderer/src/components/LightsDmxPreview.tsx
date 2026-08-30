import React from 'react'
import { useAtom } from 'jotai'
import { dmxPreviewDimensionAtom } from '@renderer/atoms'
import { MdTv } from 'react-icons/md'
import { FaUser } from 'react-icons/fa'
import {
  LightingConfiguration,
  DmxFixture,
  FixtureTypes,
  RgbMovingHeadDmxChannels,
  ConfigStrobeType,
} from '../../../photonics-dmx/types'
import { panTiltDmxToSphericalXY } from './lightsDmxPreviewMath'
import {
  getDmxPreviewLightColorCss,
  getLightColorChannelBreakdown,
  type ChannelBreakdownEntry,
} from './dmxPreviewLightColor'
import { fixtureDmxValuesEqual } from './fixtureDmxValues'
import LightsDmxPreview3D from './LightsDmxPreview3D'

interface LightsDmxPreviewProps {
  lightingConfig: LightingConfiguration
  dmxValues: Record<number, number>
  /** Controls pinned to the card's bottom-left corner, for anything governing how it draws. */
  cornerControls?: React.ReactNode
}

export {
  panTiltDmxToSphericalXY,
  panTiltDmxToWizardMotorSpaceXY,
  type SphericalXYOptions,
} from './lightsDmxPreviewMath'

const previewLegendEdgeClass =
  'pointer-events-none absolute z-[1] text-[10px] sm:text-[11px] font-medium text-gray-600 dark:text-gray-400 leading-tight select-none'

const PreviewDimensionToggle: React.FC<{
  mode: '2d' | '3d'
  onChange: (mode: '2d' | '3d') => void
}> = ({ mode, onChange }) => (
  <div className="flex justify-center mb-3">
    <div
      className="inline-flex rounded-md border border-gray-400 dark:border-gray-500 p-0.5 bg-gray-100/80 dark:bg-gray-800/80"
      role="group"
      aria-label="Preview dimension">
      <button
        type="button"
        className={`px-3 py-1 text-sm font-medium rounded ${mode === '2d' ? 'bg-white dark:bg-gray-600 shadow' : 'text-gray-600 dark:text-gray-300'}`}
        onClick={() => onChange('2d')}>
        2D
      </button>
      <button
        type="button"
        className={`px-3 py-1 text-sm font-medium rounded ${mode === '3d' ? 'bg-white dark:bg-gray-600 shadow' : 'text-gray-600 dark:text-gray-300'}`}
        onClick={() => onChange('3d')}>
        3D
      </button>
    </div>
  </div>
)

/** Full preview card with optional stage-direction labels on the outer border (audience perspective). */
const DmxPreviewWithStageLegend: React.FC<{
  children: React.ReactNode
  /** When false (e.g. 3D preview), border labels are hidden; stage direction is shown in the 3D scene. */
  showStageLegend?: boolean
  /** Pinned bottom-left, clear of the stage legend and the lights. */
  cornerControls?: React.ReactNode
}> = ({ children, showStageLegend = true, cornerControls }) => (
  <div
    className={`relative mt-4 rounded-lg bg-gray-200 dark:bg-gray-700 ${
      showStageLegend
        ? 'px-10 pt-9 pb-9 sm:px-14 sm:pt-10 sm:pb-10'
        : 'px-3 pt-3 pb-3 sm:px-4 sm:pt-4 sm:pb-4'
    }`}>
    {showStageLegend && (
      <>
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
      </>
    )}
    <div className="relative z-0 flex w-full min-w-0 flex-col items-center">{children}</div>
    {cornerControls && (
      <div className="absolute z-[2] bottom-1.5 left-1.5 sm:bottom-2 sm:left-3">
        {cornerControls}
      </div>
    )}
  </div>
)

/**
 * Per-channel swatches under a light's circle. The circle shows the mixed result, this shows the
 * channels that made it, so a duplicate bank ("Red 2") is distinguishable from the primary it
 * doubles and a plain fixture's primaries are readable without eyeballing the blend. Each dot keeps
 * a ring so a channel driven to 0 still reads as a swatch rather than vanishing into the card.
 */
const LightChannelSwatches: React.FC<{ entries: ChannelBreakdownEntry[] }> = ({ entries }) => (
  <div className="flex flex-wrap justify-center gap-1 max-w-[5.5rem] mt-0.5">
    {entries.map((entry) => (
      <span
        key={entry.label}
        aria-label={`${entry.label}: ${entry.value}`}
        title={entry.label}
        className="w-3 h-3 rounded-full box-border"
        style={{ backgroundColor: entry.css, border: `1px solid ${entry.borderCss}` }}
      />
    ))}
  </div>
)

const isMovingHead = (light: DmxFixture): boolean => light.fixture === FixtureTypes.RGBMH

const baseCircleClasses =
  'w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold shadow-md'
const subtitleClass = 'text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 select-none'

type LightCircleProps = { light: DmxFixture; dmxValues: Record<number, number> }

/** A fixture only redraws when its own addresses move; see {@link fixtureDmxValuesEqual}. */
const lightCirclePropsEqual = (a: LightCircleProps, b: LightCircleProps): boolean =>
  a.light === b.light && fixtureDmxValuesEqual(a.light, a.dmxValues, b.dmxValues)

/** One light's circle (moving heads include the pan/tilt dot overlay) and its swatch row. */
const LightCircle = React.memo(function LightCircle({ light, dmxValues }: LightCircleProps) {
  const color = getDmxPreviewLightColorCss(light, dmxValues)
  const breakdown = getLightColorChannelBreakdown(light, dmxValues)

  if (!isMovingHead(light)) {
    return (
      <div className="flex flex-col items-center mx-2 shrink-0">
        <div className="relative flex items-center justify-center w-20 h-20">
          <div
            className={baseCircleClasses}
            style={{
              backgroundColor: color,
            }}>
            {light.position}
          </div>
        </div>
        {/* The swatch row takes over the slot the spacer reserves. The spacer still covers the
            fixtures with no colour channels to break down, so rows stay aligned either way. */}
        {breakdown ? (
          <LightChannelSwatches entries={breakdown} />
        ) : (
          <span className={`${subtitleClass} invisible`} aria-hidden>
            upstage / downstage
          </span>
        )}
      </div>
    )
  }

  const channels = light.channels as RgbMovingHeadDmxChannels
  const pan = dmxValues[channels.pan] ?? 0
  const tilt = dmxValues[channels.tilt] ?? 0
  const { xPct, yPct } = panTiltDmxToSphericalXY(pan, tilt, light.config)

  return (
    <div className="flex flex-col items-center mx-2 shrink-0">
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
            backgroundColor: color,
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
      {breakdown && <LightChannelSwatches entries={breakdown} />}
    </div>
  )
}, lightCirclePropsEqual)

/** A row of lights. */
const LightRow: React.FC<{ lights: DmxFixture[]; dmxValues: Record<number, number> }> = ({
  lights,
  dmxValues,
}) => (
  <div className="flex justify-center gap-x-4 mb-4">
    {lights.map((light, index) => (
      <LightCircle key={light.id || `light-${index}`} light={light} dmxValues={dmxValues} />
    ))}
  </div>
)

/** People icons between the front and back rows. */
const PreviewPeople: React.FC = () => (
  <div className="flex justify-center mt-1">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="mx-2 ">
        <FaUser size={20} className="text-gray-600 dark:text-gray-300" />
      </div>
    ))}
  </div>
)

const StrobeIndicator = React.memo(function StrobeIndicator({
  light,
  dmxValues,
}: LightCircleProps) {
  return (
    <div
      className="w-24 h-8 flex items-center justify-center text-white dark:text-white rounded mt-4 mx-auto"
      style={{
        backgroundColor: getDmxPreviewLightColorCss(light, dmxValues),
      }}>
      Strobe
    </div>
  )
}, lightCirclePropsEqual)

const LightsDmxPreview: React.FC<LightsDmxPreviewProps> = ({
  lightingConfig,
  dmxValues,
  cornerControls,
}) => {
  const layoutId = lightingConfig.lightLayout?.id ?? 'front'
  const isStacked = layoutId === 'stacked'
  const isTwoRowsOnStage = layoutId === 'two-rows'
  const [previewMode, setPreviewMode] = useAtom(dmxPreviewDimensionAtom)

  const renderLightRow = (lights: DmxFixture[]) => (
    <LightRow lights={lights} dmxValues={dmxValues} />
  )

  const renderPeople = () => <PreviewPeople />

  const renderStrobeIndicator = (light: DmxFixture) => (
    <StrobeIndicator key={light.id} light={light} dmxValues={dmxValues} />
  )

  const preview3d = <LightsDmxPreview3D lightingConfig={lightingConfig} dmxValues={dmxValues} />

  if (isStacked) {
    return (
      <DmxPreviewWithStageLegend
        showStageLegend={previewMode === '2d'}
        cornerControls={cornerControls}>
        <PreviewDimensionToggle mode={previewMode} onChange={setPreviewMode} />
        {previewMode === '3d' ? (
          preview3d
        ) : (
          <>
            <div className="mb-1">
              <MdTv size={30} className="text-gray-600 dark:text-gray-300" />
            </div>

            {lightingConfig?.frontLights.length > 0 && (
              <div className="w-full flex flex-col items-center">
                <div className="mb-1 text-lg font-semibold text-gray-700 dark:text-gray-300">
                  Top
                </div>
                {renderLightRow(lightingConfig.frontLights)}
              </div>
            )}

            {lightingConfig?.backLights.length > 0 && (
              <div className="w-full flex flex-col items-center mt-2">
                <div className="mb-1 text-lg font-semibold text-gray-700 dark:text-gray-300">
                  Bottom
                </div>
                {renderLightRow([...lightingConfig.backLights].reverse())}
              </div>
            )}

            {lightingConfig?.strobeType === ConfigStrobeType.Dedicated &&
              lightingConfig.strobeLights.map((strobeLight) => renderStrobeIndicator(strobeLight))}

            {((lightingConfig?.frontLights.length ?? 0) > 0 ||
              (lightingConfig?.backLights.length ?? 0) > 0) &&
              renderPeople()}
          </>
        )}
      </DmxPreviewWithStageLegend>
    )
  }

  return (
    <DmxPreviewWithStageLegend
      showStageLegend={previewMode === '2d'}
      cornerControls={cornerControls}>
      <PreviewDimensionToggle mode={previewMode} onChange={setPreviewMode} />
      {previewMode === '3d' ? (
        preview3d
      ) : (
        <>
          <div className="mb-1">
            <MdTv size={30} className="text-gray-600 dark:text-gray-300" />
          </div>

          {lightingConfig?.frontLights.length > 0 && (
            <div className="w-full flex flex-col items-center">
              <div className="mb-1 text-lg font-semibold text-gray-700 dark:text-gray-300">
                Front
              </div>
              {renderLightRow(lightingConfig.frontLights)}
            </div>
          )}

          {lightingConfig?.strobeType === ConfigStrobeType.Dedicated &&
            lightingConfig.strobeLights.map((strobeLight) => renderStrobeIndicator(strobeLight))}

          {isTwoRowsOnStage ? (
            <>
              {lightingConfig?.backLights.length > 0 && (
                <div className="w-full flex flex-col items-center mt-3">
                  <div className="mb-1 text-lg font-semibold text-gray-700 dark:text-gray-300">
                    Back
                  </div>
                  {renderLightRow([...lightingConfig.backLights].reverse())}
                </div>
              )}
              {((lightingConfig?.frontLights.length ?? 0) > 0 ||
                (lightingConfig?.backLights.length ?? 0) > 0) &&
                renderPeople()}
            </>
          ) : (
            <>
              {lightingConfig?.backLights.length > 0 && renderPeople()}

              {lightingConfig?.backLights.length > 0 && (
                <div className="w-full flex flex-col items-center mt-3">
                  <div className="mb-1 text-lg font-semibold text-gray-700 dark:text-gray-300">
                    Back
                  </div>
                  {renderLightRow([...lightingConfig.backLights].reverse())}
                </div>
              )}
            </>
          )}
        </>
      )}
    </DmxPreviewWithStageLegend>
  )
}

export default LightsDmxPreview
