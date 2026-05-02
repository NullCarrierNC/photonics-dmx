import React from 'react'

export interface CueGroupEnableListProps {
  title: string
  description: string
  loading: boolean
  loadError: string | null
  onRetryLoad?: () => void
  children: React.ReactNode
}

/**
 * Shared frame for cue-group enable panels: loading, load error with retry, or content.
 */
export function CueGroupEnableList(props: CueGroupEnableListProps): React.ReactElement {
  const { title, description, loading, loadError, onRetryLoad, children } = props

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2">{title}</h2>
        <p>Loading…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          {title}
        </h2>
        <p className="text-sm text-red-600 dark:text-red-400 mb-4" role="alert">
          {loadError}
        </p>
        {onRetryLoad ? (
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
            onClick={onRetryLoad}>
            Retry
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        {title}
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{description}</p>
      <div className="space-y-4">{children}</div>
    </div>
  )
}
