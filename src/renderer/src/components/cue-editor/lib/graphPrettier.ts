/**
 * In-process graph layout (prettier) for node cues/effects.
 * Ported from scripts/node-graph-prettier.mjs. Applies positions in-memory only.
 *
 * Vertical spacing uses per-row max estimated node heights; parallel chain segments
 * in the same layout group are packed into a sqrt grid when multiple segments share one group.
 */

// ─── Types (minimal shape matching cue/effect nodes + connections) ─────────────

export type NodePositions = Record<string, { x: number; y: number }>

export type LayoutResult = {
  nodePositions: NodePositions
  viewport: { x: number; y: number; zoom: number }
}

interface NodeMeta {
  type: string
  eventType?: string
  logicType?: string
}

interface GraphNodesInput {
  events?: Array<{ id: string; type: string; eventType?: string }>
  actions?: Array<{ id: string; type: string }>
  logic?: Array<{ id: string; type: string; logicType?: string }>
  eventRaisers?: Array<{ id: string; type: string }>
  eventListeners?: Array<{ id: string; type: string }>
  effectRaisers?: Array<{ id: string; type: string }>
  effectListeners?: Array<{ id: string; type: string; eventType?: string }>
  notes?: Array<{ id: string; type?: string }>
}

interface ConnectionInput {
  from: string
  to: string
  fromPort?: string
  toPort?: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const X_STEP = 260
/** Minimum vertical pitch when row has no nodes (should not happen); also floors tiny estimates */
const Y_STEP_MIN = 80
const ROW_GAP = 20
const JITTER_X = 12
const JITTER_Y = 8
const NOTES_Y_OFFSET = -160
const WRAP_DEPTH = 10
const GROUP_GAP = 1.5
/** Padding between packed segment bounding boxes (same group) */
const SEG_PACK_H = 32
const SEG_PACK_V = 32

const EVENT_TYPE_ORDER: Record<string, number> = {
  'cue-started': 0,
  'cue-called': 1,
  'beat': 2,
  'measure': 3,
  'keyframe': 4,
  'other': 99,
}

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return function () {
    s += 0x6d2b79f5
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function jitter(rng: () => number, maxX: number, maxY: number): { dx: number; dy: number } {
  return {
    dx: (rng() * 2 - 1) * maxX,
    dy: (rng() * 2 - 1) * maxY,
  }
}

function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// ─── Node size estimates (layout only; matches React node rough dimensions) ───

function estimateNodeSize(meta: NodeMeta): { w: number; h: number } {
  const { type, eventType, logicType } = meta
  if (type === 'notes') return { w: 200, h: 80 }
  if (type === 'action') return { w: 180, h: 128 }
  if (type === 'event' || type === 'effect-listener') {
    if (eventType === 'audio-trigger') return { w: 180, h: 132 }
    return { w: 160, h: 72 }
  }
  if (type === 'logic') {
    const lt = logicType ?? ''
    if (lt === 'conditional' || lt === 'for-each-light') return { w: 200, h: 110 }
    if (lt === 'cue-data' || lt === 'config-data') return { w: 200, h: 96 }
    return { w: 180, h: 88 }
  }
  return { w: 150, h: 80 }
}

function buildRowBaselineStarts(
  groupOf: Map<string, number>,
  layerInGroup: Map<string, number>,
  nodeMap: Map<string, NodeMeta>,
): Map<number, Map<number, number>> {
  const maxLayerByGroup = new Map<number, number>()
  for (const id of groupOf.keys()) {
    const g = groupOf.get(id) ?? 0
    const lg = layerInGroup.get(id) ?? 0
    maxLayerByGroup.set(g, Math.max(maxLayerByGroup.get(g) ?? 0, lg))
  }

  const baselineStarts = new Map<number, Map<number, number>>()

  for (const [g, maxLg] of maxLayerByGroup) {
    const rowHeights: number[] = []
    for (let lg = 0; lg <= maxLg; lg++) {
      let maxH = 0
      for (const id of groupOf.keys()) {
        if ((groupOf.get(id) ?? 0) !== g) continue
        if ((layerInGroup.get(id) ?? 0) !== lg) continue
        const h = estimateNodeSize(nodeMap.get(id)!).h
        if (h > maxH) maxH = h
      }
      rowHeights.push(Math.max(maxH, Y_STEP_MIN))
    }

    const baseline = new Map<number, number>()
    let y = 0
    for (let lg = 0; lg <= maxLg; lg++) {
      baseline.set(lg, y)
      y += rowHeights[lg] + ROW_GAP
    }
    baselineStarts.set(g, baseline)
  }

  return baselineStarts
}

function packSegmentsInGroups(
  positions: NodePositions,
  nodeMap: Map<string, NodeMeta>,
  groupOf: Map<string, number>,
  chainSegs: Map<string, number>,
  graphNodeIds: Set<string>,
): void {
  const nodesBySegment = new Map<number, string[]>()
  for (const id of graphNodeIds) {
    const seg = chainSegs.get(id)
    if (seg === undefined) continue
    if (!nodesBySegment.has(seg)) nodesBySegment.set(seg, [])
    nodesBySegment.get(seg)!.push(id)
  }

  const skipSegment = new Set<number>()
  for (const [seg, ids] of nodesBySegment) {
    const groups = new Set(ids.map((id) => groupOf.get(id) ?? 0))
    if (groups.size !== 1) skipSegment.add(seg)
  }

  const segmentsByGroup = new Map<number, number[]>()
  for (const [seg, ids] of nodesBySegment) {
    if (skipSegment.has(seg)) continue
    const g = groupOf.get(ids[0]) ?? 0
    if (!segmentsByGroup.has(g)) segmentsByGroup.set(g, [])
    segmentsByGroup.get(g)!.push(seg)
  }

  for (const [, segIds] of segmentsByGroup) {
    if (segIds.length < 2) continue

    const sortedSegs = [...segIds].sort((a, b) => {
      const idsA = nodesBySegment.get(a)!
      const idsB = nodesBySegment.get(b)!
      let minYa = Infinity
      let minYb = Infinity
      let minXa = Infinity
      let minXb = Infinity
      for (const id of idsA) {
        const p = positions[id]
        minYa = Math.min(minYa, p.y)
        minXa = Math.min(minXa, p.x)
      }
      for (const id of idsB) {
        const p = positions[id]
        minYb = Math.min(minYb, p.y)
        minXb = Math.min(minXb, p.x)
      }
      return minYa - minYb || minXa - minXb
    })

    const S = sortedSegs.length
    const chainsPerRow = Math.max(1, Math.ceil(Math.sqrt(S)))
    const bboxes = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>()
    let maxW = 0
    let maxH = 0
    for (const seg of sortedSegs) {
      const ids = nodesBySegment.get(seg)!
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const id of ids) {
        const p = positions[id]
        const { w, h } = estimateNodeSize(nodeMap.get(id)!)
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x + w)
        maxY = Math.max(maxY, p.y + h)
      }
      bboxes.set(seg, { minX, minY, maxX, maxY })
      maxW = Math.max(maxW, maxX - minX)
      maxH = Math.max(maxH, maxY - minY)
    }

    const cellW = maxW + SEG_PACK_H
    const cellH = maxH + SEG_PACK_V

    sortedSegs.forEach((seg, i) => {
      const row = Math.floor(i / chainsPerRow)
      const col = i % chainsPerRow
      const targetX = col * cellW
      const targetY = row * cellH
      const bb = bboxes.get(seg)!
      const dx = targetX - bb.minX
      const dy = targetY - bb.minY
      for (const id of nodesBySegment.get(seg)!) {
        const p = positions[id]
        positions[id] = { x: p.x + dx, y: p.y + dy }
      }
    })
  }
}

