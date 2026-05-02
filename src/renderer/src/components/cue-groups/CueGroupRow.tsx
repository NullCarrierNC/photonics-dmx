import React from 'react'
import { FaChevronDown, FaChevronRight } from 'react-icons/fa'
import { GroupEnableCheckbox } from './GroupEnableCheckbox'

export interface CueGroupRowError {
  message: string
  /** Optional retry; when present we render a Retry button alongside the message. */
  onRetry?: () => void
  retryLabel?: string
}

export interface CueGroupRowProps {
  /** Stable id for ARIA wiring (`headerButtonId`/`panelId` are derived from it). */
  groupId: string
  /** Used as the heading text and the accessible name source for the row. */
  name: string
  description?: React.ReactNode
  isExpanded: boolean
  onToggleExpanded: () => void

  checked: boolean
  indeterminate: boolean
  onEnableChange: (next: boolean) => void

  /** Roving-tabindex wiring (one tab stop per list, arrow keys move focus). */
  tabIndex: number
  expandButtonRef: (el: HTMLButtonElement | null) => void
  onExpandButtonKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void
  onExpandButtonFocus: () => void

  /** Inline lazy-load failure for this row's cues. Renders a banner + Retry. */
  loadError?: CueGroupRowError | null
  /** Inline persistence failure for this row's last toggle. Renders a banner + Retry. */
  persistError?: CueGroupRowError | null

  children?: React.ReactNode
}

/**
 * Accessible cue-group row: separate expand button + sibling tri-state enable checkbox
 * (no nested focusable controls). Used by Audio/Motion/YARG cue-group panels for a consistent
 * keyboard story (Tab into the list → Arrow keys between rows; Tab again to reach the checkbox).
 */
export function CueGroupRow(props: CueGroupRowProps): React.ReactElement {
  const {
    groupId,
    name,
    description,
    isExpanded,
    onToggleExpanded,
    checked,
    indeterminate,
    onEnableChange,
    tabIndex,
    expandButtonRef,
    onExpandButtonKeyDown,
    onExpandButtonFocus,
    loadError,
    persistError,
    children,
  } = props

  const headerButtonId = `cue-group-${groupId}-header-button`
  const titleId = `cue-group-${groupId}-title`
  const panelId = `cue-group-${groupId}-panel`

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="border rounded-lg border-gray-200 dark:border-gray-600">
      <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-t-lg">
        <button
          id={headerButtonId}
          ref={expandButtonRef}
          type="button"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          tabIndex={tabIndex}
          onClick={onToggleExpanded}
          onKeyDown={onExpandButtonKeyDown}
          onFocus={onExpandButtonFocus}
          className="flex items-center flex-1 text-left bg-transparent hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors rounded p-1 -m-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <span className="mr-3 text-gray-600 dark:text-gray-400" aria-hidden>
            {isExpanded ? (
              <FaChevronDown className="w-4 h-4" />
            ) : (
              <FaChevronRight className="w-4 h-4" />
            )}
          </span>
          <span className="flex-1">
            <span id={titleId} className="block font-bold">
              {name}
            </span>
            {description ? (
              <span className="block text-sm text-gray-600 dark:text-gray-400">{description}</span>
            ) : null}
          </span>
        </button>
        <GroupEnableCheckbox
          checked={checked}
          indeterminate={indeterminate}
          onChange={onEnableChange}
          ariaLabel={`Enable ${name}`}
        />
      </div>

      {loadError ? (
        <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400" role="alert">
          <span className="mr-2">{loadError.message}</span>
          {loadError.onRetry ? (
            <button
              type="button"
              onClick={loadError.onRetry}
              className="underline hover:no-underline">
              {loadError.retryLabel ?? 'Retry'}
            </button>
          ) : null}
        </div>
      ) : null}

      {persistError ? (
        <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400" role="alert">
          <span className="mr-2">{persistError.message}</span>
          {persistError.onRetry ? (
            <button
              type="button"
              onClick={persistError.onRetry}
              className="underline hover:no-underline">
              {persistError.retryLabel ?? 'Retry'}
            </button>
          ) : null}
        </div>
      ) : null}

      {isExpanded ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={titleId}
          className="p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
          {children}
        </div>
      ) : null}
    </div>
  )
}
