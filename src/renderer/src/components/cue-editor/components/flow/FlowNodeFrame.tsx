import React from 'react'
import { useAtomValue } from 'jotai'
import { showNodeIdsAtom } from '../../../../atoms'

type Props = {
  id: string
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

/**
 * Shared wrapper for flow node views. When showNodeIds is enabled, renders the node ID
 * at the top in small print; then children (node content and Handles).
 * Use as the root element of each node component.
 */
const FlowNodeFrame: React.FC<Props> = ({ id, className, style, children }) => {
  const showNodeIds = useAtomValue(showNodeIdsAtom)
  return (
    <div className={className} style={style}>
      {showNodeIds && (
        <div className="text-[9px] text-gray-500 dark:text-gray-500 truncate mb-0" title={id}>
          {id}
        </div>
      )}
      {children}
    </div>
  )
}

export default FlowNodeFrame
