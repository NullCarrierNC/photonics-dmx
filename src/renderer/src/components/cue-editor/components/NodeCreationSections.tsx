import React from 'react'
import type {
  NodeCueKind,
  NodeCueMode,
  LogicNode,
  NodeEffectType,
  YargEventNode,
  AudioEventNode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorMode, NotesVariant } from '../lib/types'
import { getEffectTypesForCueKind } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { getDefaultEventOption } from '../lib/options'
import type { EventOption } from '../lib/types'
import { NODE_DRAG_MIME, serializeNodeDrag, type NodeDragPayload } from '../lib/nodeDragPayload'

const DRAG_CURSOR_CLASSES = 'cursor-grab active:cursor-grabbing'

const makeDragHandlers = (
  payload: NodeDragPayload,
): Pick<React.HTMLAttributes<HTMLButtonElement>, 'onDragStart'> & { draggable: true } => ({
  draggable: true,
  onDragStart: (event) => {
    event.dataTransfer.setData(NODE_DRAG_MIME, serializeNodeDrag(payload))
    event.dataTransfer.effectAllowed = 'copy'
  },
})

const getLogicNodeButtonClasses = (logicType: LogicNode['logicType']): string => {
  const baseClasses = `border-2 rounded px-2 py-1 text-xs hover:opacity-80 transition-opacity ${DRAG_CURSOR_CLASSES}`

  const isArrayNode =
    logicType === 'array-length' ||
    logicType === 'reverse-lights' ||
    logicType === 'create-pairs' ||
    logicType === 'concat-lights' ||
    logicType === 'shuffle-lights' ||
    logicType === 'for-each-light' ||
    logicType === 'reverse-colors' ||
    logicType === 'concat-colors' ||
    logicType === 'shuffle-colors'
  const isDataNode = logicType === 'cue-data' || logicType === 'config-data'
  const isDebugNode = logicType === 'debugger'

  if (isDebugNode) {
    return `${baseClasses} border-red-400 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-100`
  }
  if (isArrayNode) {
    return `${baseClasses} border-teal-400 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-100`
  }
  if (isDataNode) {
    return `${baseClasses} border-orange-800 bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-100`
  }
  // Default: amber for variable, conditional, math, lights-from-index, delay
  return `${baseClasses} border-amber-400 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-100`
}

interface NodeCreationSectionsProps {
  activeMode: NodeCueMode
  cueKind: NodeCueKind
  editorMode: EditorMode
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
}

const EventNodesSection: React.FC<{
  activeMode: NodeCueMode
  cueKind: NodeCueKind
  addEventNode: (
    option: EventOption<YargEventNode['eventType'] | AudioEventNode['eventType']>,
  ) => void
  addEventListenerNode?: () => void
}> = ({ activeMode, cueKind, addEventNode, addEventListenerNode }) => (
  <div>
    <h3 className="font-semibold text-sm mb-2">Event Listeners</h3>
    <div className="grid grid-cols-2 gap-2 text-xs">
      <button
        className={`border-2 border-blue-400 bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-100 rounded px-2 py-1 hover:opacity-80 transition-opacity ${DRAG_CURSOR_CLASSES}`}
        {...makeDragHandlers({ kind: 'system-event' })}
        onClick={() => addEventNode(getDefaultEventOption(activeMode, cueKind))}>
        System Event Listener
      </button>
      {addEventListenerNode && (
        <button
          className={`border-2 border-purple-400 bg-purple-50 dark:bg-purple-900/40 text-purple-800 dark:text-purple-100 rounded px-2 py-1 hover:opacity-80 transition-opacity ${DRAG_CURSOR_CLASSES}`}
          {...makeDragHandlers({ kind: 'event-listener' })}
          onClick={() => addEventListenerNode()}>
          Custom Event Listener
        </button>
      )}
    </div>
  </div>
)

const EffectListenerSection: React.FC<{
  addEffectListenerNode: () => void
}> = ({ addEffectListenerNode }) => (
  <div>
    <h3 className="font-semibold text-sm mb-2">Effect Entry</h3>
    <div className="grid grid-cols-3 gap-2 text-xs">
      <button
        className={`border-2 border-cyan-500 bg-cyan-100 dark:bg-cyan-800/60 text-cyan-900 dark:text-cyan-50 rounded px-2 py-1 hover:opacity-80 transition-opacity ${DRAG_CURSOR_CLASSES}`}
        {...makeDragHandlers({ kind: 'effect-listener' })}
        onClick={() => addEffectListenerNode()}>
        Effect Listener
      </button>
    </div>
  </div>
)

