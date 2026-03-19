import React, { useState } from 'react'
import { useAtomValue } from 'jotai'
import type {
  ActionNode,
  AudioEventNode,
  AudioEventNodeUnion,
  EventRaiserNode,
  EventListenerNode,
  EffectRaiserNode,
  EffectEventListenerNode,
  EffectDefinition,
  LogicNode,
  NodeCueMode,
  NodeEffectType,
  YargEventNode,
  YargEffectDefinition,
  AudioEffectDefinition,
  NotesNode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorMode, NotesVariant } from '../lib/types'
import type { EditorNode, EventOption } from '../lib/types'
import NodeCreationSections from './NodeCreationSections'
import DebugPanel from './DebugPanel'
import EffectRaiserEditor from './node-editors/EffectRaiserEditor'
import EffectListenerEditor from './node-editors/EffectListenerEditor'
import EventRaiserEditor from './node-editors/EventRaiserEditor'
import EventListenerEditor from './node-editors/EventListenerEditor'
import EventNodeEditor from './node-editors/EventNodeEditor'
import LogicNodeEditor from './node-editors/LogicNodeEditor'
import ActionNodeEditor from './node-editors/ActionNodeEditor'
import NotesNodeEditor from './node-editors/NotesNodeEditor'
import { showNodeIdsAtom } from '../../../atoms'

type Props = {
  activeMode: NodeCueMode
  editorMode: EditorMode
  selectedNode: EditorNode | null
  selectedActionHasEventParent: boolean
  availableVariables: {
    name: string
    type: string
    scope: 'cue' | 'cue-group'
    validValues?: string[]
  }[]
  availableEvents?: string[]
  availableEffects?: { id: string; name: string; definition?: EffectDefinition }[]
  currentEffect?: YargEffectDefinition | AudioEffectDefinition | null
  onSyncVariableValidValues?: (
    varName: string,
    scope: 'cue' | 'cue-group',
    validValues: string[],
  ) => void
  addEventNode: (
    option: EventOption<YargEventNode['eventType'] | AudioEventNode['eventType']>,
  ) => void
  addActionNode: (effect: NodeEffectType) => void
  addLogicNode: (logicType: LogicNode['logicType']) => void
  addEventRaiserNode?: () => void
  addEventListenerNode?: () => void
  addEffectRaiserNode?: () => void
  addEffectListenerNode?: () => void
  addNotesNode?: (variant: NotesVariant) => void
  updateSelectedNode: <
    T extends
      | YargEventNode
      | AudioEventNodeUnion
      | ActionNode
      | LogicNode
      | EventRaiserNode
      | EventListenerNode
      | EffectRaiserNode
      | EffectEventListenerNode
      | NotesNode,
  >(
    updates: Partial<T>,
  ) => void
  updateNodeId?: (newId: string) => void
}

/** Keyed by nodeId so draft state resets when selection changes without using an effect. */
const NodeIdInput: React.FC<{
  nodeId: string
  onCommit?: (newId: string) => void
}> = ({ nodeId, onCommit }) => {
  const [draft, setDraft] = useState(nodeId)
  const commit = (): void => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== nodeId && onCommit) onCommit(trimmed)
    else if (trimmed !== nodeId) setDraft(nodeId)
  }
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
          commit()
        }
      }}
      className="w-full px-2 py-1.5 text-sm font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
      spellCheck={false}
    />
  )
}