// ─── Graph building ───────────────────────────────────────────────────────────

function collectNodes(nodes: GraphNodesInput): Map<string, NodeMeta> {
  const map = new Map<string, NodeMeta>()

  for (const n of nodes.events ?? []) map.set(n.id, { type: n.type, eventType: n.eventType })
  for (const n of nodes.actions ?? []) map.set(n.id, { type: n.type })
  for (const n of nodes.logic ?? []) map.set(n.id, { type: n.type, logicType: n.logicType })
  for (const n of nodes.eventRaisers ?? []) map.set(n.id, { type: n.type })
  for (const n of nodes.eventListeners ?? []) map.set(n.id, { type: n.type })
  for (const n of nodes.effectRaisers ?? []) map.set(n.id, { type: n.type })
  for (const n of nodes.effectListeners ?? [])
    map.set(n.id, { type: n.type, eventType: n.eventType })
  for (const n of nodes.notes ?? []) map.set(n.id, { type: n.type ?? 'notes' })

  return map
}

interface EdgeEnd {
  to: string
  fromPort?: string
}
interface EdgeFrom {
  from: string
  fromPort?: string
}

function buildGraph(
  connections: ConnectionInput[] | undefined,
  nodeMap: Map<string, NodeMeta>,
): { outEdges: Map<string, EdgeEnd[]>; inEdges: Map<string, EdgeFrom[]> } {
  const outEdges = new Map<string, EdgeEnd[]>()
  const inEdges = new Map<string, EdgeFrom[]>()

  for (const id of nodeMap.keys()) {
    outEdges.set(id, [])
    inEdges.set(id, [])
  }

  for (const conn of connections ?? []) {
    const { from, to, fromPort } = conn
    if (!nodeMap.has(from) || !nodeMap.has(to)) continue
    outEdges.get(from)!.push({ to, fromPort })
    inEdges.get(to)!.push({ from, fromPort })
  }

  return { outEdges, inEdges }
}

