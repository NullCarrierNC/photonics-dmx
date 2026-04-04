import { DmxRig } from '../../../photonics-dmx/types'

export interface DmxRigSelectFieldProps {
  label: string
  rigs: DmxRig[]
  selectedRigId: string | null
  onChange: (rigId: string) => void
  showInactiveSuffix?: boolean
  className?: string
  selectClassName?: string
  disabled?: boolean
}

/** Labelled rig dropdown for pages that already hold the rig list. */
export function DmxRigSelectField({
  label,
  rigs,
  selectedRigId,
  onChange,
  showInactiveSuffix = false,
  className = 'mb-6',
  selectClassName = 'border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[220px]',
  disabled = false,
}: DmxRigSelectFieldProps): JSX.Element {
  const empty = rigs.length === 0

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      <select
        value={selectedRigId ?? ''}
        disabled={disabled || empty}
        onChange={(e) => onChange(e.target.value)}
        className={selectClassName}>
        {empty ? (
          <option value="">No rigs</option>
        ) : (
          rigs.map((rig) => (
            <option key={rig.id} value={rig.id}>
              {rig.name}
              {showInactiveSuffix && !rig.active ? ' (inactive)' : ''}
            </option>
          ))
        )}
      </select>
    </div>
  )
}
