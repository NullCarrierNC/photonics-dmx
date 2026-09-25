import React, { useState, useEffect } from 'react'
import {
  DmxFixture,
  DmxLight,
  DEFAULT_STROBE_CHANNEL_VALUES,
  ExtraChannel,
  FixtureTypes,
  StrobeChannelValues,
  FIXTURE_CONFIG_FIELDS,
  FixtureConfig,
  FixtureConfigFlagField,
  FixtureConfigNumberField,
  fixtureConfigFieldBounds,
  isFixtureConfigFlagField,
  normalizeFixtureConfig,
  LightingConfiguration,
} from '../../../photonics-dmx/types'
import { DraftNumberField } from './controls/DraftField'
import { LightIcon } from './LightIcon'
import {
  deriveChannelLayoutForMaster,
  deriveExtraChannelsForMaster,
  maxMasterDimmerForTemplate,
} from '../../../photonics-dmx/helpers/rigTemplateSync'
import { extraChannelDisplayLabel, sortBaseChannelEntries } from './lightChannelDisplay'
import { resolveMasterDimmer } from './lightChannelMaster'
import { BsArrowsMove, BsLightningFill } from 'react-icons/bs'
import MovingHeadCalibrationWizard from './MovingHeadCalibrationWizard'
import { createLogger } from '../../../shared/logger'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
const log = createLogger('LightChannelsConfig')

interface LightChannelsConfigProps {
  light: DmxLight | null
  onChange: (updatedLight: DmxLight) => void
  onClick: () => void
  isHighlighted: boolean
  myLights: DmxFixture[] // Light templates
  /** When set, moving-head fixtures can open the live calibration wizard. */
  rigId?: string | null
  /** Current rig lighting config (for 3D preview in the calibration wizard). */
  lightingConfig: LightingConfiguration
  /** Drag handle only; card body is not draggable. */
  dragHandle?: {
    setActivatorRef: (el: HTMLElement | null) => void
    attributes: DraggableAttributes
    listeners?: DraggableSyntheticListeners | undefined
  }
}

const STROBE_VALUE_FIELDS: ReadonlyArray<{ key: keyof StrobeChannelValues; label: string }> = [
  { key: 'slow', label: 'Strobe Slow' },
  { key: 'medium', label: 'Strobe Medium' },
  { key: 'fast', label: 'Strobe Fast' },
  { key: 'fastest', label: 'Strobe Fastest' },
]

const getDisplayName = (channelName: string) => {
  if (channelName === 'masterDimmer') return 'Master Dimmer'
  if (channelName === 'strobeChannel') return 'Strobe Speed'
  if (channelName === 'panRangeDeg') return 'Pan range (deg)'
  if (channelName === 'panDirectionCW') {
    return 'Pan increases clockwise from above'
  }
  if (channelName === 'tiltRangeDeg') return 'Tilt range (deg)'
  if (channelName === 'panMin') return 'Pan min'
  if (channelName === 'panMax') return 'Pan max'
  if (channelName === 'tiltMin') return 'Tilt min'
  if (channelName === 'tiltMax') return 'Tilt max'
  if (channelName === 'panHome') return 'Pan home (%) — idle pose'
  if (channelName === 'tiltHome') return 'Tilt home (%) — idle pose'
  if (channelName === 'panStageDeg') return 'Pan upstage reference (deg)'
  if (channelName === 'tiltStageDeg') return 'Tilt vertical reference (deg)'
  if (channelName === 'invertPan') return 'Invert pan direction'
  if (channelName === 'invertTilt') return 'Invert tilt direction'
  // For other keys, capitalize the first letter.
  return channelName.charAt(0).toUpperCase() + channelName.slice(1)
}

/**
 * LightChannelsConfig Component
 *
 * This component allows configuring DMX channels for a selected light.
 * It handles updating channel values, changing light types, toggling strobe mode,
 * and now also updates config values.
 */
