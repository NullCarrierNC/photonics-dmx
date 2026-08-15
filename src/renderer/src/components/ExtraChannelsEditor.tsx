import React from 'react'
import {
  DmxFixture,
  EXTRA_CHANNEL_TYPES,
  ExtraChannel,
  ExtraChannelType,
  FixtureTypes,
} from '../../../photonics-dmx/types'
import {
  EXTRA_CHANNEL_TYPE_LABELS,
  extraChannelDisplayLabel,
  findDuplicateChannelNumbers,
} from './lightChannelDisplay'

interface ExtraChannelsEditorProps {
  light: DmxFixture
  /** Emits the new list, or `undefined` when the list is emptied (never persist `[]`). */
  onChange: (extraChannels: ExtraChannel[] | undefined) => void
}

/**
 * Editor for a fixture's user-added channels (beyond its archetype's fixed channel set). Renders a
 * row per {@link DmxFixture.extraChannels} entry (type picker + DMX channel number, plus a constant
 * value input for `fixed` channels), an "+ Add Channel" button, and a non-blocking warning when a
 * DMX number is assigned more than once. Duplicates of a type are allowed. Dedicated STROBE
 * fixtures (colour-less) only offer the "Fixed value" type.
 */
const ExtraChannelsEditor: React.FC<ExtraChannelsEditorProps> = ({ light, onChange }) => {
  const extras = light.extraChannels ?? []
  const isStrobe = light.fixture === FixtureTypes.STROBE
  // Colour emitters have no residual home on a colour-less strobe — only fixed (mode) channels.
  const offeredTypes: readonly ExtraChannelType[] = isStrobe ? ['fixed'] : EXTRA_CHANNEL_TYPES

  const emit = (next: ExtraChannel[]): void => onChange(next.length ? next : undefined)

  const handleAdd = (): void => {
    // White is the most common real-world addition; channel 0 renders invalid-red until assigned.
    const seed: ExtraChannel = isStrobe
      ? { type: 'fixed', channel: 0, value: 0 }
      : { type: 'white', channel: 0 }
    emit([...extras, seed])
  }

  const handleTypeChange = (index: number, type: ExtraChannelType): void => {
    const next = extras.map((ec, i) => {
      if (i !== index) return ec
      if (type === 'fixed') return { type, channel: ec.channel, value: ec.value ?? 0 }
      // Drop the value when leaving 'fixed' — it's only valid on fixed channels.
      return { type, channel: ec.channel }
    })
    emit(next)
  }

  const handleChannelChange = (index: number, raw: string): void => {
    let channel = Number(raw)
    if (!Number.isFinite(channel)) channel = 1
    channel = Math.min(512, Math.max(1, Math.round(channel)))
    emit(extras.map((ec, i) => (i === index ? { ...ec, channel } : ec)))
  }

  const handleValueChange = (index: number, raw: string): void => {
    let value = Number(raw)
    if (!Number.isFinite(value)) value = 0
    value = Math.min(255, Math.max(0, Math.round(value)))
    emit(extras.map((ec, i) => (i === index ? { ...ec, value } : ec)))
  }

  const handleRemove = (index: number): void => {
    emit(extras.filter((_, i) => i !== index))
  }

  const duplicates = findDuplicateChannelNumbers(light)

  return (
    <div className="space-y-2 max-w-[360px]">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
        Additional Channels
      </h3>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        If you light has more than the basic RGB channels, or it has more than one R/G/B channel,
        you can add additional channels here.
      </p>

      {extras.map((extra, i) => {
        const label = extraChannelDisplayLabel(light, i)
        return (
          <div key={`extra-${i}`} className="flex items-center space-x-2">
            <select
              aria-label={`${label} type`}
              value={extra.type}
              onChange={(e) => handleTypeChange(i, e.target.value as ExtraChannelType)}
              className="p-2 border border-gray-300 rounded text-black flex-grow">
              {offeredTypes.map((type) => (
                <option key={type} value={type}>
                  {EXTRA_CHANNEL_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <input
              aria-label={`${label} DMX channel`}
              type="number"
              min={1}
              max={512}
              value={extra.channel}
              onChange={(e) => handleChannelChange(i, e.target.value)}
              className={`p-2 border border-gray-300 rounded w-[100px] text-black ${
                extra.channel === 0 ? 'text-red-500 font-bold' : ''
              }`}
            />
            {extra.type === 'fixed' && (
              <span className="flex items-center space-x-1">
                <span className="text-gray-600 dark:text-gray-400">=</span>
                <input
                  aria-label={`${label} held value`}
                  title="DMX value 0–255 held on this channel whenever DMX output is running"
                  type="number"
                  min={0}
                  max={255}
                  value={extra.value ?? 0}
                  onChange={(e) => handleValueChange(i, e.target.value)}
                  className="p-2 border border-gray-300 rounded w-[80px] text-black"
                />
              </span>
            )}
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => handleRemove(i)}
              className="text-xs px-2 py-1 rounded border border-gray-400 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 text-red-500">
              ✕
            </button>
          </div>
        )
      })}

      {duplicates.length > 0 && (
        <p className="text-xs text-orange-500 dark:text-orange-400">
          {duplicates.length === 1
            ? `Channel ${duplicates[0]} is assigned more than once.`
            : `Channels ${duplicates.join(', ')} are assigned more than once.`}
        </p>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
        + Add Channel
      </button>
    </div>
  )
}

export default ExtraChannelsEditor