// ─── Layer assignment ─────────────────────────────────────────────────────────

function assignLayers(
  nodeMap: Map<string, NodeMeta>,
  outEdges: Map<string, EdgeEnd[]>,
  inEdges: Map<string, EdgeFrom[]>,
): Map<string, number> {
  const layers = new Map<string, number>()
  const inDegree = new Map<string, number>()
  for (const id of nodeMap.keys()) inDegree.set(id, inEdges.get(id)?.length ?? 0)

  const queue: string[] = []
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id)
  }

  const topoOrder: string[] = []
  const visited = new Set<string>()
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    topoOrder.push(id)
    for (const { to } of outEdges.get(id) ?? []) {
      inDegree.set(to, (inDegree.get(to) ?? 0) - 1)
      if (inDegree.get(to) === 0) queue.push(to)
    }
  }

  for (const id of nodeMap.keys()) {
    if (!visited.has(id)) topoOrder.push(id)
  }

  for (const id of topoOrder) {
    const preds = inEdges.get(id) ?? []
    if (preds.length === 0) {
      layers.set(id, 0)
    } else {
      let maxPredLayer = -1
      for (const { from } of preds) {
        const fl = layers.get(from) ?? 0
        if (fl > maxPredLayer) maxPredLayer = fl
      }
      layers.set(id, maxPredLayer + 1)
    }
  }

  return layers
}

// ─── Chain segments ───────────────────────────────────────────────────────────

function detectChainSegments(
  nodeMap: Map<string, NodeMeta>,
  outEdges: Map<string, EdgeEnd[]>,
  inEdges: Map<string, EdgeFrom[]>,
): Map<string, number> {
  const segments = new Map<string, number>()
  let nextSegmentId = 0

  const inDegree = new Map<string, number>()
  for (const id of nodeMap.keys()) inDegree.set(id, inEdges.get(id)?.length ?? 0)
  const queue: string[] = []
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id)
  }
  const topoOrder: string[] = []
  const visited = new Set<string>()
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    topoOrder.push(id)
    for (const { to } of outEdges.get(id) ?? []) {
      inDegree.set(to, (inDegree.get(to) ?? 0) - 1)
      if (inDegree.get(to) === 0) queue.push(to)
    }
  }
  for (const id of nodeMap.keys()) {
    if (!visited.has(id)) topoOrder.push(id)
  }

  for (const id of topoOrder) {
    const preds = inEdges.get(id) ?? []
    if (preds.length === 0) {
      segments.set(id, nextSegmentId++)
      continue
    }
    if (preds.length > 1) {
      segments.set(id, nextSegmentId++)
      continue
    }
    const from = preds[0].from
    const outCount = outEdges.get(from)?.length ?? 0
    const inCount = inEdges.get(id)?.length ?? 0
    const isChainLink = outCount === 1 && inCount === 1
    if (isChainLink && segments.has(from)) {
      segments.set(id, segments.get(from)!)
    } else {
      segments.set(id, nextSegmentId++)
    }
  }

  return segments
}