const ActionNodesSection: React.FC<{
  cueKind: NodeCueKind
  editorMode: EditorMode
  addActionNode: (effect: NodeEffectType) => void
}> = ({ cueKind, editorMode, addActionNode }) => {
  const effectTypes = getEffectTypesForCueKind(editorMode === 'effect' ? 'lighting' : cueKind)
  return (
    <div>
      <h3 className="font-semibold text-sm mb-2">Action Nodes</h3>
      <div className="grid grid-cols-3 gap-2 text-xs">
        {effectTypes.map((effect) => (
          <button
            key={effect}
            className={`border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded px-2 py-1 hover:opacity-80 transition-opacity ${DRAG_CURSOR_CLASSES}`}
            {...makeDragHandlers({ kind: 'action', effectType: effect })}
            onClick={() => addActionNode(effect)}>
            {effect}
          </button>
        ))}
      </div>
    </div>
  )
}

const LogicNodesSection: React.FC<{
  addLogicNode: (logicType: LogicNode['logicType']) => void
}> = ({ addLogicNode }) => (
  <div>
    <h3 className="font-semibold text-sm mb-2">Logic Nodes</h3>
    <div className="grid grid-cols-3 gap-2 text-xs">
      {/* Data nodes (orange) */}
      <button
        className={getLogicNodeButtonClasses('config-data')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'config-data' })}
        onClick={() => addLogicNode('config-data')}>
        Config Data
      </button>
      <button
        className={getLogicNodeButtonClasses('cue-data')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'cue-data' })}
        onClick={() => addLogicNode('cue-data')}>
        Cue Data
      </button>
      {/* Logic nodes (amber) */}
      <button
        className={getLogicNodeButtonClasses('conditional')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'conditional' })}
        onClick={() => addLogicNode('conditional')}>
        Conditional
      </button>
      <button
        className={getLogicNodeButtonClasses('delay')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'delay' })}
        onClick={() => addLogicNode('delay')}>
        Delay
      </button>
      <button
        className={getLogicNodeButtonClasses('lights-from-index')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'lights-from-index' })}
        onClick={() => addLogicNode('lights-from-index')}>
        Lights From Index
      </button>
      <button
        className={getLogicNodeButtonClasses('color-from-index')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'color-from-index' })}
        onClick={() => addLogicNode('color-from-index')}>
        Color From Index
      </button>
      <button
        className={getLogicNodeButtonClasses('math')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'math' })}
        onClick={() => addLogicNode('math')}>
        Math
      </button>
      <button
        className={getLogicNodeButtonClasses('random')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'random' })}
        onClick={() => addLogicNode('random')}>
        Random
      </button>
      <button
        className={getLogicNodeButtonClasses('variable')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'variable' })}
        onClick={() => addLogicNode('variable')}>
        Variable
      </button>
      {/* Light operations (teal) */}
      <button
        className={getLogicNodeButtonClasses('array-length')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'array-length' })}
        onClick={() => addLogicNode('array-length')}>
        Array Length
      </button>
      <button
        className={getLogicNodeButtonClasses('concat-lights')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'concat-lights' })}
        onClick={() => addLogicNode('concat-lights')}>
        Concat Lights
      </button>
      <button
        className={getLogicNodeButtonClasses('create-pairs')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'create-pairs' })}
        onClick={() => addLogicNode('create-pairs')}>
        Create Pairs
      </button>
      <button
        className={getLogicNodeButtonClasses('reverse-lights')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'reverse-lights' })}
        onClick={() => addLogicNode('reverse-lights')}>
        Reverse Lights
      </button>
      <button
        className={getLogicNodeButtonClasses('shuffle-lights')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'shuffle-lights' })}
        onClick={() => addLogicNode('shuffle-lights')}>
        Shuffle Lights
      </button>
      <button
        className={getLogicNodeButtonClasses('for-each-light')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'for-each-light' })}
        onClick={() => addLogicNode('for-each-light')}>
        For Each Light
      </button>
      {/* color operations */}
      <button
        className={getLogicNodeButtonClasses('reverse-colors')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'reverse-colors' })}
        onClick={() => addLogicNode('reverse-colors')}>
        Reverse Colors
      </button>
      <button
        className={getLogicNodeButtonClasses('concat-colors')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'concat-colors' })}
        onClick={() => addLogicNode('concat-colors')}>
        Concat Colors
      </button>
      <button
        className={getLogicNodeButtonClasses('shuffle-colors')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'shuffle-colors' })}
        onClick={() => addLogicNode('shuffle-colors')}>
        Shuffle Colors
      </button>
      {/* Debug node (red) */}
      <button
        className={getLogicNodeButtonClasses('debugger')}
        {...makeDragHandlers({ kind: 'logic', logicType: 'debugger' })}
        onClick={() => addLogicNode('debugger')}>
        Debugger
      </button>
    </div>
  </div>
)

