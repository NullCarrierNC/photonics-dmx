import React from 'react'
import LightType from './../components/LightType'
import DmxChannels from './../components/DmxChannels'
import ExtraChannelsEditor from './../components/ExtraChannelsEditor'
import {
  BrightnessScaling,
  DEFAULT_BRIGHTNESS_SCALE_PERCENT,
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  DEFAULT_STROBE_CHANNEL_VALUES,
  DmxFixture,
  ExtraChannel,
  FixtureConfig,
  FixtureTypes,
  StrobeChannelValues,
  normalizeFixtureConfig,
} from '../../../photonics-dmx/types'
import { isStorableBrightnessScale } from '../../../photonics-dmx/helpers/brightnessScaling'
import { STROBE_VALUE_FIELDS, extraChannelDisplayLabel } from './lightChannelDisplay'
import { withChannelNumber, withFixtureType, withStrobeChannelOption } from './fixtureTemplateEdits'
import { DraftNumberField } from './controls/DraftField'

function isFixtureConfigKey(name: string): name is keyof FixtureConfig {
  return name in DEFAULT_MOVING_HEAD_FIXTURE_CONFIG
}

const BRIGHTNESS_SCALING_FIELDS: ReadonlyArray<{ key: keyof BrightnessScaling; label: string }> = [
  { key: 'red', label: 'Red' },
  { key: 'green', label: 'Green' },
  { key: 'blue', label: 'Blue' },
]

/** Colour extras can be trimmed; a `fixed` channel is a pinned constant with nothing to scale. */
function isScalableExtra(extra: ExtraChannel): boolean {
  return extra.type !== 'fixed'
}

interface LightSettingsProps {
  currentLight: DmxFixture | null
  setCurrentLight: (light: DmxFixture | null) => void
}

/**
 * Component for editing light fixture properties
 * @param {LightSettingsProps} props - Component props
 * @param {Light | null} props.currentLight - The light being edited
 * @param {(light: Light | null) => void} props.setCurrentLight - Callback to update light
 * @returns {JSX.Element | null} Form for editing light properties
 */
