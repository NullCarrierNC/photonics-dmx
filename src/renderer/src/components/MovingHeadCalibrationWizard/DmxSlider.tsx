/**
 * One raw DMX channel as a slider, held inside the 0 to 255 the wire carries.
 */
export function DmxSlider(props: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const { label, value, onChange, disabled } = props
  const v = Math.max(0, Math.min(255, Math.round(value)))
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
        <span>{label}</span>
        <span className="font-mono">{v}</span>
      </div>
      <input
        type="range"
        min={0}
        max={255}
        value={v}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full disabled:opacity-50"
      />
    </div>
  )
}