// ─── Group assignment ─────────────────────────────────────────────────────────

function assignGroups(
  _nodeMap: Map<string, NodeMeta>,
  outEdges: Map<string, EdgeEnd[]>,
  inEdges: Map<string, EdgeFrom[]>,
  layers: Map<string, number>,
  _chainSegments: Map<string, number>,
): { groupOf: Map<string, number>; layerInGroup: Map<string, number> } {
  const groupOf = new Map<string, number>()
  const layerInGroup = new Map<string, number>()

  const byLayer = new Map<number, string[]>()
  for (const [id, layer] of layers.entries()) {
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer)!.push(id)
  }
  const maxLayer = Math.max(...layers.values(), 0)

  for (let layer = 0; layer <= maxLayer; layer++) {
    const layerNodes = byLayer.get(layer) ?? []
    for (const id of layerNodes) {
      const preds = inEdges.get(id) ?? []

      if (preds.length === 0) {
        groupOf.set(id, 0)
        layerInGroup.set(id, 0)
        continue
      }

      if (preds.length > 1) {
        const predGroups = preds.map((p) => groupOf.get(p.from) ?? 0)
        const predLayers = preds.map((p) => layerInGroup.get(p.from) ?? 0)
        groupOf.set(id, Math.max(...predGroups))
        layerInGroup.set(id, Math.max(...predLayers) + 1)
        continue
      }

      const { from } = preds[0]
      const predGroup = groupOf.get(from) ?? 0
      const predLayerInGroup = layerInGroup.get(from) ?? 0
      const outs = outEdges.get(from) ?? []
      const ins = inEdges.get(id) ?? []
      const isChainNode = outs.length === 1 && ins.length === 1

      if (isChainNode && predLayerInGroup + 1 >= WRAP_DEPTH) {
        groupOf.set(id, predGroup + 1)
        layerInGroup.set(id, 0)
      } else if (outs.length > 1 || ins.length > 1) {
        groupOf.set(id, predGroup)
        layerInGroup.set(id, predLayerInGroup + 1)
      } else {
        groupOf.set(id, predGroup)
        layerInGroup.set(id, predLayerInGroup + 1)
      }
    }
  }

  return { groupOf, layerInGroup }
}

// ─── Column assignment ───────────────────────────────────────────────────────

