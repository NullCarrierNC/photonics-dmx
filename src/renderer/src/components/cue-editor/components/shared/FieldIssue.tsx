import React from 'react'
import type { ValueIssue } from '../../../../../../photonics-dmx/cues/node/cueValueRules'

/**
 * The attributes that tie a field's control to its issue line: an error marks the control invalid,
 * and either kind describes it.
 */
export function issueAttributes(
  issue: ValueIssue | null | undefined,
  id: string,
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  if (!issue) return {}
  return {
    ...(issue.severity === 'error' && { 'aria-invalid': true }),
    'aria-describedby': id,
  }
}

/** The line under a field naming what is wrong with its value, red for an error. */
const FieldIssue: React.FC<{ issue: ValueIssue | null | undefined; id: string }> = ({
  issue,
  id,
}) =>
  issue ? (
    <span
      id={id}
      className={`block text-[10px] ${
        issue.severity === 'error' ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'
      }`}>
      {issue.message}
    </span>
  ) : null

export default FieldIssue
