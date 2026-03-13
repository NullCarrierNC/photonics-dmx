#!/usr/bin/env node
/**
 * node-graph-prettier
 *
 * Recomputes X/Y node positions for every cue/effect in the specified JSON files.
 * Follows the exemplar layout conventions:
 *  - cue-started events placed to the LEFT of other events (lower X)
 *  - Primary flow is vertical (top to bottom)
 *  - Conditional branches fan out: true → left column, false → right column
 *  - Parallel independent chains spread horizontally
 *  - Notes float above the graph at negative Y
 *  - Slight random jitter applied to each node so graphs don't look identical
 *
 * Usage:
 *   node scripts/node-graph-prettier.mjs [options]
 *
 * Options:
 *   --file <path>   Absolute or relative path to a JSON file to process directly.
 *                   May be specified multiple times. When given, the built-in file
 *                   list is ignored entirely.
 *   --kind <kind>   'cues' or 'effects'. Required when --file is used and the kind
 *                   cannot be inferred. If omitted the script tries to detect it by
 *                   checking which top-level key ('cues' / 'effects') the file has.
 *   --id <id>       Only process the cue/effect with this exact ID.
 *
 * Examples:
 *   # Process all built-in files
 *   node scripts/node-graph-prettier.mjs
 *
 *   # Process a single arbitrary file (kind auto-detected)
 *   node scripts/node-graph-prettier.mjs --file /path/to/my-cues.json
 *
 *   # Process a specific cue inside an arbitrary file
 *   node scripts/node-graph-prettier.mjs --file /path/to/my-cues.json --id my-cue-id
 *
 *   # Process an arbitrary effects file with explicit kind
 *   node scripts/node-graph-prettier.mjs --file /path/to/my-effects.json --kind effects
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ─── Constants ───────────────────────────────────────────────────────────────

const X_STEP = 260 // horizontal distance between columns
const Y_STEP = 125 // vertical distance between layers
const JITTER_X = 12 // max random x offset
const JITTER_Y = 8 // max random y offset
const NOTES_Y_OFFSET = -200 // notes sit above the graph
const WRAP_DEPTH = 10 // max layers in one column group before wrapping to next column
const GROUP_GAP = 1.5 // extra column-widths of space between groups

// IDs of cues whose layouts should not be touched (the exemplars)
const SKIP_CUE_IDS = new Set(['cue-y1-cool-manual'])

// Event type priority for left-to-right ordering of entry events
// Lower number = further left (cue-started is always leftmost)
const EVENT_TYPE_ORDER = {
  'cue-started': 0,
  'cue-called': 1,
  'beat': 2,
  'measure': 3,
  'keyframe': 4,
  'other': 99,
}

// Base path for built-in data files
const DATA_BASE = resolve('/Users/myriad/Library/Application Support/Photonics.rocks')

const BUILTIN_FILES = [
  { path: `${DATA_BASE}/node-cues/yarg/yarg-alt1.json`, kind: 'cues' },
  { path: `${DATA_BASE}/node-cues/yarg/yarg-stagekit.json`, kind: 'cues' },
  { path: `${DATA_BASE}/node-cues/yarg/yarg-stagekit-mine.json`, kind: 'cues' },
  { path: `${DATA_BASE}/effects/yarg/yarg-core-effects.json`, kind: 'effects' },
  { path: `${DATA_BASE}/effects/yarg/yarg-stagekit-effects.json`, kind: 'effects' },
  { path: `${DATA_BASE}/effects/yarg/yarg-stagekit-effects-mine.json`, kind: 'effects' },
]

// ─── CLI arguments ───────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const explicitFiles = [] // { path, kind? } from --file / --kind pairs
  let pendingFile = null // last --file value waiting for a possible --kind
  let filterById = null

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1] != null) {
      // Flush any previous --file that had no --kind
      if (pendingFile != null) explicitFiles.push({ path: pendingFile, kind: null })
      pendingFile = resolve(args[++i])
    } else if (args[i] === '--kind' && args[i + 1] != null) {
      const kind = args[++i]
      if (kind !== 'cues' && kind !== 'effects') {
        console.error(`--kind must be 'cues' or 'effects', got: "${kind}"`)
        process.exit(1)
      }
      if (pendingFile != null) {
        explicitFiles.push({ path: pendingFile, kind })
        pendingFile = null
      } else {
        console.warn('--kind given without a preceding --file; ignored.')
      }
    } else if (args[i] === '--id' && args[i + 1] != null) {
      filterById = args[++i]
    } else if (args[i] === '--help' || args[i] === '-h') {
      printUsage()
      process.exit(0)
    }
  }
  // Flush a trailing --file with no --kind
  if (pendingFile != null) explicitFiles.push({ path: pendingFile, kind: null })

  return { explicitFiles, filterById }
}

function printUsage() {
  console.log(`
Usage: node scripts/node-graph-prettier.mjs [options]

Options:
  --file <path>   JSON file to process (may be repeated; disables built-in list)
  --kind <kind>   'cues' or 'effects' for the preceding --file (auto-detected if omitted)
  --id   <id>     Only process the cue/effect with this exact ID
  --help          Show this message
`)
}

/**
 * Attempt to detect whether a parsed JSON object is a cues or effects file.
 * Returns 'cues', 'effects', or null if ambiguous.
 */