function assignColumns(
  nodeMap: Map<string, NodeMeta>,
  outEdges: Map<string, EdgeEnd[]>,
  inEdges: Map<string, EdgeFrom[]>,
  layers: Map<string, number>,
): Map<string, number> {
  const cols = new Map<string, number>()
  const byLayer = new Map<number, string[]>()
  for (const [id, layer] of layers.entries()) {
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer)!.push(id)
  }

  const maxLayer = Math.max(...layers.values(), 0)

  const layer0 = (byLayer.get(0) ?? []).slice().sort((a, b) => {
    const na = nodeMap.get(a)
    const nb = nodeMap.get(b)
    const orderA =
      na?.type === 'event' || na?.type === 'effect-listener'
        ? EVENT_TYPE_ORDER[na.eventType ?? ''] ?? EVENT_TYPE_ORDER.other
        : EVENT_TYPE_ORDER.other
    const orderB =
      nb?.type === 'event' || nb?.type === 'effect-listener'
        ? EVENT_TYPE_ORDER[nb.eventType ?? ''] ?? EVENT_TYPE_ORDER.other
        : EVENT_TYPE_ORDER.other
    return orderA - orderB
  })

  layer0.forEach((id, i) => cols.set(id, i))

  for (let layer = 1; layer <= maxLayer; layer++) {
    const layerNodes = byLayer.get(layer) ?? []

    for (const id of layerNodes) {
      const preds = inEdges.get(id) ?? []

      if (preds.length === 0) {
        const colValues = [...cols.values()]
        const maxCol = colValues.length > 0 ? Math.max(...colValues) : 0
        cols.set(id, maxCol + 1)
        continue
      }

      if (preds.length === 1) {
        const { from, fromPort } = preds[0]
        const predCol = cols.get(from) ?? 0
        const siblings = outEdges.get(from) ?? []
        const trueSuccessors = siblings.filter((e) => e.fromPort === 'true')
        const falseSuccessors = siblings.filter((e) => e.fromPort === 'false')
        const eachSuccessors = siblings.filter((e) => e.fromPort === 'each')
        const noPortSuccessors = siblings.filter((e) => !e.fromPort)

        if (fromPort === 'true' && trueSuccessors.length > 0) {
          const trueIdx = trueSuccessors.findIndex((e) => e.to === id)
          cols.set(id, predCol - (trueIdx + 1))
        } else if (fromPort === 'false' && falseSuccessors.length > 0) {
          const falseIdx = falseSuccessors.findIndex((e) => e.to === id)
          cols.set(id, predCol + (falseIdx + 1))
        } else if (fromPort === 'each' && eachSuccessors.length > 0) {
          cols.set(id, predCol)
        } else {
          const noPortIdx = noPortSuccessors.findIndex((e) => e.to === id)
          const n = noPortSuccessors.length
          cols.set(id, n > 1 ? predCol + noPortIdx : predCol)
        }
      } else {
        let sum = 0
        for (const { from } of preds) sum += cols.get(from) ?? 0
        cols.set(id, Math.round(sum / preds.length))
      }
    }
  }

  return cols
}

// ─── Resolve collisions ──────────────────────────────────────────────────────

function resolveCollisions(
  groupOf: Map<string, number>,
  layerInGroup: Map<string, number>,
  cols: Map<string, number>,
): void {
  const occupied = new Map<string, string>()

  const sorted = [...groupOf.keys()].sort((a, b) => {
    const ga = groupOf.get(a) ?? 0
    const gb = groupOf.get(b) ?? 0
    if (ga !== gb) return ga - gb
    return (layerInGroup.get(a) ?? 0) - (layerInGroup.get(b) ?? 0)
  })

  for (const id of sorted) {
    const group = groupOf.get(id) ?? 0
    const layer = layerInGroup.get(id) ?? 0
    let col = cols.get(id) ?? 0
    let key = `${group},${layer},${col}`

    while (occupied.has(key)) {
      col += 1
      key = `${group},${layer},${col}`
    }

    cols.set(id, col)
    occupied.set(key, id)
  }
}

// ─── Final position computation ───────────────────────────────────────────────