const LightSettings: React.FC<LightSettingsProps> = ({ currentLight, setCurrentLight }) => {
  // Niche hardware-matching control, so its fields stay behind a toggle.
  const [scalingRevealed, setScalingRevealed] = React.useState(false)

  if (!currentLight) {
    return null // Hide form if currentLight is null
  }

  const hasStrobeChannel = typeof currentLight.channels.strobeChannel === 'number'
  const isDedicatedStrobe = currentLight.fixture === FixtureTypes.STROBE
  // The "Strobe Channel?" toggle and the four per-speed DMX values belong to the RGB+S model only.
  // Dedicated STROBE fixtures are a separate device class (colour-less hardware strobe) — they
  // intrinsically have a strobe channel and they don't consume `strobeValues`.
  const showStrobeChannelToggle = !isDedicatedStrobe
  const showStrobeFields = !isDedicatedStrobe && hasStrobeChannel

  // A fixture that already carries a trim shows its fields without hunting for the toggle.
  const scalableExtras = (currentLight.extraChannels ?? [])
    .map((extra, index) => ({ extra, index }))
    .filter(({ extra }) => isScalableExtra(extra))
  const hasBrightnessScaling =
    BRIGHTNESS_SCALING_FIELDS.some(({ key }) =>
      isStorableBrightnessScale(currentLight.brightnessScaling?.[key]),
    ) || scalableExtras.some(({ extra }) => isStorableBrightnessScale(extra.scale))
  const showScalingToggle = !isDedicatedStrobe
  const showScalingFields = showScalingToggle && (scalingRevealed || hasBrightnessScaling)

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentLight({ ...currentLight, name: e.target.value })
  }

  const handleTypeChange = (newType: FixtureTypes) => {
    setCurrentLight(withFixtureType(currentLight, newType))
  }

  const handleChannelChange = (channelName: string, value: number | boolean) => {
    if (currentLight.config && isFixtureConfigKey(channelName)) {
      setCurrentLight({
        ...currentLight,
        config: normalizeFixtureConfig({
          ...currentLight.config,
          [channelName]: value,
        }),
      })
    } else if (typeof value === 'number') {
      setCurrentLight(withChannelNumber(currentLight, channelName, value))
    }
  }

  const handleStrobeChannelToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentLight(withStrobeChannelOption(currentLight, e.target.checked))
  }

  const handleScalingToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked
    setScalingRevealed(checked)
    if (checked) return
    // Unchecking clears the trim rather than hiding it, like the strobe-channel toggle above.
    const next: DmxFixture = { ...currentLight }
    delete next.brightnessScaling
    if (next.extraChannels) {
      next.extraChannels = next.extraChannels.map((ec) => {
        const { scale: _scale, ...rest } = ec
        return rest
      })
    }
    setCurrentLight(next)
  }

  const handleBaseScaleChange = (key: keyof BrightnessScaling, percent: number) => {
    const nextScaling: BrightnessScaling = { ...currentLight.brightnessScaling }
    // 100 is never stored; absence is how every layer spells "unscaled".
    if (isStorableBrightnessScale(percent)) nextScaling[key] = percent
    else delete nextScaling[key]

    const next: DmxFixture = { ...currentLight }
    if (Object.keys(nextScaling).length > 0) next.brightnessScaling = nextScaling
    else delete next.brightnessScaling
    setCurrentLight(next)
  }

  const handleExtraScaleChange = (index: number, percent: number) => {
    const nextExtras = (currentLight.extraChannels ?? []).map((ec, i) => {
      if (i !== index) return ec
      const { scale: _scale, ...rest } = ec
      return isStorableBrightnessScale(percent) ? { ...rest, scale: percent } : rest
    })
    setCurrentLight({ ...currentLight, extraChannels: nextExtras })
  }

  const handleStrobeValueChange = (key: keyof StrobeChannelValues, raw: string) => {
    const parsed = Number(raw)
    const clamped = Math.max(0, Math.min(255, Number.isFinite(parsed) ? Math.round(parsed) : 0))
    const base = currentLight.strobeValues ?? { ...DEFAULT_STROBE_CHANNEL_VALUES }
    setCurrentLight({
      ...currentLight,
      strobeValues: { ...base, [key]: clamped },
    })
  }

  return (
    <form className="space-y-4">
      {/* Light Type Field */}
      <div className="flex items-center space-x-2 max-w-[360px]">
        <div className="flex-grow">
          <LightType selectedType={currentLight.fixture} onTypeChange={handleTypeChange} />
        </div>
      </div>

      {/* Name Field */}
      <label className="flex flex-col items-start w-full">
        <span className="mb-2 text-gray-700 dark:text-gray-300">Name</span>
        <input
          type="text"
          maxLength={50}
          value={currentLight.name}
          onChange={handleNameChange}
          placeholder="Enter light name"
          className="p-2 border border-gray-300 rounded w-full text-black max-w-[360px]"
        />
      </label>

      {/* Strobe channel toggle (hidden for dedicated STROBE fixtures which always have one) */}
      {showStrobeChannelToggle && (
        <label
          className="flex items-center space-x-2 max-w-[360px]"
          title="Tick when the fixture exposes a hardware strobe-speed DMX channel">
          <input
            type="checkbox"
            checked={hasStrobeChannel}
            onChange={handleStrobeChannelToggle}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Use Hardware Strobe Channel?
          </span>
        </label>
      )}

      {/* DMX Channels Field — wrapped so its inputs align with the strobe values block below */}
      <div className="max-w-[360px]">
        <DmxChannels light={currentLight} onChannelChange={handleChannelChange} />
      </div>

      {/* Additional user-added channels (colour emitters, duplicate banks, fixed/mode channels) */}
      <ExtraChannelsEditor
        light={currentLight}
        onChange={(extraChannels) => {
          const next: DmxFixture = { ...currentLight }
          if (extraChannels && extraChannels.length > 0) next.extraChannels = extraChannels
          else delete next.extraChannels
          setCurrentLight(next)
        }}
      />

      {/* Brightness scaling toggle (hidden for colour-less STROBE fixtures) */}
      {showScalingToggle && (
        <label
          className="flex items-center space-x-2 max-w-[360px]"
          title="Trim individual colour channels to balance a fixture whose emitters differ in brightness">
          <input
            type="checkbox"
            checked={showScalingFields}
            onChange={handleScalingToggle}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Use Brightness Scaling</span>
        </label>
      )}

      {/* Per-colour-channel brightness trim, revealed by the toggle above */}
      {showScalingFields && (
        <div className="space-y-2 max-w-[360px]">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Brightness Scaling
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Percentage of each colour channel&apos;s output sent to the fixture. If your lights
            don&apos;t produce a nice white when RGB are set to full, try reducing the stronger
            colours. Setting a colour to 80% means it will be 20% dimmer at full power than the
            other channels.
          </p>
          {BRIGHTNESS_SCALING_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex items-center space-x-4">
              <label
                htmlFor={`brightness-scale-${key}`}
                className="text-sm w-1/3 text-gray-700 dark:text-gray-300">
                {label}:
              </label>
              <DraftNumberField
                id={`brightness-scale-${key}`}
                min={0}
                max={100}
                value={currentLight.brightnessScaling?.[key] ?? DEFAULT_BRIGHTNESS_SCALE_PERCENT}
                onCommit={(percent) => handleBaseScaleChange(key, percent)}
                className="p-2 border border-gray-300 rounded w-[100px] text-black"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">%</span>
            </div>
          ))}
          {scalableExtras.map(({ extra, index }) => {
            const label = extraChannelDisplayLabel(currentLight, index)
            return (
              <div key={`extra-scale-${index}`} className="flex items-center space-x-4">
                <label
                  htmlFor={`brightness-scale-extra-${index}`}
                  className="text-sm w-1/3 text-gray-700 dark:text-gray-300">
                  {label}:
                </label>
                <DraftNumberField
                  id={`brightness-scale-extra-${index}`}
                  min={0}
                  max={100}
                  value={extra.scale ?? DEFAULT_BRIGHTNESS_SCALE_PERCENT}
                  onCommit={(percent) => handleExtraScaleChange(index, percent)}
                  className="p-2 border border-gray-300 rounded w-[100px] text-black"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">%</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Per-fixture strobe DMX values (only meaningful when strobe channel is enabled) */}
      {showStrobeFields && (
        <div className="space-y-2 max-w-[360px]">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Strobe Speed Values
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            DMX 0–255 written to the fixture&apos;s strobe channel for each strobe cue speed.
          </p>
          {STROBE_VALUE_FIELDS.map(({ key, label }) => {
            const v = currentLight.strobeValues?.[key] ?? DEFAULT_STROBE_CHANNEL_VALUES[key]
            return (
              <div key={key} className="flex items-center space-x-4">
                <label
                  htmlFor={`strobe-value-${key}`}
                  className="text-sm w-1/3 text-gray-700 dark:text-gray-300">
                  {label}:
                </label>
                <input
                  id={`strobe-value-${key}`}
                  type="number"
                  min={0}
                  max={255}
                  value={v}
                  onChange={(e) => handleStrobeValueChange(key, e.target.value)}
                  className="p-2 border border-gray-300 rounded w-[100px] text-black"
                />
              </div>
            )
          })}
        </div>
      )}
    </form>
  )
}

export default LightSettings
