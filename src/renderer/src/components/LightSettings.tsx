import React from 'react'
import LightType from './../components/LightType'
import DmxChannels from './../components/DmxChannels'
import {
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  DEFAULT_STROBE_CHANNEL_VALUES,
  DmxFixture,
  FixtureConfig,
  FixtureTypes,
  LightTypes,
  RgbDmxChannels,
  StrobeChannelValues,
  normalizeFixtureConfig,
} from '../../../photonics-dmx/types'

function isFixtureConfigKey(name: string): name is keyof FixtureConfig {
  return name in DEFAULT_MOVING_HEAD_FIXTURE_CONFIG
}

const STROBE_VALUE_FIELDS: ReadonlyArray<{ key: keyof StrobeChannelValues; label: string }> = [
  { key: 'slow', label: 'Strobe Slow' },
  { key: 'medium', label: 'Strobe Medium' },
  { key: 'fast', label: 'Strobe Fast' },
  { key: 'fastest', label: 'Strobe Fastest' },
]

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
  if (!currentLight) {
    return null // Hide form if currentLight is null
  }

  const channels = currentLight.channels as RgbDmxChannels
  const hasStrobeChannel = typeof channels.strobeChannel === 'number'
  const isDedicatedStrobe = currentLight.fixture === FixtureTypes.STROBE
  // The "Strobe Channel?" toggle and the four per-speed DMX values belong to the RGB+S model only.
  // Dedicated STROBE fixtures are a separate device class (colour-less hardware strobe) — they
  // intrinsically have a strobe channel and they don't consume `strobeValues`.
  const showStrobeChannelToggle = !isDedicatedStrobe
  const showStrobeFields = !isDedicatedStrobe && hasStrobeChannel

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentLight({ ...currentLight, name: e.target.value })
  }

  const handleTypeChange = (newType: FixtureTypes) => {
    const defaultType = LightTypes.find((type) => type.fixture === newType)
    if (!defaultType) return

    // Preserve the user's strobe-channel choice across RGB-family type changes. Dedicated STROBE
    // fixtures are a separate device class — they intrinsically carry a strobe channel and don't
    // consume `strobeValues`, so when switching into/out of STROBE we drop the RGB+S extras.
    const nextChannels: Record<string, number> = {
      ...(defaultType.channels as unknown as Record<string, number>),
    }
    const prevStrobe = channels.strobeChannel
    const newIsStrobeFixture = newType === FixtureTypes.STROBE
    if (newIsStrobeFixture) {
      // Template already includes strobeChannel; nothing extra to carry over from prev RGB-family.
    } else if (typeof prevStrobe === 'number' && currentLight.fixture !== FixtureTypes.STROBE) {
      nextChannels.strobeChannel = prevStrobe
    } else {
      delete nextChannels.strobeChannel
    }

    // strobeValues only applies to RGB-family fixtures with hasStrobeChannel — clear on STROBE.
    const nextStrobeValues = newIsStrobeFixture
      ? undefined
      : typeof nextChannels.strobeChannel === 'number'
        ? currentLight.strobeValues ?? { ...DEFAULT_STROBE_CHANNEL_VALUES }
        : undefined

    setCurrentLight({
      ...currentLight,
      fixture: newType,
      channels: nextChannels as unknown as DmxFixture['channels'],
      config: defaultType.config ? normalizeFixtureConfig(defaultType.config) : undefined,
      strobeValues: nextStrobeValues,
    })
  }

  // Updated handleChannelChange to accept number | boolean
  const handleChannelChange = (channelName: string, value: number | boolean) => {
    if (currentLight.config && isFixtureConfigKey(channelName)) {
      setCurrentLight({
        ...currentLight,
        config: normalizeFixtureConfig({
          ...currentLight.config,
          [channelName]: value,
        }),
      })
    } else {
      // Update regular channels
      setCurrentLight({
        ...currentLight,
        channels: {
          ...currentLight.channels,
          [channelName]: value as number, // Type assertion since channels expect number
        },
      })
    }
  }

  const handleStrobeChannelToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked
    const nextChannels: Record<string, number> = {
      ...(currentLight.channels as unknown as Record<string, number>),
    }
    if (checked) {
      nextChannels.strobeChannel = nextChannels.strobeChannel ?? 0
      setCurrentLight({
        ...currentLight,
        channels: nextChannels as unknown as DmxFixture['channels'],
        strobeValues: currentLight.strobeValues ?? { ...DEFAULT_STROBE_CHANNEL_VALUES },
      })
    } else {
      delete nextChannels.strobeChannel
      setCurrentLight({
        ...currentLight,
        channels: nextChannels as unknown as DmxFixture['channels'],
        strobeValues: undefined,
      })
    }
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
          <LightType
            selectedType={currentLight.fixture}
            onTypeChange={(newType) => handleTypeChange(newType as FixtureTypes)}
          />
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