function computePositions(
  nodeMap: Map<string, NodeMeta>,
  groupOf: Map<string, number>,
  layerInGroup: Map<string, number>,
  cols: Map<string, number>,
  graphId: string,
  existingPositions: NodePositions = {},
  chainSegs: Map<string, number>,
  graphNodeIds: Set<string>,
): NodePositions {
  const positions: NodePositions = {}

  const groupMinCol = new Map<number, number>()
  const groupMaxCol = new Map<number, number>()
  for (const id of groupOf.keys()) {
    const g = groupOf.get(id) ?? 0
    const c = cols.get(id) ?? 0
    if (!groupMinCol.has(g)) {
      groupMinCol.set(g, c)
      groupMaxCol.set(g, c)
    } else {
      groupMinCol.set(g, Math.min(groupMinCol.get(g)!, c))
      groupMaxCol.set(g, Math.max(groupMaxCol.get(g)!, c))
    }
  }
  const maxGroup = groupOf.size > 0 ? Math.max(...groupOf.values()) : 0
  const groupOffsetX: number[] = [0]
  for (let g = 0; g < maxGroup; g++) {
    const width = (groupMaxCol.get(g) ?? 0) - (groupMinCol.get(g) ?? 0)
    groupOffsetX[g + 1] = groupOffsetX[g] + (width + GROUP_GAP) * X_STEP
  }

  const baselineStarts = buildRowBaselineStarts(groupOf, layerInGroup, nodeMap)

  for (const [id, meta] of nodeMap.entries()) {
    if (meta.type === 'notes') {
      const existing = existingPositions[id]
      positions[id] =
        existing && typeof existing.x === 'number' && typeof existing.y === 'number'
          ? { x: existing.x, y: existing.y }
          : { x: 0, y: NOTES_Y_OFFSET }
      continue
    }

    const group = groupOf.get(id) ?? 0
    const layer = layerInGroup.get(id) ?? 0
    const col = cols.get(id) ?? 0
    const minCol = groupMinCol.get(group) ?? 0
    const colNorm = col - minCol

    const rng = makeRng(hashStr(graphId + id))
    const { dx, dy } = jitter(rng, JITTER_X, JITTER_Y)

    const rowBaseline = baselineStarts.get(group)?.get(layer) ?? 0
    const x = (groupOffsetX[group] ?? 0) + colNorm * X_STEP + dx
    const y = rowBaseline + dy
    positions[id] = { x, y }
  }

  packSegmentsInGroups(positions, nodeMap, groupOf, chainSegs, graphNodeIds)

  return positions
}

// ─── Viewport ─────────────────────────────────────────────────────────────────

function computeViewport(positions: NodePositions): { x: number; y: number; zoom: number } {
  const xs = Object.values(positions).map((p) => p.x)
  const ys = Object.values(positions).map((p) => p.y)

  if (xs.length === 0) return { x: 0, y: 0, zoom: 0.75 }

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const zoom = 0.75
  return {
    x: -centerX * zoom + 600,
    y: -centerY * zoom + 200,
    zoom,
  }
}

// ─── Main layout API ──────────────────────────────────────────────────────────

/**
 * Computes node positions and viewport for the given cue/effect graph.
 * Does not touch the file system. Returns empty object if no nodes.
 */
export function layoutGraph(
  graphId: string,
  nodes: GraphNodesInput,
  connections: ConnectionInput[] | undefined,
  existingPositions: NodePositions = {},
): LayoutResult | Record<string, never> {
  const nodeMap = collectNodes(nodes)
  if (nodeMap.size === 0) return {}

  const { outEdges, inEdges } = buildGraph(connections, nodeMap)

  const noteIds = [...nodeMap.entries()].filter(([, m]) => m.type === 'notes').map(([id]) => id)
  const noteSet = new Set(noteIds)

  const graphNodeMap = new Map([...nodeMap.entries()].filter(([id]) => !noteSet.has(id)))
  const graphOutEdges = new Map([...outEdges.entries()].filter(([id]) => !noteSet.has(id)))
  const graphInEdges = new Map([...inEdges.entries()].filter(([id]) => !noteSet.has(id)))

  const layers = assignLayers(graphNodeMap, graphOutEdges, graphInEdges)
  const chainSegs = detectChainSegments(graphNodeMap, graphOutEdges, graphInEdges)
  const { groupOf, layerInGroup } = assignGroups(
    graphNodeMap,
    graphOutEdges,
    graphInEdges,
    layers,
    chainSegs,
  )
  const cols = assignColumns(graphNodeMap, graphOutEdges, graphInEdges, layers)
  resolveCollisions(groupOf, layerInGroup, cols)

  const graphNodeIds = new Set(graphNodeMap.keys())

  const positions = computePositions(
    nodeMap,
    groupOf,
    layerInGroup,
    cols,
    graphId,
    existingPositions,
    chainSegs,
    graphNodeIds,
  )
  const graphPositions = Object.fromEntries(
    Object.entries(positions).filter(([id]) => !noteSet.has(id)),
  )
  const viewport = computeViewport(graphPositions)

  return { nodePositions: positions, viewport }
}
