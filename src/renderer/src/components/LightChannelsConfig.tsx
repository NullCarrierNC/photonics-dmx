import React, { useState, useEffect } from 'react'
import {
  DmxFixture,
  DmxLight,
  DEFAULT_STROBE_CHANNEL_VALUES,
  FixtureTypes,
  RgbDmxChannels,
  RgbwDmxChannels,
  StrobeChannelValues,
  StrobeDmxChannels,
  FixtureConfig,
  normalizeFixtureConfig,
  LightingConfiguration,
} from '../../../photonics-dmx/types'
import { LightIcon } from './LightIcon'
import { castToChannelType } from '../../../photonics-dmx/helpers/dmxHelpers'
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

const channelOrder = ['masterDimmer', 'red', 'green', 'blue', 'white', 'strobeChannel']

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
  const [localChannels, setLocalChannels] = useState<
    RgbDmxChannels | RgbwDmxChannels | StrobeDmxChannels | null
  >(null)

  // State for the light's config (if available)
  const [localConfig, setLocalConfig] = useState<FixtureConfig | null>(null)
  const [calibrationOpen, setCalibrationOpen] = useState(false)

  useEffect(() => {
    if (light) {
      const fixtureTemplate = myLights.find((fixture) => fixture.id === light.fixtureId)

      if (!fixtureTemplate) {
        log.warn(`fixtureId (${light.fixtureId}) not found in myLights.`)
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when fixture not found
        setLocalChannels(null)
        setLocalConfig(null)
        return
      }

      // Handle Main Channels
      const templateChannels = fixtureTemplate.channels
      // Calculate offsets based on masterDimmer for main channels
      const offsets: { [key: string]: number } = {}
      Object.entries(templateChannels).forEach(([channelName, value]) => {
        if (channelName !== 'masterDimmer') {
          offsets[channelName] = value - templateChannels.masterDimmer
        }
      })

      const existingMasterDimmer = light.channels.masterDimmer
      const recalculatedChannels: { [key: string]: number } = {}
      Object.entries(templateChannels).forEach(([channelName, _]) => {
        if (channelName === 'masterDimmer') {
          recalculatedChannels[channelName] = existingMasterDimmer
        } else {
          recalculatedChannels[channelName] = existingMasterDimmer + (offsets[channelName] || 0)
        }
      })

      const castChannels = castToChannelType(fixtureTemplate.fixture, recalculatedChannels)
      setLocalChannels(castChannels)

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
    }
  }, [light, myLights])

  /**
   * Handles changes to the main Master Dimmer channel.
   */
  const handleMasterDimmerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (light && localChannels) {
      let newMasterValue = Number(e.target.value)
      // DMX channels are 1-based; reject values less than 1
      if (!Number.isFinite(newMasterValue) || newMasterValue < 1) {
        newMasterValue = 1
      }
      // Find the fixture template to get the original offsets
      const fixtureTemplate = myLights.find((fixture) => fixture.id === light.fixtureId)
      if (!fixtureTemplate) {
        log.warn(`fixtureId (${light.fixtureId}) not found in myLights.`)
        return
      }

      // Calculate offsets from the fixture template (not the current light)
      const templateChannels = fixtureTemplate.channels
      const offsets: { [key: string]: number } = {}
      Object.entries(templateChannels).forEach(([channelName, value]) => {
        if (channelName !== 'masterDimmer') {
          offsets[channelName] = value - templateChannels.masterDimmer
        }
      })

      // Apply the new master dimmer value and recalculate all channels using template offsets
      const updatedChannels: { [key: string]: number } = {}
      Object.entries(templateChannels).forEach(([channelName, _]) => {
        if (channelName === 'masterDimmer') {
          updatedChannels[channelName] = newMasterValue
        } else {
          updatedChannels[channelName] = newMasterValue + (offsets[channelName] || 0)
        }
      })

      const castChannels = castToChannelType(fixtureTemplate.fixture, updatedChannels)
      setLocalChannels({ ...castChannels })

      const updatedLight: DmxLight = {
        ...light,
        channels: { ...castChannels },
      }
      onChange(updatedLight)
    }
  }

  /**
   * Handles updates for any property in the config.
   * For number fields, the value is parsed to a number.
   * For boolean fields (invertPan / invertTilt / panDirectionCW), the value is taken from the checkbox.
   */
  const handleConfigChange = (key: keyof FixtureConfig, value: string | boolean) => {
    if (light && localConfig) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- config value can be number or string
      let updatedValue: any = value
      if (key !== 'invertPan' && key !== 'invertTilt' && key !== 'panDirectionCW') {
        if (key === 'panRangeDeg') {
          const num = Number(value)
          updatedValue = Math.max(1, Math.min(720, Math.round(num)))
        } else if (key === 'tiltRangeDeg') {
          const num = Number(value)
          updatedValue = Math.max(1, Math.min(360, Math.round(num)))
        } else if (key === 'panHome' || key === 'tiltHome') {
          const num = Number(value)
          updatedValue = Math.max(0, Math.min(100, Math.round(num)))
        } else if (key === 'panStageDeg') {
          const num = Number(value)
          updatedValue = Math.max(0, Math.min(localConfig.panRangeDeg, Math.round(num)))
        } else if (key === 'tiltStageDeg') {
          const num = Number(value)
          updatedValue = Math.max(0, Math.min(localConfig.tiltRangeDeg, Math.round(num)))
        } else {
          updatedValue = Number(value)
        }
      }
      const updatedConfig = { ...localConfig, [key]: updatedValue }
      setLocalConfig(updatedConfig)
      const updatedLight: DmxLight = { ...light, config: updatedConfig }
      onChange(updatedLight)
    }
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

    const existingMasterDimmer = light.channels.masterDimmer
    const templateChannels = selectedFixture.channels

    const offsets: { [key: string]: number } = {}
    Object.entries(templateChannels).forEach(([channelName, value]) => {
      if (channelName !== 'masterDimmer') {
        offsets[channelName] = value - templateChannels.masterDimmer
      }
    })

    const recalculatedChannels: { [key: string]: number } = {}
    Object.entries(templateChannels).forEach(([channelName, _]) => {
      if (channelName === 'masterDimmer') {
        recalculatedChannels[channelName] = existingMasterDimmer
      } else {
        recalculatedChannels[channelName] = existingMasterDimmer + (offsets[channelName] || 0)
      }
    })

    const castChannels = castToChannelType(selectedFixture.fixture, recalculatedChannels)
    setLocalChannels({ ...castChannels })

    const updatedLight: DmxLight = {
      ...light,
      fixtureId: selectedFixture.id!,
      fixture: selectedFixture.fixture,
      label: selectedFixture.label,
      name: selectedFixture.name,
      isStrobeEnabled: selectedFixture.isStrobeEnabled,
      channels: { ...castChannels },
    }

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

  const showCalibrate =
    !!light &&
    !!rigId &&
    !!light.id &&
    (light.fixture === FixtureTypes.RGBMH || light.fixture === FixtureTypes.RGBWMH)

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
      {calibrationOpen && showCalibrate && light && rigId && (
        <MovingHeadCalibrationWizard
          key={light.id}
          light={light}
          rigId={rigId}
          lightingConfig={lightingConfig}
          onClose={() => setCalibrationOpen(false)}
          onComplete={(updatedConfig) => {
            onChange({ ...light, config: updatedConfig })
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
            {Object.entries(localChannels)
              .sort(([keyA], [keyB]) => {
                const indexA = channelOrder.indexOf(keyA)
                const indexB = channelOrder.indexOf(keyB)
                if (indexA !== -1 && indexB !== -1) return indexA - indexB
                if (indexA !== -1) return -1
                if (indexB !== -1) return 1
                return keyA.localeCompare(keyB)
              })
              .map(([channelName, value]) => (
                <li key={channelName} className="flex justify-between items-center">
                  <span className="capitalize">{getDisplayName(channelName)}:</span>
                  {channelName === 'masterDimmer' ? (
                    <input
                      type="number"
                      min={1}
                      value={value || 1}
                      onChange={handleMasterDimmerChange}
                      className="w-16 p-1 border border-gray-300 dark:border-gray-700 rounded text-black dark:text-white dark:bg-gray-700 text-right"
                    />
                  ) : (
                    <span>{value}</span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Config Section */}
      {light && localConfig && (
        <div className="mt-2 w-full">
          <h3 className="text-lg font-bold">Config</h3>
          {(light.fixture === FixtureTypes.RGBMH || light.fixture === FixtureTypes.RGBWMH) && (
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
            {Object.entries(localConfig).map(([key, value]) => {
              // Determine input type based on value type.
              const inputType = typeof value === 'boolean' ? 'checkbox' : 'number'
              const isPanRangeDeg = key === 'panRangeDeg'
              const isTiltRangeDeg = key === 'tiltRangeDeg'
              const isPanHome = key === 'panHome'
              const isTiltHome = key === 'tiltHome'
              const isPanStageDeg = key === 'panStageDeg'
              const isTiltStageDeg = key === 'tiltStageDeg'
              const noCapitalize =
                isPanRangeDeg || isTiltRangeDeg || isPanStageDeg || isTiltStageDeg
              return (
                <li key={key} className="flex justify-between items-center">
                  <span className={noCapitalize ? '' : 'capitalize'}>{getDisplayName(key)}</span>
                  {inputType === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={value as boolean}
                      onChange={(e) =>
                        handleConfigChange(key as keyof FixtureConfig, e.target.checked)
                      }
                      className="ml-2"
                    />
                  ) : (
                    <input
                      type="number"
                      min={
                        isPanRangeDeg
                          ? 1
                          : isTiltRangeDeg
                            ? 1
                            : isPanHome || isTiltHome
                              ? 0
                              : isPanStageDeg || isTiltStageDeg
                                ? 0
                                : undefined
                      }
                      max={
                        isPanRangeDeg
                          ? 720
                          : isTiltRangeDeg
                            ? 360
                            : isPanHome || isTiltHome
                              ? 100
                              : isPanStageDeg
                                ? localConfig?.panRangeDeg ?? 720
                                : isTiltStageDeg
                                  ? localConfig?.tiltRangeDeg ?? 360
                                  : undefined
                      }
                      value={value as number}
                      onChange={(e) =>
                        handleConfigChange(key as keyof FixtureConfig, e.target.value)
                      }
                      className="w-16 p-1 border border-gray-300 dark:border-gray-700 rounded text-black dark:text-white dark:bg-gray-700 text-right"
                    />
                  )}
                </li>
              )
            })}
            {(light.fixture === FixtureTypes.RGBMH || light.fixture === FixtureTypes.RGBWMH) &&
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

      {showCalibrate && (
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
      {light?.fixture === FixtureTypes.RGBMH || light?.fixture === FixtureTypes.RGBWMH ? (
        <hr />
      ) : null}

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
        typeof (light.channels as RgbDmxChannels).strobeChannel === 'number' && (
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
