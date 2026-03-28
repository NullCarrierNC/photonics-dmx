import React from 'react'

interface CollapsibleSenderCardProps {
  title: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

const CollapsibleSenderCard: React.FC<CollapsibleSenderCardProps> = ({
  title,
  expanded,
  onToggle,
  children,
}) => (
  <div className="border rounded-lg border-gray-200 dark:border-gray-600">
    <div
      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-t-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
      onClick={onToggle}
      onKeyDown={(e) => e.key === 'Enter' && onToggle()}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}>
      <div className="flex items-center flex-1">
        <div className="mr-3 text-gray-600 dark:text-gray-400">
          {expanded ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">{title}</h3>
      </div>
    </div>
    {expanded && (
      <div className="p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
        {children}
      </div>
    )}
  </div>
)

export default CollapsibleSenderCard