const RuntimeEventsSection: React.FC<{
  addEventRaiserNode: () => void
}> = ({ addEventRaiserNode }) => (
  <div>
    <h3 className="font-semibold text-sm mb-2">Runtime Events</h3>
    <div className="grid grid-cols-2 gap-2 text-xs">
      <button
        className={`border-2 border-purple-400 bg-purple-50 dark:bg-purple-900/40 text-purple-800 dark:text-purple-100 rounded px-2 py-1 hover:opacity-80 transition-opacity ${DRAG_CURSOR_CLASSES}`}
        {...makeDragHandlers({ kind: 'event-raiser' })}
        onClick={() => addEventRaiserNode()}>
        Custom Event Raiser
      </button>
    </div>
  </div>
)

const EffectNodesSection: React.FC<{
  addEffectRaiserNode: () => void
}> = ({ addEffectRaiserNode }) => (
  <div>
    <h3 className="font-semibold text-sm mb-2">Effect Nodes</h3>
    <div className="grid grid-cols-2 gap-2 text-xs">
      <button
        className={`border-2 border-cyan-400 bg-cyan-50 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-100 rounded px-2 py-1 hover:opacity-80 transition-opacity ${DRAG_CURSOR_CLASSES}`}
        {...makeDragHandlers({ kind: 'effect-raiser' })}
        onClick={() => addEffectRaiserNode()}>
        Effect Raiser
      </button>
    </div>
  </div>
)

const NotesSection: React.FC<{
  addNotesNode: (variant: NotesVariant) => void
}> = ({ addNotesNode }) => (
  <div>
    <h3 className="font-semibold text-sm mb-2">Documentation</h3>
    <div className="grid grid-cols-3 gap-2 text-xs">
      <button
        className={`border-2 border-blue-400 bg-blue-400 dark:bg-blue-500 text-blue-950 dark:text-blue-950 rounded px-2 py-1 hover:opacity-80 transition-opacity ${DRAG_CURSOR_CLASSES}`}
        {...makeDragHandlers({ kind: 'notes', variant: 'info' })}
        onClick={() => addNotesNode('info')}>
        Info
      </button>
      <button
        className={`border-2 border-yellow-500 bg-yellow-400 dark:bg-yellow-500 text-yellow-900 dark:text-yellow-950 rounded px-2 py-1 hover:opacity-80 transition-opacity font-semibold ${DRAG_CURSOR_CLASSES}`}
        {...makeDragHandlers({ kind: 'notes', variant: 'notes' })}
        onClick={() => addNotesNode('notes')}>
        Notes
      </button>
      <button
        className={`border-2 border-red-400 bg-red-400 dark:bg-red-500 text-red-950 dark:text-red-950 rounded px-2 py-1 hover:opacity-80 transition-opacity ${DRAG_CURSOR_CLASSES}`}
        {...makeDragHandlers({ kind: 'notes', variant: 'important' })}
        onClick={() => addNotesNode('important')}>
        Important
      </button>
    </div>
  </div>
)

const NodeCreationSections: React.FC<NodeCreationSectionsProps> = ({
  activeMode,
  cueKind,
  editorMode,
  addEventNode,
  addActionNode,
  addLogicNode,
  addEventRaiserNode,
  addEventListenerNode,
  addEffectRaiserNode,
  addEffectListenerNode,
  addNotesNode,
}) => {
  return (
    <div className="space-y-4">
      {editorMode === 'cue' && (
        <EventNodesSection
          activeMode={activeMode}
          cueKind={cueKind}
          addEventNode={addEventNode}
          addEventListenerNode={addEventListenerNode}
        />
      )}

      {editorMode === 'effect' && addEffectListenerNode && (
        <EffectListenerSection addEffectListenerNode={addEffectListenerNode} />
      )}

      <ActionNodesSection cueKind={cueKind} editorMode={editorMode} addActionNode={addActionNode} />

      <LogicNodesSection addLogicNode={addLogicNode} />

      {addEventRaiserNode && <RuntimeEventsSection addEventRaiserNode={addEventRaiserNode} />}

      {editorMode === 'cue' && addEffectRaiserNode && (
        <EffectNodesSection addEffectRaiserNode={addEffectRaiserNode} />
      )}

      {addNotesNode && <NotesSection addNotesNode={addNotesNode} />}
    </div>
  )
}

export default NodeCreationSections