const NodeSidebar: React.FC<Props> = ({
  activeMode,
  editorMode,
  selectedNode,
  selectedActionHasEventParent,
  availableVariables,
  availableEvents = [],
  availableEffects = [],
  currentEffect,
  onSyncVariableValidValues,
  addEventNode,
  addActionNode,
  addLogicNode,
  addEventRaiserNode,
  addEventListenerNode,
  addEffectRaiserNode,
  addEffectListenerNode,
  addNotesNode,
  updateSelectedNode,
  updateNodeId,
}) => {
  const showNodeIds = useAtomValue(showNodeIdsAtom)
  return (
    <aside className="bg-white dark:bg-gray-900 rounded-lg shadow-inner h-full flex flex-col overflow-hidden">
      {!selectedNode ? (
        <div className="p-3 flex-1 overflow-hidden">
          <div className="flex flex-col h-full space-y-4">
            <div className="shrink-0">
              <NodeCreationSections
                activeMode={activeMode}
                editorMode={editorMode}
                addEventNode={addEventNode}
                addActionNode={addActionNode}
                addLogicNode={addLogicNode}
                addEventRaiserNode={addEventRaiserNode}
                addEventListenerNode={addEventListenerNode}
                addEffectRaiserNode={addEffectRaiserNode}
                addEffectListenerNode={addEffectListenerNode}
                addNotesNode={addNotesNode}
              />
            </div>
            <DebugPanel className="flex-1 min-h-0" />
          </div>
        </div>
      ) : (
        <div className="p-3 flex-1 overflow-y-auto space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-2">Selected Node</h3>
            {showNodeIds && (
              <div className="mb-3">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Node ID
                </label>
                {updateNodeId ? (
                  <NodeIdInput
                    key={selectedNode.id}
                    nodeId={selectedNode.id}
                    onCommit={updateNodeId}
                  />
                ) : (
                  <span className="block text-sm font-mono text-gray-700 dark:text-gray-300 break-all">
                    {selectedNode.id}
                  </span>
                )}
              </div>
            )}
            {selectedNode.data.kind === 'effect-raiser' && (
              <EffectRaiserEditor
                node={selectedNode.data.payload as EffectRaiserNode}
                activeMode={activeMode}
                availableEffects={availableEffects}
                availableVariables={availableVariables}
                updateNode={(updates) => updateSelectedNode<EffectRaiserNode>(updates)}
              />
            )}
            {selectedNode.data.kind === 'effect-listener' && (
              <EffectListenerEditor currentEffect={currentEffect ?? null} />
            )}
            {selectedNode.data.kind === 'event-raiser' && (
              <EventRaiserEditor
                node={selectedNode.data.payload as EventRaiserNode}
                availableEvents={availableEvents}
                updateNode={(updates) => updateSelectedNode<EventRaiserNode>(updates)}
              />
            )}
            {selectedNode.data.kind === 'event-listener' && (
              <EventListenerEditor
                node={selectedNode.data.payload as EventListenerNode}
                availableEvents={availableEvents}
                updateNode={(updates) => updateSelectedNode<EventListenerNode>(updates)}
              />
            )}
            {selectedNode.data.kind === 'event' && (
              <EventNodeEditor
                node={selectedNode.data.payload as YargEventNode | AudioEventNodeUnion}
                activeMode={activeMode}
                updateYargNode={(updates) => updateSelectedNode<YargEventNode>(updates)}
                updateAudioNode={(updates) => updateSelectedNode<AudioEventNodeUnion>(updates)}
              />
            )}
            {selectedNode.data.kind === 'logic' && (
              <LogicNodeEditor
                node={selectedNode.data.payload as LogicNode}
                activeMode={activeMode}
                availableVariables={availableVariables}
                updateNode={(updates) => updateSelectedNode<LogicNode>(updates)}
                onSyncVariableValidValues={onSyncVariableValidValues}
              />
            )}
            {selectedNode.data.kind === 'action' && (
              <ActionNodeEditor
                node={selectedNode.data.payload as ActionNode}
                activeMode={activeMode}
                selectedActionHasEventParent={selectedActionHasEventParent}
                availableVariables={availableVariables}
                updateNode={(updates) => updateSelectedNode<ActionNode>(updates)}
              />
            )}
            {selectedNode.data.kind === 'notes' && (
              <NotesNodeEditor
                node={selectedNode.data.payload as NotesNode}
                updateNode={(updates) => updateSelectedNode<NotesNode>(updates)}
              />
            )}
          </div>
        </div>
      )}
    </aside>
  )
}

export default NodeSidebar