function detectKind(data) {
  const hasCues = Array.isArray(data.cues)
  const hasEffects = Array.isArray(data.effects)
  if (hasCues && !hasEffects) return 'cues'
  if (hasEffects && !hasCues) return 'effects'
  return null
}

const { explicitFiles, filterById } = parseArgs()

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────

function makeRng(seed) {
  let s = seed >>> 0
  return function () {
    s += 0x6d2b79f5
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function jitter(rng, maxX, maxY) {
  return {
    dx: (rng() * 2 - 1) * maxX,
    dy: (rng() * 2 - 1) * maxY,
  }
}

// ─── Simple string hash for seeding ──────────────────────────────────────────

function hashStr(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// ─── Graph building ───────────────────────────────────────────────────────────

/**
 * Collect all node IDs from the nodes structure.
 * Returns a Map<id, {type, eventType?, logicType?}>
 */
function collectNodes(nodes) {
  const map = new Map()

  for (const n of nodes.events || []) map.set(n.id, { type: n.type, eventType: n.eventType })
  for (const n of nodes.actions || []) map.set(n.id, { type: n.type })
  for (const n of nodes.logic || []) map.set(n.id, { type: n.type, logicType: n.logicType })
  for (const n of nodes.eventRaisers || []) map.set(n.id, { type: n.type })
  for (const n of nodes.eventListeners || []) map.set(n.id, { type: n.type })
  for (const n of nodes.effectRaisers || []) map.set(n.id, { type: n.type })
  for (const n of nodes.effectListeners || []) map.set(n.id, { type: n.type })
  for (const n of nodes.notes || []) map.set(n.id, { type: n.type || 'notes' })

  return map
}

/**
 * Build adjacency lists from connections.
 * Returns { outEdges: Map<id, [{to, fromPort?}]>, inEdges: Map<id, [{from, fromPort?}]> }
 */
function buildGraph(connections, nodeMap) {
  const outEdges = new Map()
  const inEdges = new Map()

  for (const id of nodeMap.keys()) {
    outEdges.set(id, [])
    inEdges.set(id, [])
  }

  for (const conn of connections || []) {
    const { from, to, fromPort } = conn
    if (!nodeMap.has(from) || !nodeMap.has(to)) continue
    outEdges.get(from).push({ to, fromPort })
    inEdges.get(to).push({ from, fromPort })
  }

  return { outEdges, inEdges }
}

// ─── Layer assignment (longest-path layering from sources) ───────────────────

function assignLayers(nodeMap, outEdges, inEdges) {
  // Identify source nodes (no incoming edges, or are event/effect-listener type)
  const layers = new Map()

  // Use longest-path algorithm (iterative Kahn's-style with layer = max(pred)+1)
  // First, topological order via Kahn's algorithm
  const inDegree = new Map()
  for (const id of nodeMap.keys()) inDegree.set(id, inEdges.get(id).length)

  const queue = []
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id)
  }

  // Process in BFS order; if queue empties but nodes remain (cycles), force-add them
  const topoOrder = []
  const visited = new Set()
  while (queue.length > 0) {
    const id = queue.shift()
    if (visited.has(id)) continue
    visited.add(id)
    topoOrder.push(id)
    for (const { to } of outEdges.get(id) || []) {
      inDegree.set(to, inDegree.get(to) - 1)
      if (inDegree.get(to) === 0) queue.push(to)
    }
  }

  // Handle any remaining (cyclic) nodes by appending them
  for (const id of nodeMap.keys()) {
    if (!visited.has(id)) topoOrder.push(id)
  }

  // Assign layer = max(predecessor layers) + 1
  for (const id of topoOrder) {
    const preds = inEdges.get(id) || []
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

// ─── Chain segments (for wrap detection) ────────────────────────────────────────

/**
 * A link A→B is a "chain link" iff outEdges.get(A).length === 1 && inEdges.get(B).length === 1.
 * Returns Map<id, segmentId> where nodes in the same unbroken linear chain share a segmentId.
 */
function detectChainSegments(nodeMap, outEdges, inEdges) {
  const segments = new Map()
  let nextSegmentId = 0

  // Topological order via layers (we need assignLayers first; caller must call after assignLayers)
  const inDegree = new Map()
  for (const id of nodeMap.keys()) inDegree.set(id, inEdges.get(id).length)
  const queue = []
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id)
  }
  const topoOrder = []
  const visited = new Set()
  while (queue.length > 0) {
    const id = queue.shift()
    if (visited.has(id)) continue
    visited.add(id)
    topoOrder.push(id)
    for (const { to } of outEdges.get(id) || []) {
      inDegree.set(to, inDegree.get(to) - 1)
      if (inDegree.get(to) === 0) queue.push(to)
    }
  }
  for (const id of nodeMap.keys()) {
    if (!visited.has(id)) topoOrder.push(id)
  }

  for (const id of topoOrder) {
    const preds = inEdges.get(id) || []
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
      segments.set(id, segments.get(from))
    } else {
      segments.set(id, nextSegmentId++)
    }
  }

  return segments
}

