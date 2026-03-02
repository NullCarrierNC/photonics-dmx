import React from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  type Connection,
  type Edge,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type ReactFlowInstance,
} from 'reactflow'
import type { EditorNode, NotesVariant } from '../lib/types'
import { NODE_EFFECT_TYPES } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { getDefaultEventOption } from '../lib/options'
import type { LogicNode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

type Props = {
  nodes: EditorNode[]
  edges: Edge[]
  nodeTypes: NodeTypes
  selectedCueName?: string
  contextMenu: { x: number; y: number; nodeId: string } | null
  paneContextMenu: { x: number; y: number; flowX: number; flowY: number } | null
  flowWrapperRef: React.RefObject<HTMLDivElement>
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  onSelectionChange: (params: { nodes: EditorNode[] }) => void
  onNodeContextMenu: (event: React.MouseEvent, node: EditorNode) => void
  onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void
  onPaneClick: () => void
  onPaneContextMenu: (event: React.MouseEvent) => void
  onRemoveNode: (nodeId: string) => void
  setReactFlowInstance: (instance: ReactFlowInstance) => void
  isValidConnection: (connection: Connection) => boolean
  activeMode: 'yarg' | 'audio'
  editorMode: 'cue' | 'effect'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-flow node option type
  addEventNode: (option?: any, position?: { x: number; y: number }) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- effect type from registry
  addActionNode: (effectType: any, position?: { x: number; y: number }) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- logic type from registry
  addLogicNode: (logicType: any, position?: { x: number; y: number }) => void
  addEventRaiserNode?: (position?: { x: number; y: number }) => void
  addEventListenerNode?: (position?: { x: number; y: number }) => void
  addEffectRaiserNode?: (position?: { x: number; y: number }) => void
  addEffectListenerNode?: (position?: { x: number; y: number }) => void
  addNotesNode?: (variant: NotesVariant, position?: { x: number; y: number }) => void
  onJsonToggle?: () => void
  onGraphPrettify?: () => void
}

const CueFlowCanvas: React.FC<Props> = ({
  nodes,
  edges,
  nodeTypes,
  selectedCueName,
  contextMenu,
  paneContextMenu,
  flowWrapperRef,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  onNodeContextMenu,
  onEdgeContextMenu,
  onPaneClick,
  onPaneContextMenu,
  onRemoveNode,
  setReactFlowInstance,
  isValidConnection,
  activeMode,
  editorMode,
  addEventNode,
  addActionNode,
  addLogicNode,
  addEventRaiserNode,
  addEventListenerNode,
  addEffectRaiserNode,
  addEffectListenerNode,
  addNotesNode,
  onJsonToggle,
  onGraphPrettify,
}) => {
  const handlePaneMenuClick = (action: () => void) => {
    action()
    onPaneClick() // Close menu
  }

  const menuRef = React.useRef<HTMLDivElement>(null)

  // Adjust menu position after render to prevent overflow
  React.useEffect(() => {
    if (paneContextMenu && menuRef.current) {
      const menu = menuRef.current
      const rect = menu.getBoundingClientRect()
      let adjustedX = paneContextMenu.x
      let adjustedY = paneContextMenu.y
      let needsUpdate = false

      // Check bottom overflow
      if (rect.bottom > window.innerHeight) {
        adjustedY = window.innerHeight - rect.height - 10
        if (adjustedY < 10) adjustedY = 10
        needsUpdate = true
      }

      // Check right overflow
      if (rect.right > window.innerWidth) {
        adjustedX = window.innerWidth - rect.width - 10
        if (adjustedX < 10) adjustedX = 10
        needsUpdate = true
      }

      // Check left overflow
      if (rect.left < 0) {
        adjustedX = 10
        needsUpdate = true
      }

      // Check top overflow
      if (rect.top < 0) {
        adjustedY = 10
        needsUpdate = true
      }

      if (needsUpdate) {
        menu.style.top = `${adjustedY}px`
        menu.style.left = `${adjustedX}px`
      }
    }
  }, [paneContextMenu])

  return (
    <div className="flex-1 relative" ref={flowWrapperRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onInit={setReactFlowInstance}
        isValidConnection={isValidConnection}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        fitView
        className="rounded-b-lg"
        proOptions={{ hideAttribution: true }}>
        <Panel
          position="top-left"
          className="w-full max-w-full bg-white/80 dark:bg-gray-900/80 pl-2 pr-6 py-1 text-[11px] rounded shadow flex items-center justify-between gap-4 box-border">
          <div className="min-w-0 truncate">
            {selectedCueName ? `Cue: ${selectedCueName}` : 'Select or add a cue'}
          </div>
          <div className="shrink-0 ml-auto flex items-center gap-2">
            {onGraphPrettify && (
              <button
                type="button"
                onClick={onGraphPrettify}
                className="px-2 py-0.5 rounded border border-gray-400 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Re-layout graph nodes">
                Graph Prettier
              </button>
            )}
            {onJsonToggle && (
              <button
                type="button"
                onClick={onJsonToggle}
                className="px-2 py-0.5 rounded border border-gray-400 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Edit cue JSON">
                JSON
              </button>
            )}
          </div>
        </Panel>
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(31,41,55,0.6)"
          nodeColor="#93c5fd"
          nodeStrokeColor="#60a5fa"
        />
        <Controls />
        <Background gap={16} size={0.5} />
      </ReactFlow>
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg text-xs z-[9999]"
          style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button
            className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => onRemoveNode(contextMenu.nodeId)}>
            Remove node
          </button>
        </div>
      )}
      {paneContextMenu && (
        <div
          ref={menuRef}
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg text-xs z-[9999] max-h-[80vh] overflow-y-auto"
          style={{ top: paneContextMenu.y, left: paneContextMenu.x }}>
          {editorMode === 'cue' && (
            <>
              <div className="px-3 py-1 font-semibold italic text-blue-800 dark:text-blue-100 bg-blue-50 dark:bg-blue-900/40 border-t border-b border-blue-400 dark:border-blue-600">
                Event Nodes
              </div>
              {addEventListenerNode && (
                <button
                  className="block w-full text-left px-3 py-1 text-purple-800 dark:text-purple-100 bg-purple-50 dark:bg-purple-900/40 hover:bg-purple-100 dark:hover:bg-purple-900/60"
                  onClick={() =>
                    handlePaneMenuClick(() =>
                      addEventListenerNode({ x: paneContextMenu.flowX, y: paneContextMenu.flowY }),
                    )
                  }>
                  Custom Event Listener
                </button>
              )}
              <button
                className="block w-full text-left px-3 py-1 text-blue-800 dark:text-blue-100 bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/60"
                onClick={() =>
                  handlePaneMenuClick(() =>
                    addEventNode(getDefaultEventOption(activeMode), {
                      x: paneContextMenu.flowX,
                      y: paneContextMenu.flowY,
                    }),
                  )
                }>
                System Event
              </button>
            </>
          )}
          {editorMode === 'effect' && addEffectListenerNode && (
            <>
              <div className="px-3 py-1 font-semibold italic text-cyan-900 dark:text-cyan-50 bg-cyan-100 dark:bg-cyan-800/60 border-t border-b border-cyan-500 dark:border-cyan-600">
                Effect Entry
              </div>
              <button
                className="block w-full text-left px-3 py-1 text-cyan-900 dark:text-cyan-50 bg-cyan-100 dark:bg-cyan-800/60 hover:bg-cyan-200 dark:hover:bg-cyan-800/80"
                onClick={() =>
                  handlePaneMenuClick(() =>
                    addEffectListenerNode({ x: paneContextMenu.flowX, y: paneContextMenu.flowY }),
                  )
                }>
                Effect Listener
              </button>
            </>
          )}
          <div className="px-3 py-1 font-semibold italic text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 border-t border-b border-gray-300 dark:border-gray-600">
            Action Nodes
          </div>
          {[...NODE_EFFECT_TYPES].sort().map((effectType) => (
            <button
              key={effectType}
              className="block w-full text-left px-3 py-1 text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() =>
                handlePaneMenuClick(() =>
                  addActionNode(effectType, { x: paneContextMenu.flowX, y: paneContextMenu.flowY }),
                )
              }>
              {effectType}
            </button>
          ))}
          <div className="px-3 py-1 font-semibold italic text-amber-800 dark:text-amber-100 bg-amber-50 dark:bg-amber-900/30 border-t border-b border-amber-400 dark:border-amber-600">
            Logic Nodes
          </div>
          {(
            [
              'variable',
              'math',
              'conditional',
              'cue-data',
              'config-data',
              'lights-from-index',
              'array-length',
              'reverse-lights',
              'create-pairs',
              'concat-lights',
              'delay',
              'debugger',
              'random',
              'shuffle-lights',
              'for-each-light',
            ] as LogicNode['logicType'][]
          )
            .sort()
            .map((logicType) => (
              <button
                key={logicType}
                className="block w-full text-left px-3 py-1 text-amber-800 dark:text-amber-100 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                onClick={() =>
                  handlePaneMenuClick(() =>
                    addLogicNode(logicType, { x: paneContextMenu.flowX, y: paneContextMenu.flowY }),
                  )
                }>
                {logicType.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </button>
            ))}
          {addEventRaiserNode && (
            <>
              <div className="px-3 py-1 font-semibold italic text-purple-800 dark:text-purple-100 bg-purple-50 dark:bg-purple-900/40 border-t border-b border-purple-400 dark:border-purple-600">
                Runtime Events
              </div>
              <button
                className="block w-full text-left px-3 py-1 text-purple-800 dark:text-purple-100 bg-purple-50 dark:bg-purple-900/40 hover:bg-purple-100 dark:hover:bg-purple-900/60"
                onClick={() =>
                  handlePaneMenuClick(() =>
                    addEventRaiserNode({ x: paneContextMenu.flowX, y: paneContextMenu.flowY }),
                  )
                }>
                Custom Event Raiser
              </button>
            </>
          )}
          {editorMode === 'cue' && addEffectRaiserNode && (
            <>
              <div className="px-3 py-1 font-semibold italic text-cyan-800 dark:text-cyan-100 bg-cyan-50 dark:bg-cyan-900/40 border-t border-b border-cyan-400 dark:border-cyan-600">
                Effect Nodes
              </div>
              <button
                className="block w-full text-left px-3 py-1 text-cyan-800 dark:text-cyan-100 bg-cyan-50 dark:bg-cyan-900/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/60"
                onClick={() =>
                  handlePaneMenuClick(() =>
                    addEffectRaiserNode({ x: paneContextMenu.flowX, y: paneContextMenu.flowY }),
                  )
                }>
                Effect Raiser
              </button>
            </>
          )}
          {addNotesNode && (
            <>
              <div className="px-3 py-1 font-semibold italic text-yellow-900 dark:text-yellow-950 bg-yellow-400 dark:bg-yellow-500 border-t border-b border-yellow-500 dark:border-yellow-600">
                Documentation
              </div>
              <button
                className="block w-full text-left px-3 py-1 text-blue-800 dark:text-blue-100 bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/60"
                onClick={() =>
                  handlePaneMenuClick(() =>
                    addNotesNode('info', { x: paneContextMenu.flowX, y: paneContextMenu.flowY }),
                  )
                }>
                Info
              </button>
              <button
                className="block w-full text-left px-3 py-1 text-yellow-900 dark:text-yellow-950 bg-yellow-400 dark:bg-yellow-500 hover:bg-yellow-500 dark:hover:bg-yellow-600 font-semibold"
                onClick={() =>
                  handlePaneMenuClick(() =>
                    addNotesNode('notes', { x: paneContextMenu.flowX, y: paneContextMenu.flowY }),
                  )
                }>
                Notes
              </button>
              <button
                className="block w-full text-left px-3 py-1 text-red-800 dark:text-red-100 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50"
                onClick={() =>
                  handlePaneMenuClick(() =>
                    addNotesNode('important', {
                      x: paneContextMenu.flowX,
                      y: paneContextMenu.flowY,
                    }),
                  )
                }>
                Important
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default CueFlowCanvas
