import { describe, expect, it } from '@jest/globals'
import { layoutGraph } from './graphPrettier'

const JITTER_Y = 8

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  pad: number,
): boolean {
  return !(ax + aw + pad <= bx || bx + bw + pad <= ax || ay + ah + pad <= by || by + bh + pad <= ay)
}

describe('layoutGraph', () => {
  it('spaces vertical chain so successive rows do not overlap (audio trigger → cue-data → action)', () => {
    const nodes = {
      events: [{ id: 'e1', type: 'event', eventType: 'audio-trigger' }],
      logic: [{ id: 'l1', type: 'logic', logicType: 'cue-data' }],
      actions: [{ id: 'a1', type: 'action' }],
    }
    const connections = [
      { from: 'e1', to: 'l1' },
      { from: 'l1', to: 'a1' },
    ]
    const result = layoutGraph('test-vertical', nodes, connections)
    if (!('nodePositions' in result) || !result.nodePositions) {
      throw new Error('expected layout')
    }
    const p = result.nodePositions
    const hE = 132
    const hL = 96
    const rowGap = 20

    const yE = p.e1.y
    const yL = p.l1.y
    const yA = p.a1.y

    expect(yL - yE).toBeGreaterThanOrEqual(hE + rowGap - 2 * JITTER_Y - 1)
    expect(yA - yL).toBeGreaterThanOrEqual(hL + rowGap - 2 * JITTER_Y - 1)
  })

  it('packs parallel chains into a grid without AABB overlap between segments', () => {
    const events = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      type: 'event' as const,
      eventType: 'audio-trigger' as const,
    }))
    const logic = Array.from({ length: 6 }, (_, i) => ({
      id: `l${i}`,
      type: 'logic' as const,
      logicType: 'cue-data' as const,
    }))
    const actions = Array.from({ length: 6 }, (_, i) => ({
      id: `a${i}`,
      type: 'action' as const,
    }))
    const connections = Array.from({ length: 6 }, (_, i) => [
      { from: `e${i}`, to: `l${i}` },
      { from: `l${i}`, to: `a${i}` },
    ]).flat()

    const result = layoutGraph('test-grid', { events, logic, actions }, connections)
    if (!('nodePositions' in result) || !result.nodePositions) {
      throw new Error('expected layout')
    }
    const p = result.nodePositions

    const w = 180
    const hE = 132
    const hL = 96
    const hA = 128
    const pad = 8

    const segmentBoxes: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = []
    for (let i = 0; i < 6; i++) {
      const ids = [`e${i}`, `l${i}`, `a${i}`] as const
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const id of ids) {
        const pos = p[id]
        let hh = hE
        if (id.startsWith('l')) hh = hL
        if (id.startsWith('a')) hh = hA
        minX = Math.min(minX, pos.x)
        minY = Math.min(minY, pos.y)
        maxX = Math.max(maxX, pos.x + w)
        maxY = Math.max(maxY, pos.y + hh)
      }
      segmentBoxes.push({ minX, minY, maxX, maxY })
    }

    for (let i = 0; i < segmentBoxes.length; i++) {
      for (let j = i + 1; j < segmentBoxes.length; j++) {
        const a = segmentBoxes[i]
        const b = segmentBoxes[j]
        const overlap = rectsOverlap(
          a.minX,
          a.minY,
          a.maxX - a.minX,
          a.maxY - a.minY,
          b.minX,
          b.minY,
          b.maxX - b.minX,
          b.maxY - b.minY,
          pad,
        )
        expect(overlap).toBe(false)
      }
    }
  })
})
