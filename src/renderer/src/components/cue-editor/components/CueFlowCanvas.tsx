import React from 'react';
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
  type ReactFlowInstance
} from 'reactflow';
import type { EditorNode } from '../lib/types';
import { formatDuration } from '../lib/cueUtils';

type Props = {
  nodes: EditorNode[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  chainDuration: number;
  selectedCueName?: string;
  contextMenu: { x: number; y: number; nodeId: string } | null;
  flowWrapperRef: React.RefObject<HTMLDivElement>;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onSelectionChange: (params: { nodes: EditorNode[] }) => void;
  onNodeContextMenu: (event: React.MouseEvent, node: EditorNode) => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  onRemoveNode: (nodeId: string) => void;
  setReactFlowInstance: (instance: ReactFlowInstance) => void;
  isValidConnection: (connection: Connection) => boolean;
};

const CueFlowCanvas: React.FC<Props> = ({
  nodes,
  edges,
  nodeTypes,
  chainDuration,
  selectedCueName,
  contextMenu,
  flowWrapperRef,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  onNodeContextMenu,
  onEdgeContextMenu,
  onPaneClick,
  onRemoveNode,
  setReactFlowInstance,
  isValidConnection
}) => (
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
      nodeTypes={nodeTypes}
      fitView
      className="rounded-b-lg"
      proOptions={{ hideAttribution: true }}
    >
      <Panel position="top-left" className="bg-white/80 dark:bg-gray-900/80 px-2 py-1 text-[11px] rounded shadow">
        <div>{selectedCueName ? `Cue: ${selectedCueName}` : 'Select or add a cue'}</div>
        {chainDuration > 0 && (
          <div className="text-gray-600 dark:text-gray-400">
            Chain duration: {formatDuration(chainDuration)}
          </div>
        )}
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
        className="absolute bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow text-xs"
        style={{ top: contextMenu.y, left: contextMenu.x, zIndex: 20 }}
      >
        <button
          className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
          onClick={() => onRemoveNode(contextMenu.nodeId)}
        >
          Remove node
        </button>
      </div>
    )}
  </div>
);

export default CueFlowCanvas;
