import React, { useCallback } from 'react'
import {
  type AudioEventNode,
  type EventRaiserNode,
  type EventListenerNode,
  type LogicNode,
  type NodeCueKind,
  type NodeCueMode,
  type NodeEffectType,
  type NetEventNode,
  type NotesNode,
  type EffectRaiserNode,
  type EffectEventListenerNode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { createId, buildDefaultAction, buildDefaultAudioTrigger } from '../lib/cueDefaults'
import type { EditorNode, EventOption, NotesVariant } from '../lib/types'
import { getDefaultEventOption } from '../lib/options'

type UseNodeCreationParams = {
  nodes: Array<{ id: string; position: { x: number; y: number } }>
  setNodes: React.Dispatch<React.SetStateAction<EditorNode[]>>
  activeMode: NodeCueMode
  cueKind: NodeCueKind
  setIsDirty: (dirty: boolean) => void
}

import { LOGIC_NODE_FACTORIES } from '../lib/logicNodeFactories'

const useNodeCreation = ({
  nodes,
  setNodes,
  activeMode,
  cueKind,
  setIsDirty,
}: UseNodeCreationParams) => {
  const findAvailablePosition = useCallback(
    (
      preferredX: number,
      preferredY: number,
      nodeWidth: number = 150,
      nodeHeight: number = 80,
      useExactPosition: boolean = false,
    ): { x: number; y: number } => {
      const padding = 20
      const gridSize = 50

      const checkOverlap = (posX: number, posY: number): boolean => {
        return nodes.some((node) => {
          const nodeRight = node.position.x + nodeWidth
          const nodeBottom = node.position.y + nodeHeight
          const newRight = posX + nodeWidth
          const newBottom = posY + nodeHeight

          return !(
            posX >= nodeRight + padding ||
            newRight <= node.position.x - padding ||
            posY >= nodeBottom + padding ||
            newBottom <= node.position.y - padding
          )
        })
      }

      if (useExactPosition) {
        if (!checkOverlap(preferredX, preferredY)) {
          return { x: preferredX, y: preferredY }
        }

        const smallOffsets = [
          { x: 0, y: 0 },
          { x: nodeWidth + padding, y: 0 },
          { x: -(nodeWidth + padding), y: 0 },
          { x: 0, y: nodeHeight + padding },
          { x: 0, y: -(nodeHeight + padding) },
        ]

        for (const offset of smallOffsets) {
          const testX = preferredX + offset.x
          const testY = preferredY + offset.y
          if (!checkOverlap(testX, testY)) {
            return { x: testX, y: testY }
          }
        }
      }

      const x = Math.round(preferredX / gridSize) * gridSize
      const y = Math.round(preferredY / gridSize) * gridSize

      if (!checkOverlap(x, y)) {
        return { x, y }
      }

      const maxAttempts = 50
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const radius = attempt * gridSize
        const positions = [
          { x: preferredX + radius, y: preferredY },
          { x: preferredX - radius, y: preferredY },
          { x: preferredX, y: preferredY + radius },
          { x: preferredX, y: preferredY - radius },
          { x: preferredX + radius, y: preferredY + radius },
          { x: preferredX - radius, y: preferredY - radius },
          { x: preferredX + radius, y: preferredY - radius },
          { x: preferredX - radius, y: preferredY + radius },
        ]

        for (const pos of positions) {
          const gridX = Math.round(pos.x / gridSize) * gridSize
          const gridY = Math.round(pos.y / gridSize) * gridSize
          if (!checkOverlap(gridX, gridY)) {
            return { x: gridX, y: gridY }
          }
        }
      }

      if (nodes.length > 0) {
        const rightmostNode = nodes.reduce((prev, curr) =>
          curr.position.x > prev.position.x ? curr : prev,
        )
        return {
          x: rightmostNode.position.x + nodeWidth + padding,
          y: rightmostNode.position.y,
        }
      }

      return { x, y }
    },
    [nodes],
  )

  const logicNodeFactories = LOGIC_NODE_FACTORIES

  const addEventNode = useCallback(
    (
      option?: EventOption<NetEventNode['eventType'] | AudioEventNode['eventType']>,
      position?: { x: number; y: number },
    ) => {
      const nodeMode = activeMode
      const newEventId = `event-${createId()}`
      const defaultOption = option ?? getDefaultEventOption(nodeMode, cueKind)
      const nodeWidth = 150
      const nodeHeight = 80
      const centeredPosition = position
        ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 }
        : undefined
      const pos = centeredPosition
        ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true)
        : findAvailablePosition(120, 80)
      const newNode: EditorNode = {
        id: newEventId,
        type: 'event',
        position: pos,
        data: {
          kind: 'event',
          label:
            nodeMode === 'audio' && defaultOption.value === 'audio-trigger'
              ? 'Audio Trigger'
              : defaultOption.label,
          payload:
            // RB3 nodes are YARG-shaped; only audio uses the threshold/triggerMode shape.
            nodeMode !== 'audio'
              ? {
                  id: newEventId,
                  type: 'event',
                  eventType: defaultOption.value as NetEventNode['eventType'],
                }
              : defaultOption.value === 'audio-trigger'
                ? buildDefaultAudioTrigger(newEventId)
                : {
                    id: newEventId,
                    type: 'event',
                    eventType: defaultOption.value as AudioEventNode['eventType'],
                    threshold: 0.5,
                    triggerMode: 'edge',
                  },
        },
      }
      setNodes((nds) => [...nds, newNode])
      setIsDirty(true)
    },
    [activeMode, cueKind, findAvailablePosition, setIsDirty, setNodes],
  )

  const addActionNode = useCallback(
    (effectType: NodeEffectType, position?: { x: number; y: number }) => {
      const action = { ...buildDefaultAction(), id: `action-${createId()}`, effectType }
      const nodeWidth = 150
      const nodeHeight = 80
      const centeredPosition = position
        ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 }
        : undefined
      const pos = centeredPosition
        ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true)
        : findAvailablePosition(480, 160)
      const newNode: EditorNode = {
        id: action.id,
        type: 'action',
        position: pos,
        data: {
          kind: 'action',
          label: effectType,
          payload: action,
        },
      }
      setNodes((nds) => [...nds, newNode])
      setIsDirty(true)
    },
    [findAvailablePosition, setIsDirty, setNodes],
  )

  const addLogicNode = useCallback(
    (logicType: LogicNode['logicType'], position?: { x: number; y: number }) => {
      const id = `logic-${createId()}`
      const payload = logicNodeFactories[logicType](id)

      const nodeWidth = 150
      const nodeHeight = 80
      const centeredPosition = position
        ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 }
        : undefined
      const pos = centeredPosition
        ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true)
        : findAvailablePosition(320, 120)
      const newNode: EditorNode = {
        id,
        type: 'logic',
        position: pos,
        data: {
          kind: 'logic',
          label: logicType,
          payload,
        },
      }

      setNodes((nds) => [...nds, newNode])
      setIsDirty(true)
    },
    [findAvailablePosition, logicNodeFactories, setIsDirty, setNodes],
  )

  const addEventRaiserNode = useCallback(
    (position?: { x: number; y: number }) => {
      const id = `event-raiser-${createId()}`
      const payload: EventRaiserNode = {
        id,
        type: 'event-raiser',
        eventName: '',
        label: 'Raise Event',
        inputs: [],
        outputs: [],
      }

      const nodeWidth = 150
      const nodeHeight = 80
      const centeredPosition = position
        ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 }
        : undefined
      const pos = centeredPosition
        ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true)
        : findAvailablePosition(320, 200)
      const newNode: EditorNode = {
        id,
        type: 'event-raiser',
        position: pos,
        data: {
          kind: 'event-raiser',
          label: 'Raise Event',
          payload,
        },
      }

      setNodes((nds) => [...nds, newNode])
      setIsDirty(true)
    },
    [findAvailablePosition, setIsDirty, setNodes],
  )

  const addEventListenerNode = useCallback(
    (position?: { x: number; y: number }) => {
      const id = `event-listener-${createId()}`
      const payload: EventListenerNode = {
        id,
        type: 'event-listener',
        eventName: '',
        label: 'Listen Event',
        outputs: [],
      }

      const nodeWidth = 150
      const nodeHeight = 80
      const centeredPosition = position
        ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 }
        : undefined
      const pos = centeredPosition
        ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true)
        : findAvailablePosition(120, 280)
      const newNode: EditorNode = {
        id,
        type: 'event-listener',
        position: pos,
        data: {
          kind: 'event-listener',
          label: 'Listen Event',
          payload,
        },
      }

      setNodes((nds) => [...nds, newNode])
      setIsDirty(true)
    },
    [findAvailablePosition, setIsDirty, setNodes],
  )

  const addEffectRaiserNode = useCallback(
    (position?: { x: number; y: number }) => {
      const id = `effect-raiser-${createId()}`
      const payload: EffectRaiserNode = {
        id,
        type: 'effect-raiser',
        effectId: '',
        label: 'Raise Effect',
        outputs: [],
      }

      const nodeWidth = 150
      const nodeHeight = 80
      const centeredPosition = position
        ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 }
        : undefined
      const pos = centeredPosition
        ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true)
        : findAvailablePosition(120, 280)
      const newNode: EditorNode = {
        id,
        type: 'effect-raiser',
        position: pos,
        data: {
          kind: 'effect-raiser',
          label: 'Raise Effect',
          payload,
        },
      }

      setNodes((nds) => [...nds, newNode])
      setIsDirty(true)
    },
    [findAvailablePosition, setIsDirty, setNodes],
  )

  const addEffectListenerNode = useCallback(
    (position?: { x: number; y: number }) => {
      const id = `effect-listener-${createId()}`
      const payload: EffectEventListenerNode = {
        id,
        type: 'effect-listener',
        label: 'Effect Entry',
        outputs: [],
      }

      const nodeWidth = 150
      const nodeHeight = 80
      const centeredPosition = position
        ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 }
        : undefined
      const pos = centeredPosition
        ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true)
        : findAvailablePosition(120, 80)
      const newNode: EditorNode = {
        id,
        type: 'effect-listener',
        position: pos,
        data: {
          kind: 'effect-listener',
          label: 'Effect Entry',
          payload,
        },
      }

      setNodes((nds) => [...nds, newNode])
      setIsDirty(true)
    },
    [findAvailablePosition, setIsDirty, setNodes],
  )

  const addNotesNode = useCallback(
    (variant: NotesVariant = 'notes', position?: { x: number; y: number }) => {
      const normalizedVariant = variant.toLowerCase() as NotesVariant
      const label =
        normalizedVariant === 'info'
          ? 'Info'
          : normalizedVariant === 'important'
            ? 'Important'
            : 'Notes'
      const id = `notes-${createId()}`
      const payload: NotesNode = {
        id,
        type: 'notes',
        label,
        note: '',
        style: normalizedVariant,
      }

      const nodeWidth = 240
      const nodeHeight = 80
      const centeredPosition = position
        ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 }
        : undefined
      const pos = centeredPosition
        ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true)
        : findAvailablePosition(320, 240)
      const newNode: EditorNode = {
        id,
        type: 'notes',
        position: pos,
        data: {
          kind: 'notes',
          label,
          payload,
        },
      }

      setNodes((nds) => [...nds, newNode])
      setIsDirty(true)
    },
    [findAvailablePosition, setIsDirty, setNodes],
  )

  return {
    findAvailablePosition,
    addEventNode,
    addActionNode,
    addLogicNode,
    addEventRaiserNode,
    addEventListenerNode,
    addEffectRaiserNode,
    addEffectListenerNode,
    addNotesNode,
  }
}

export { useNodeCreation }