// ─── Group assignment (wrap long chains into new columns) ───────────────────────

/**
 * Walk nodes in topological order. When a single-in, single-out chain node would push
 * depth past WRAP_DEPTH, start a new column group (reset Y). Returns groupOf and layerInGroup.
 */
function assignGroups(_nodeMap, outEdges, inEdges, layers, _chainSegments) {
  const groupOf = new Map()
  const layerInGroup = new Map()

  const byLayer = new Map()
  for (const [id, layer] of layers.entries()) {
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer).push(id)
  }
  const maxLayer = Math.max(...layers.values(), 0)

  for (let layer = 0; layer <= maxLayer; layer++) {
    const nodes = byLayer.get(layer) || []
    for (const id of nodes) {
      const preds = inEdges.get(id) || []

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
      const outs = outEdges.get(from) || []
      const ins = inEdges.get(id) || []
      const isChainNode = outs.length === 1 && ins.length === 1

      if (isChainNode && predLayerInGroup + 1 >= WRAP_DEPTH) {
        groupOf.set(id, predGroup + 1)
        layerInGroup.set(id, 0)
      } else if (outs.length > 1 || ins.length > 1) {
        // Branch or merge: keep same group, place below predecessor (do not reset Y to 0)
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

// ─── Column assignment ────────────────────────────────────────────────────────

/**
 * Assigns columns to nodes.
 * - Entry events are ordered: cue-started leftmost, others right
 * - Conditional `true` output goes to same-or-left column, `false` output to a new right column
 * - When multiple predecessors feed into one node (merge), center between them
 */
function assignColumns(nodeMap, outEdges, inEdges, layers) {
  const cols = new Map()

  // Sort all nodes by layer
  const byLayer = new Map()
  for (const [id, layer] of layers.entries()) {
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer).push(id)
  }

  const maxLayer = Math.max(...layers.values(), 0)

  // Assign entry nodes (layer 0) columns based on event type
  const layer0 = (byLayer.get(0) || []).slice().sort((a, b) => {
    const na = nodeMap.get(a)
    const nb = nodeMap.get(b)
    const orderA =
      na?.type === 'event' || na?.type === 'effect-listener'
        ? EVENT_TYPE_ORDER[na.eventType] ?? EVENT_TYPE_ORDER.other
        : EVENT_TYPE_ORDER.other
    const orderB =
      nb?.type === 'event' || nb?.type === 'effect-listener'
        ? EVENT_TYPE_ORDER[nb.eventType] ?? EVENT_TYPE_ORDER.other
        : EVENT_TYPE_ORDER.other
    return orderA - orderB
  })

  layer0.forEach((id, i) => cols.set(id, i))

  // For subsequent layers, compute columns from predecessor columns
  for (let layer = 1; layer <= maxLayer; layer++) {
    const nodes = byLayer.get(layer) || []

    for (const id of nodes) {
      const preds = inEdges.get(id) || []

      if (preds.length === 0) {
        // Disconnected node in this layer - place to the right
        const maxCol = Math.max(...[...cols.values()], 0)
        cols.set(id, maxCol + 1)
        continue
      }

      if (preds.length === 1) {
        const { from, fromPort } = preds[0]
        const predCol = cols.get(from) ?? 0

        // Multi-output fan-out: true → left, each → parent col, no-port → spread right, false → right
        const siblings = outEdges.get(from) || []
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
          // No-port (or unknown) outputs: spread predCol, predCol+1, ... when N > 1
          const noPortIdx = noPortSuccessors.findIndex((e) => e.to === id)
          const n = noPortSuccessors.length
          cols.set(id, n > 1 ? predCol + noPortIdx : predCol)
        }
      } else {
        // Multiple predecessors (merge point) - average their columns
        let sum = 0
        for (const { from } of preds) sum += cols.get(from) ?? 0
        cols.set(id, Math.round(sum / preds.length))
      }
    }
  }

  return cols
}

// ─── Resolve column collisions ────────────────────────────────────────────────

/**
 * If two nodes share the same (group, layerInGroup, col), offset one to avoid overlap.
 */
function resolveCollisions(groupOf, layerInGroup, cols) {
  const occupied = new Map() // key: `${group},${layerInGroup},${col}` -> id

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

/**
 * Converts (group, layerInGroup, col) to (x, y) with jitter.
 * Each group gets its own X band; Y uses layerInGroup (resets per group for wrapped chains).
 * Notes/info/important nodes keep existing positions when provided; otherwise use default Y band.
 */
function computePositions(nodeMap, groupOf, layerInGroup, cols, graphId, existingPositions = {}) {
  const positions = {}

  // Per-group column range and cumulative X offset
  const groupMinCol = new Map()
  const groupMaxCol = new Map()
  for (const id of groupOf.keys()) {
    const g = groupOf.get(id) ?? 0
    const c = cols.get(id) ?? 0
    if (!groupMinCol.has(g)) {
      groupMinCol.set(g, c)
      groupMaxCol.set(g, c)
    } else {
      groupMinCol.set(g, Math.min(groupMinCol.get(g), c))
      groupMaxCol.set(g, Math.max(groupMaxCol.get(g), c))
    }
  }
  const maxGroup = groupOf.size > 0 ? Math.max(...groupOf.values()) : 0
  const groupOffsetX = [0]
  for (let g = 0; g < maxGroup; g++) {
    const width = (groupMaxCol.get(g) ?? 0) - (groupMinCol.get(g) ?? 0)
    groupOffsetX[g + 1] = groupOffsetX[g] + (width + GROUP_GAP) * X_STEP
  }

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

    const x = (groupOffsetX[group] ?? 0) + colNorm * X_STEP + dx
    const y = layer * Y_STEP + dy
    positions[id] = { x, y }
  }

  return positions
}

// ─── Viewport calculation ─────────────────────────────────────────────────────

function computeViewport(positions) {
  const xs = Object.values(positions).map((p) => p.x)
  const ys = Object.values(positions).map((p) => p.y)

  if (xs.length === 0) return { x: 0, y: 0, zoom: 0.75 }

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  // Target canvas roughly 1200x800, viewport coords are offsets
  const zoom = 0.75
  return {
    x: -centerX * zoom + 600,
    y: -centerY * zoom + 200,
    zoom,
  }
}

// ─── Main layout function ─────────────────────────────────────────────────────

function layoutGraph(graphId, nodes, connections, existingPositions = {}) {
  const nodeMap = collectNodes(nodes)
  if (nodeMap.size === 0) return {}

  const { outEdges, inEdges } = buildGraph(connections, nodeMap)

  // Separate notes (incl. info/important) - they don't participate in graph layout; positions preserved
  const noteIds = [...nodeMap.entries()].filter(([, m]) => m.type === 'notes').map(([id]) => id)
  const noteSet = new Set(noteIds)

  // Build a filtered nodeMap without notes for graph layout
  const graphNodeMap = new Map([...nodeMap.entries()].filter(([id]) => !noteSet.has(id)))

  // Graph layout (notes excluded)
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

  const positions = computePositions(
    nodeMap,
    groupOf,
    layerInGroup,
    cols,
    graphId,
    existingPositions,
  )
  const viewport = computeViewport(
    Object.fromEntries(Object.entries(positions).filter(([id]) => !noteSet.has(id))),
  )

  return { nodePositions: positions, viewport }
}

// ─── File processing ──────────────────────────────────────────────────────────

/**
 * @param {string} filePath
 * @param {string} kind - 'cues' or 'effects'
 * @param {string | null} filterById - If set, only process the item with this id.
 * @returns {boolean | undefined} True if filterById was requested and we processed it; undefined otherwise.
 */
function processFile(filePath, kind, filterById = null) {
  console.log(`\nProcessing: ${filePath}`)

  const raw = readFileSync(filePath, 'utf-8')
  const data = JSON.parse(raw)

  const items = data[kind] || []
  let updated = 0
  let processedRequestedId = false

  for (const item of items) {
    if (filterById && item.id !== filterById) continue

    if (SKIP_CUE_IDS.has(item.id)) {
      console.log(`  Skipping ${item.id} (exemplar)`)
      continue
    }

    const nodes = item.nodes || {}
    const connections = item.connections || []
    const existingPositions = item.layout?.nodePositions ?? {}
    const newLayout = layoutGraph(item.id, nodes, connections, existingPositions)

    if (Object.keys(newLayout).length === 0) {
      console.log(`  Skipping ${item.id} (no nodes)`)
      continue
    }

    item.layout = newLayout
    updated++
    if (filterById && item.id === filterById) processedRequestedId = true
    console.log(
      `  Laid out: ${item.id} (${item.name}) — ${Object.keys(newLayout.nodePositions).length} nodes`,
    )
  }

  // Write backup then update
  const backupPath = filePath + '.bak'
  copyFileSync(filePath, backupPath)

  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`  Wrote ${updated} layouts → ${filePath}`)
  console.log(`  Backup → ${backupPath}`)

  return filterById ? processedRequestedId : undefined
}

