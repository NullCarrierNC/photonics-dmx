import React, { useLayoutEffect, useRef } from 'react'

export interface GroupEnableCheckboxProps {
  checked: boolean
  indeterminate: boolean
  onChange: (next: boolean) => void
  /** Optional id of the element that labels this control for assistive tech. */
  ariaLabelledBy?: string
  /** Optional id of the element that describes this control. */
  ariaDescribedBy?: string
  /** Direct label string when no labelling element is available (e.g. when the row is split). */
  ariaLabel?: string
}

/**
 * Tri-state group enable checkbox (checked / unchecked / indeterminate).
 *
 * Sets both the DOM `indeterminate` flag and `aria-checked="mixed"` so AT consumers see the
 * mixed state; native `checked` stays `false` while indeterminate so the visual state matches.
 */
export function GroupEnableCheckbox(props: GroupEnableCheckboxProps): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = props.indeterminate
    }
  }, [props.indeterminate])

  const ariaChecked: boolean | 'mixed' = props.indeterminate
    ? 'mixed'
    : props.checked && !props.indeterminate

  return (
    <input
      ref={ref}
      type="checkbox"
      className="form-checkbox h-5 w-5 text-blue-600 rounded"
      checked={props.checked && !props.indeterminate}
      onChange={(e) => props.onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      aria-checked={ariaChecked}
      aria-labelledby={props.ariaLabelledBy}
      aria-describedby={props.ariaDescribedBy}
      aria-label={props.ariaLabel}
    />
  )
}
