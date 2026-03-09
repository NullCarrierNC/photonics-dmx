import React from 'react'

type Props = {
  id: string
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

/**
 * Shared wrapper for flow node views. Renders the node ID at the top in small print,
 * then children (node content and Handles). Use as the root element of each node component.
 */
const FlowNodeFrame: React.FC<Props> = ({ id, className, style, children }) => {
  return (
    <div className={className} style={style}>
      <div className="text-[9px] text-gray-500 dark:text-gray-500 truncate mb-0" title={id}>
        {id}
      </div>
      {children}
    </div>
  )
}

export default FlowNodeFrame