// ─── Build the list of files to process ──────────────────────────────────────

/**
 * Resolve the final list of { path, kind } entries to process.
 * When --file arguments were provided they fully replace the built-in list.
 * For each explicit file with no --kind, we auto-detect from the JSON content.
 */
function resolveFilesToProcess(explicitFiles) {
  if (explicitFiles.length === 0) return BUILTIN_FILES

  const resolved = []
  for (const { path: filePath, kind } of explicitFiles) {
    if (!existsSync(filePath)) {
      console.warn(`File not found, skipping: ${filePath}`)
      continue
    }
    let resolvedKind = kind
    if (!resolvedKind) {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'))
      resolvedKind = detectKind(data)
      if (!resolvedKind) {
        console.error(
          `Cannot detect kind for "${filePath}" — it has both or neither 'cues'/'effects' keys.\n` +
            `Pass --kind cues  or  --kind effects after --file to specify it explicitly.`,
        )
        process.exit(1)
      }
      console.log(`  Auto-detected kind: ${resolvedKind} for ${filePath}`)
    }
    resolved.push({ path: filePath, kind: resolvedKind })
  }
  return resolved
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const filesToProcess = resolveFilesToProcess(explicitFiles)

let idWasFound = false
for (const { path, kind } of filesToProcess) {
  if (!existsSync(path)) {
    console.warn(`File not found, skipping: ${path}`)
    continue
  }
  const found = processFile(path, kind, filterById)
  if (found !== undefined) idWasFound = idWasFound || found
}

if (filterById && !idWasFound) {
  console.warn(`No cue/effect with id "${filterById}" was found in the processed file(s).`)
}

console.log('\nDone.')
