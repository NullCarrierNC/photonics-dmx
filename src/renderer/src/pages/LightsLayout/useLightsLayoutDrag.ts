/**
 * Dragging lights around the layout canvas.
 *
 * A drag inside one row reorders it, a drag across rows swaps the two lights rather than pushing
 * one along. The drop animation aims at the rectangle the pointer was last over, so a light lands
 * where it was dropped instead of sliding back to its own slot first.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type ClientRect,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { DmxLight } from '../../../../photonics-dmx/types'
import { reorderWithinGroup, swapAcrossGroups } from './lightLayoutDnd'

export interface LightsLayoutDrag {
  sensors: ReturnType<typeof useSensors>
  /** The light under the pointer, for the drag overlay, or null when nothing is being dragged. */
  activeDragLight: DmxLight | null
  dropAnimation: DropAnimation
  onDragStart: (event: DragStartEvent) => void
  onDragOver: (event: DragOverEvent) => void
  onDragEnd: (event: DragEndEvent) => void
  onDragCancel: () => void
}

export function useLightsLayoutDrag(
  allPrimaryLights: DmxLight[],
  setAllPrimaryLights: React.Dispatch<React.SetStateAction<DmxLight[]>>,
): LightsLayoutDrag {
  const [activeDragLight, setActiveDragLight] = useState<DmxLight | null>(null)
  const overRectRef = useRef<ClientRect | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      overRectRef.current = null
      const id = String(event.active.id)
      setActiveDragLight(allPrimaryLights.find((l) => l.id === id) ?? null)
    },
    [allPrimaryLights],
  )

  const onDragOver = useCallback((event: DragOverEvent) => {
    overRectRef.current = event.over?.rect ?? null
  }, [])

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragLight(null)
      const { active, over } = event
      overRectRef.current = null
      if (!over || active.id === over.id) return
      const sourceGroup = active.data.current?.group as 'front' | 'back' | undefined
      const targetGroup = over.data.current?.group as 'front' | 'back' | undefined
      if (!sourceGroup || !targetGroup) return
      setAllPrimaryLights((prev) =>
        sourceGroup === targetGroup
          ? reorderWithinGroup(prev, sourceGroup, String(active.id), String(over.id))
          : swapAcrossGroups(prev, String(active.id), String(over.id)),
      )
    },
    [setAllPrimaryLights],
  )

  const onDragCancel = useCallback(() => {
    setActiveDragLight(null)
    overRectRef.current = null
  }, [])

  const dropAnimation: DropAnimation = useMemo(
    () => ({
      duration: 220,
      easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
      keyframes: ({ active, transform }) => {
        const target = overRectRef.current
        const source = active.rect
        if (!target || !source) {
          return [
            { transform: CSS.Transform.toString(transform.initial) },
            { transform: CSS.Transform.toString(transform.final) },
          ]
        }
        const dx = target.left - source.left
        const dy = target.top - source.top
        return [
          { transform: CSS.Transform.toString(transform.initial) },
          { transform: `translate3d(${dx}px, ${dy}px, 0)` },
        ]
      },
      sideEffects: defaultDropAnimationSideEffects({
        styles: { active: { opacity: '0' } },
      }),
    }),
    [],
  )

  return {
    sensors,
    activeDragLight,
    dropAnimation,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  }
}
