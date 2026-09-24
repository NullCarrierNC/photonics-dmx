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

const NOTES_LABELS: Record<NotesVariant, string> = {
  notes: 'Notes',
  info: 'Info',
  important: 'Important',
}

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

  /**
   * Adds a new node and marks the document dirty. A dropped node is centred on the drop point, and
   * one added from a menu goes near its kind's default spot, either way clear of the nodes already
   * there.
   */
  const placeNode = useCallback(
    (
      node: Omit<EditorNode, 'position'>,
      dropAt: { x: number; y: number } | undefined,
      defaultAt: { x: number; y: number },
      nodeWidth = 150,
    ) => {
      const nodeHeight = 80
      const position = dropAt
        ? findAvailablePosition(
            dropAt.x - nodeWidth / 2,
            dropAt.y - nodeHeight / 2,
            nodeWidth,
            nodeHeight,
            true,
          )
        : findAvailablePosition(defaultAt.x, defaultAt.y)
      setNodes((nds) => [...nds, { ...node, position }])
      setIsDirty(true)
    },
    [findAvailablePosition, setIsDirty, setNodes],
  )

  const addEventNode = useCallback(
    (
      option?: EventOption<NetEventNode['eventType'] | AudioEventNode['eventType']>,
      position?: { x: number; y: number },
    ) => {
      const nodeMode = activeMode
      const id = `event-${createId()}`
      const defaultOption = option ?? getDefaultEventOption(nodeMode, cueKind)
      const isAudioTrigger = nodeMode === 'audio' && defaultOption.value === 'audio-trigger'
      placeNode(
        {
          id,
          type: 'event',
          data: {
            kind: 'event',
            label: isAudioTrigger ? 'Audio Trigger' : defaultOption.label,
            payload:
              // RB3 nodes are YARG-shaped. Only audio uses the threshold/triggerMode shape.
              nodeMode !== 'audio'
                ? { id, type: 'event', eventType: defaultOption.value as NetEventNode['eventType'] }
                : isAudioTrigger
                  ? buildDefaultAudioTrigger(id)
                  : {
                      id,
                      type: 'event',
                      eventType: defaultOption.value as AudioEventNode['eventType'],
                      threshold: 0.5,
                      triggerMode: 'edge',
                    },
          },
        },
        position,
        { x: 120, y: 80 },
      )
    },
    [activeMode, cueKind, placeNode],
  )

  const addActionNode = useCallback(
    (effectType: NodeEffectType, position?: { x: number; y: number }) => {
      const action = { ...buildDefaultAction(), id: `action-${createId()}`, effectType }
      placeNode(
        {
          id: action.id,
          type: 'action',
          data: { kind: 'action', label: effectType, payload: action },
        },
        position,
        { x: 480, y: 160 },
      )
    },
    [placeNode],
  )

  const addLogicNode = useCallback(
    (logicType: LogicNode['logicType'], position?: { x: number; y: number }) => {
      const id = `logic-${createId()}`
      placeNode(
        {
          id,
          type: 'logic',
          data: { kind: 'logic', label: logicType, payload: LOGIC_NODE_FACTORIES[logicType](id) },
        },
        position,
        { x: 320, y: 120 },
      )
    },
    [placeNode],
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
      placeNode(
        { id, type: 'event-raiser', data: { kind: 'event-raiser', label: 'Raise Event', payload } },
        position,
        { x: 320, y: 200 },
      )
    },
    [placeNode],
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
      placeNode(
        {
          id,
          type: 'event-listener',
          data: { kind: 'event-listener', label: 'Listen Event', payload },
        },
        position,
        { x: 120, y: 280 },
      )
    },
    [placeNode],
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
      placeNode(
        {
          id,
          type: 'effect-raiser',
          data: { kind: 'effect-raiser', label: 'Raise Effect', payload },
        },
        position,
        { x: 120, y: 280 },
      )
    },
    [placeNode],
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
      placeNode(
        {
          id,
          type: 'effect-listener',
          data: { kind: 'effect-listener', label: 'Effect Entry', payload },
        },
        position,
        { x: 120, y: 80 },
      )
    },
    [placeNode],
  )

  const addNotesNode = useCallback(
    (variant: NotesVariant = 'notes', position?: { x: number; y: number }) => {
      const style = variant.toLowerCase() as NotesVariant
      const label = NOTES_LABELS[style] ?? 'Notes'
      const id = `notes-${createId()}`
      const payload: NotesNode = { id, type: 'notes', label, note: '', style }
      placeNode(
        { id, type: 'notes', data: { kind: 'notes', label, payload } },
        position,
        { x: 320, y: 240 },
        240,
      )
    },
    [placeNode],
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
