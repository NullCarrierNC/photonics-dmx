import { arrayMove } from '@dnd-kit/sortable'
import type { DmxLight } from '../../../../photonics-dmx/types'

function sortByPosition(a: DmxLight, b: DmxLight): number {
  return a.position - b.position
}

/**
 * Reorders lights within a single primary row (front or back), then reassigns global `position` 1..n
 * for all non-strobe lights (front then back). Strobe rows are unchanged and kept at the tail.
 */
export function reorderWithinGroup(
  all: DmxLight[],
  group: 'front' | 'back',
  fromId: string,
  toId: string,
): DmxLight[] {
  const strobe = all.filter((l) => l.group === 'strobe')
  const front = all.filter((l) => l.group === 'front').sort(sortByPosition)
  const back = all.filter((l) => l.group === 'back').sort(sortByPosition)

  const row = group === 'front' ? [...front] : [...back]
  const fromIdx = row.findIndex((l) => l.id === fromId)
  const toIdx = row.findIndex((l) => l.id === toId)
  if (fromIdx < 0 || toIdx < 0) return all

  const reorderedRow = arrayMove(row, fromIdx, toIdx)
  const newFront = group === 'front' ? reorderedRow : front
  const newBack = group === 'back' ? reorderedRow : back
  const recombined = [...newFront, ...newBack].map((l, i) => ({ ...l, position: i + 1 }))
  return [...recombined, ...strobe]
}

/**
 * Pairwise swap of two primary lights: they trade `group` and `position`. No other rows change.
 */
export function swapAcrossGroups(all: DmxLight[], aId: string, bId: string): DmxLight[] {
  const a = all.find((l) => l.id === aId)
  const b = all.find((l) => l.id === bId)
  if (!a || !b) return all
  if (a.group === 'strobe' || b.group === 'strobe') return all
  if (a.group !== 'front' && a.group !== 'back') return all
  if (b.group !== 'front' && b.group !== 'back') return all
  if (a.group === b.group) return all

  const groupA = a.group as 'front' | 'back'
  const groupB = b.group as 'front' | 'back'
  const posA = a.position
  const posB = b.position

  return all.map((l) => {
    if (l.id === aId) return { ...l, group: groupB, position: posB }
    if (l.id === bId) return { ...l, group: groupA, position: posA }
    return l
  })
}