const LightChannelsConfig: React.FC<LightChannelsConfigProps> = ({
  light,
  onChange,
  onClick,
  isHighlighted,
  myLights,
  rigId,
  lightingConfig,
  dragHandle,
}) => {
  const [localChannels, setLocalChannels] = useState<DmxFixture['channels'] | null>(null)

  // State for the light's config (if available)
  const [localConfig, setLocalConfig] = useState<FixtureConfig | null>(null)
  // Added channels, offset-derived from the template like the base channels. Display-only here.
  const [localExtraChannels, setLocalExtraChannels] = useState<ExtraChannel[] | null>(null)
  const [calibrationOpen, setCalibrationOpen] = useState(false)
  /**
   * Explains a master-dimmer entry that was capped to keep the fixture inside the universe. Tagged
   * with the light it describes so selecting another light drops it without an effect writing state.
   */
  const [masterDimmerNotice, setMasterDimmerNotice] = useState<{
    lightId: DmxLight['id']
    message: string
  } | null>(null)

  useEffect(() => {
    if (light) {
      const fixtureTemplate = myLights.find((fixture) => fixture.id === light.fixtureId)

      if (!fixtureTemplate) {
        log.warn(`fixtureId (${light.fixtureId}) not found in myLights.`)
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when fixture not found
        setLocalChannels(null)
        setLocalConfig(null)
        setLocalExtraChannels(null)
        return
      }

      // Handle Main Channels
      const templateChannels = fixtureTemplate.channels
      const existingMasterDimmer = light.channels.masterDimmer
      setLocalChannels(deriveChannelLayoutForMaster(fixtureTemplate, existingMasterDimmer).channels)
      setLocalExtraChannels(
        deriveExtraChannelsForMaster(
          fixtureTemplate.extraChannels,
          templateChannels.masterDimmer,
          existingMasterDimmer,
        ) ?? null,
      )

      // Handle Config
      // Copy the config from the light (no master dimmer logic here)
      if (light.config) {
        setLocalConfig(normalizeFixtureConfig(light.config))
      } else {
        setLocalConfig(null)
      }
    } else {
      setLocalChannels(null)
      setLocalConfig(null)
      setLocalExtraChannels(null)
    }
  }, [light, myLights])

  /**
   * Handles changes to the main Master Dimmer channel. Answers false when the master taken is not
   * the one typed, so the box shows the one taken.
   */
  const handleMasterDimmerChange = (asked: number): boolean => {
    if (!light || !localChannels) {
      return false
    }
    const fixtureTemplate = myLights.find((fixture) => fixture.id === light.fixtureId)
    if (!fixtureTemplate) {
      log.warn(`fixtureId (${light.fixtureId}) not found in myLights.`)
      return false
    }

    const resolved = resolveMasterDimmer(fixtureTemplate, asked)
    setMasterDimmerNotice(
      resolved.cappedMessage ? { lightId: light.id, message: resolved.cappedMessage } : null,
    )
    setLocalChannels(resolved.layout.channels)
    setLocalExtraChannels(resolved.extraChannels)

    const updatedLight: DmxLight = { ...light, ...resolved.layout }
    // Set/delete (not omit-on-spread): the spread copies the rig light's existing extraChannels,
    // so we must explicitly drop them when the template now has none, or a stale key persists.
    if (resolved.extraChannels) updatedLight.extraChannels = resolved.extraChannels
    else delete updatedLight.extraChannels
    onChange(updatedLight)
    return resolved.master === asked
  }

  const writeConfig = (updatedConfig: FixtureConfig): void => {
    if (!light) return
    setLocalConfig(updatedConfig)
    onChange({ ...light, config: updatedConfig })
  }

  const handleFlagChange = (key: FixtureConfigFlagField, checked: boolean): void => {
    if (localConfig) writeConfig({ ...localConfig, [key]: checked })
  }

  /**
   * A number field arrives already held inside its bounds, and only once the user has finished
   * with it, so an entry part way to a legal value is never written.
   */
  const handleNumberChange = (key: FixtureConfigNumberField, value: number): void => {
    if (!localConfig) return
    const { min, max } = fixtureConfigFieldBounds(key, localConfig)
    const next = Number.isFinite(value)
      ? Math.max(min, Math.min(max, Math.round(value)))
      : localConfig[key]
    writeConfig({ ...localConfig, [key]: next })
  }

  const toggleFiringDirection = (): void => {
    if (!light || !localConfig) return
    const { invertPan, invertTilt } = localConfig
    if (invertPan !== invertTilt) return
    const nextBoth = !invertPan
    const updatedConfig: FixtureConfig = {
      ...localConfig,
      invertPan: nextBoth,
      invertTilt: nextBoth,
    }
    setLocalConfig(updatedConfig)
    onChange({ ...light, config: updatedConfig })
  }

  /**
   * Handles changes to the light type via the select dropdown.
   */
  const handleLightTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedFixtureId = e.target.value
    if (!selectedFixtureId) return

    const selectedFixture = myLights.find((fixture) => fixture.id === selectedFixtureId)
    if (!selectedFixture || !light) return

    const templateChannels = selectedFixture.channels
    // Switching to a wider template can push the existing address past the universe, so re-cap it.
    const existingMasterDimmer = Math.min(
      light.channels.masterDimmer,
      maxMasterDimmerForTemplate(selectedFixture),
    )
    const layout = deriveChannelLayoutForMaster(selectedFixture, existingMasterDimmer)
    setLocalChannels(layout.channels)

    const extras = deriveExtraChannelsForMaster(
      selectedFixture.extraChannels,
      templateChannels.masterDimmer,
      existingMasterDimmer,
    )
    setLocalExtraChannels(extras ?? null)

    const updatedLight: DmxLight = {
      ...light,
      ...layout,
      fixtureId: selectedFixture.id!,
      label: selectedFixture.label,
      name: selectedFixture.name,
      isStrobeEnabled: selectedFixture.isStrobeEnabled,
    }
    // Set/delete so switching to a template with no extras drops the previous template's extras.
    if (extras) updatedLight.extraChannels = extras
    else delete updatedLight.extraChannels

    // For config, if the new fixture has a config template, use it.
    if (selectedFixture.config) {
      const normalized = normalizeFixtureConfig(selectedFixture.config)
      setLocalConfig(normalized)
      updatedLight.config = normalized
    } else {
      setLocalConfig(null)
      updatedLight.config = undefined
    }

    onChange(updatedLight)
  }

  /**
   * Handles toggling the strobe mode.
   */
  const handleStrobeToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (light) {
      const updatedLight: DmxLight = {
        ...light,
        isStrobeEnabled: e.target.checked,
      }
      onChange(updatedLight)
    }
  }

  /**
   * Handles per-light overrides for a strobe speed slot. The fixture template provides defaults;
   * setting a value here overrides for this light only.
   */
  const handleStrobeValueChange = (key: keyof StrobeChannelValues, raw: string) => {
    if (!light) return
    const parsed = Number(raw)
    const clamped = Math.max(0, Math.min(255, Number.isFinite(parsed) ? Math.round(parsed) : 0))
    const base = light.strobeValues ?? { ...DEFAULT_STROBE_CHANNEL_VALUES }
    onChange({
      ...light,
      strobeValues: { ...base, [key]: clamped },
    })
  }

  const isFixtureInMyLights = myLights.some((fixture) => fixture.id === light?.fixtureId)

  // A saved moving head in a rig is what the calibration wizard opens for.
  const calibration =
    light?.fixture === FixtureTypes.RGBMH && light.id && rigId ? { light, rigId } : null

  let dragHandleButton: React.ReactNode = null
  if (dragHandle) {
    const { setActivatorRef, attributes, listeners } = dragHandle
    const { onClick: dragOnClick, ...listenerRest } = listeners ?? {}
    dragHandleButton = (
      <button
        type="button"
        ref={(node) => {
          setActivatorRef(node)
        }}
        {...attributes}
        {...listenerRest}
        onClick={(e) => {
          dragOnClick?.(e)
          e.stopPropagation()
        }}
        aria-label="Drag to reorder light"
        className="absolute top-2 right-2 z-10 -translate-y-[6px] translate-x-[6px] p-1 cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 touch-none">
        <BsArrowsMove aria-hidden />
      </button>
    )
  }

  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col flex-grow items-center space-y-2 p-4 max-w-[440px] rounded-lg shadow cursor-pointer 
                  text-gray-800 dark:text-gray-200 
                  ${
                    isHighlighted
                      ? 'bg-yellow-500 dark:bg-yellow-600'
                      : 'bg-gray-300 dark:bg-[#303548] hover:bg-gray-200 dark:hover:bg-[#40465a]'
                  }`}>
      {dragHandleButton}
      {calibrationOpen && calibration && (
        <MovingHeadCalibrationWizard
          key={calibration.light.id}
          light={calibration.light}
          rigId={calibration.rigId}
          lightingConfig={lightingConfig}
          onClose={() => setCalibrationOpen(false)}
          onComplete={(updatedConfig) => {
            onChange({ ...calibration.light, config: updatedConfig })
          }}
        />
      )}
      {/* Light Type Selector */}
      <select
        value={isFixtureInMyLights ? light?.fixtureId : myLights[0]?.id || ''}
        onChange={handleLightTypeChange}
        className="p-2 border border-gray-300 dark:border-gray-700 rounded w-full text-black dark:text-white dark:bg-gray-700">
        {myLights.map((availableFixture) => (
          <option key={availableFixture.id!} value={availableFixture.id!}>
            {availableFixture.name}
          </option>
        ))}
        {!isFixtureInMyLights && light && (
          <option value={light.fixtureId} hidden>
            {light.name}
          </option>
        )}
      </select>

      {/* Light Icon and Strobe Indicator */}
      <div className="flex items-center justify-center">
        {light && <LightIcon type={light} />}
        {light?.isStrobeEnabled && (
          <BsLightningFill size={24} className="text-yellow-500 dark:text-yellow-400 ml-2" />
        )}
      </div>

      {/* Light Name */}
      {light && <span className="text-sm">{light.name}</span>}

      {/* Main Channels Configuration */}
      {light && localChannels && (
        <div className="mt-2 w-full">
          <ul className="text-sm space-y-1">
            {sortBaseChannelEntries(Object.entries(localChannels)).map(([channelName, value]) => (
              <li key={channelName} className="flex justify-between items-center">
                <span className="capitalize">{getDisplayName(channelName)}:</span>
                {channelName === 'masterDimmer' ? (
                  // No max here: the resolver holds an entry past the universe and says why.
                  <DraftNumberField
                    min={1}
                    value={value || 1}
                    onCommit={handleMasterDimmerChange}
                    className="w-16 p-1 border border-gray-300 dark:border-gray-700 rounded text-black dark:text-white dark:bg-gray-700 text-right"
                  />
                ) : (
                  <span>{value}</span>
                )}
              </li>
            ))}
            {masterDimmerNotice?.lightId === light.id && (
              <li className="text-xs text-amber-600 dark:text-amber-400">
                {masterDimmerNotice.message}
              </li>
            )}
            {/* Added channels — read-only here (template-owned, offset-derived from masterDimmer). */}
            {light &&
              (localExtraChannels ?? []).map((extra, i) => (
                <li key={`extra-${i}`} className="flex justify-between items-center">
                  <span>
                    {extraChannelDisplayLabel(
                      { ...light, extraChannels: localExtraChannels ?? [] },
                      i,
                    )}
                    :
                  </span>
                  <span>
                    {extra.type === 'fixed'
                      ? `${extra.channel} = ${extra.value ?? 0}`
                      : extra.channel}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Config Section */}
      {light && localConfig && (
        <div className="mt-2 w-full">
          <h3 className="text-lg font-bold">Config</h3>
          {light.fixture === FixtureTypes.RGBMH && (
            <>
              <p className="text-xs text-gray-600 dark:text-gray-200 mb-2">
                Use the Calibrate button below to configure these fields interactively.
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                Home sets the idle/default pose. Stage-reference fields set the calibration anchor
                for direction and circle cues.
              </p>
            </>
          )}
          <ul className="text-sm space-y-1">
            {FIXTURE_CONFIG_FIELDS.map((key) => {
              const isPanRangeDeg = key === 'panRangeDeg'
              const isTiltRangeDeg = key === 'tiltRangeDeg'
              const isPanStageDeg = key === 'panStageDeg'
              const isTiltStageDeg = key === 'tiltStageDeg'
              const noCapitalize =
                isPanRangeDeg || isTiltRangeDeg || isPanStageDeg || isTiltStageDeg
              return (
                <li key={key} className="flex justify-between items-center">
                  <span className={noCapitalize ? '' : 'capitalize'}>{getDisplayName(key)}</span>
                  {isFixtureConfigFlagField(key) ? (
                    <input
                      type="checkbox"
                      checked={localConfig[key]}
                      onChange={(e) => handleFlagChange(key, e.target.checked)}
                      className="ml-2"
                    />
                  ) : (
                    <DraftNumberField
                      aria-label={key}
                      min={fixtureConfigFieldBounds(key, localConfig).min}
                      max={fixtureConfigFieldBounds(key, localConfig).max}
                      value={localConfig[key]}
                      onCommit={(next) => handleNumberChange(key, next)}
                      className="w-16 p-1 border border-gray-300 dark:border-gray-700 rounded text-black dark:text-white dark:bg-gray-700 text-right"
                    />
                  )}
                </li>
              )
            })}
            {light.fixture === FixtureTypes.RGBMH &&
              localConfig.invertPan === localConfig.invertTilt && (
                <li className="flex flex-col items-stretch pt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFiringDirection()
                    }}
                    className="text-xs px-2 py-1 rounded border border-gray-400 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 w-full">
                    {localConfig.invertPan && localConfig.invertTilt
                      ? 'Down firing (invert pan + tilt)'
                      : 'Up firing (normal pan + tilt)'}
                  </button>
                </li>
              )}
          </ul>
        </div>
      )}

      {calibration && (
        <div className="w-full mt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setCalibrationOpen(true)
            }}
            className="text-sm px-2 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 w-full">
            Calibrate (live DMX)
          </button>
        </div>
      )}

      {/* Separator for moving head fixtures if present */}
      {light?.fixture === FixtureTypes.RGBMH ? <hr /> : null}

      {/* Strobe Toggle */}
      {light && (
        <label className="flex items-center space-x-2 w-full mt-2">
          <input
            type="checkbox"
            checked={light.isStrobeEnabled}
            onChange={handleStrobeToggle}
            className="shrink-0"
          />
          <span className="text-left w-full">Use as strobe</span>
        </label>
      )}

      {/* Per-light strobe speed value overrides. Only shown for RGB-family fixtures whose template
          has "Strobe Channel?" enabled — dedicated STROBE fixtures are a separate device class and
          don't consume strobeValues. */}
      {light &&
        light.isStrobeEnabled &&
        light.fixture !== FixtureTypes.STROBE &&
        typeof light.channels.strobeChannel === 'number' && (
          <div className="w-full mt-2 space-y-1">
            <h4 className="text-sm font-semibold">Strobe Speed Values</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              DMX 0–255 written to the strobe channel for each cue speed. Override per light;
              inherits from the fixture template when unset.
            </p>
            {STROBE_VALUE_FIELDS.map(({ key, label }) => {
              const v = light.strobeValues?.[key] ?? DEFAULT_STROBE_CHANNEL_VALUES[key]
              return (
                <div
                  key={key}
                  className="flex justify-between items-center"
                  onClick={(e) => e.stopPropagation()}>
                  <span>{label}:</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={v}
                    onChange={(e) => handleStrobeValueChange(key, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-16 p-1 border border-gray-300 dark:border-gray-700 rounded text-black dark:text-white dark:bg-gray-700 text-right"
                  />
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

export default LightChannelsConfig
