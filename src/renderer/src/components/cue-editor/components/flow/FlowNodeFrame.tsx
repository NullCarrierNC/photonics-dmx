import React from 'react'
import { useAtomValue } from 'jotai'
import { showNodeIdsAtom } from '../../../../atoms'
import { useActiveNodesContext } from '../../context/ActiveNodesContext'
import { useErrorNodesContext } from '../../context/ErrorNodesContext'

type Props = {
  id: string
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

const ACTIVE_STYLES =
  'shadow-[0_0_20px_12px_rgba(34,197,94,0.7)] ring-[3px] ring-green-400 brightness-125 transition-shadow duration-150'
const ERROR_STYLES =
  'shadow-[0_0_20px_12px_rgba(239,68,68,0.7),0_0_40px_24px_rgba(239,68,68,0.45)] ring-[6px] ring-red-500 brightness-110 transition-shadow duration-150'
const INACTIVE_STYLES = 'transition-shadow duration-300'

/**
 * Shared wrapper for flow node views. When showNodeIds is enabled, renders the node ID
 * at the top in small print; applies active (green) or error (red) highlight from context;
 * then children (node content and Handles). Use as the root element of each node component.
 */
const FlowNodeFrame: React.FC<Props> = ({ id, className, style, children }) => {
  const showNodeIds = useAtomValue(showNodeIdsAtom)
  const activeNodeIds = useActiveNodesContext()
  const errorNodeIds = useErrorNodesContext()
  const isActive = activeNodeIds.has(id)
  const isError = errorNodeIds.has(id)
  const highlightStyles = isError ? ERROR_STYLES : isActive ? ACTIVE_STYLES : INACTIVE_STYLES
  return (
    <div className={className ? `${className} ${highlightStyles}` : highlightStyles} style={style}>
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
