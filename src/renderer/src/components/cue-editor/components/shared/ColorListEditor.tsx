import React from 'react'
import type { Color } from '../../../../../../photonics-dmx/types'
import { COLOR_OPTIONS } from '../../../../../../photonics-dmx/constants/options'

export interface ColorListEditorProps {
  colors: Color[]
  onColorsChange: (colors: Color[]) => void
  label?: string
  emptyMessage?: string
}

/** Edits an ordered list of colours via COLOR_OPTIONS dropdowns (add/remove). Used for color-array
 * literals and palettes; dropdown-only entry means invalid colour names can't be authored. */
const ColorListEditor: React.FC<ColorListEditorProps> = ({
  colors,
  onColorsChange,
  label = 'Palette (one colour per step, in order)',
  emptyMessage = 'No colours yet — add at least one.',
}) => {
  const updateColorAt = (index: number, value: Color): void => {
    const next = [...colors]
    next[index] = value
    onColorsChange(next)
  }

  const addColor = (): void => {
    const fallback = (COLOR_OPTIONS[0] ?? 'blue') as Color
    onColorsChange([...colors, colors[colors.length - 1] ?? fallback])
  }

  const removeColorAt = (index: number): void => {
    onColorsChange(colors.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-1 text-xs">
      <span className="font-medium">{label}</span>
      {colors.length === 0 && <p className="text-[10px] text-gray-500 italic">{emptyMessage}</p>}
      {colors.map((color, index) => (
        <div key={index} className="flex items-center gap-1">
          <span className="w-5 text-right text-gray-500">{index}</span>
          <select
            className="flex-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value={color}
            onChange={(event) => updateColorAt(index, event.target.value as Color)}>
            {COLOR_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded border px-2 py-1 text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
            onClick={() => removeColorAt(index)}
            aria-label={`Remove colour ${index}`}>
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="rounded border px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={addColor}>
        + Add colour
      </button>
    </div>
  )
}

export default ColorListEditor
