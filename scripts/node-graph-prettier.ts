#!/usr/bin/env node
/**
 * node-graph-prettier
 *
 * Recomputes node positions for every cue or effect in the given JSON files, using the same
 * layout the editor's prettify button runs. Nothing invokes this on its own: it only touches the
 * files named with --file, or the built-in list when none are given, and it writes a .bak first. The layout itself lives in the engine
 * (src/photonics-dmx/cues/node/layout/graphLayout.ts) so a graph laid out here and one laid out
 * in the editor cannot drift apart.
 *
 * Usage:
 *   npm run layout:graphs -- --file <path> [--kind cues|effects] [--id <id>]
 *
 * Options:
 *   --file <path>   JSON file to process. May be repeated. Replaces the built-in list.
 *   --kind <kind>   'cues' or 'effects'. Only needed when it cannot be detected from the file.
 *   --id <id>       Only lay out the cue or effect with this exact id.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { layoutGraph } from '../src/photonics-dmx/cues/node/layout/graphLayout'

type Kind = 'cues' | 'effects'

interface GraphItem {
  id: string
  name?: string
  nodes?: Record<string, unknown>
  connections?: Array<{ from: string; to: string; fromPort?: string; toPort?: string }>
  layout?: { nodePositions: Record<string, { x: number; y: number }> }
}

/** Layouts held as reference examples, which the batch pass leaves alone. */
const SKIP_IDS = new Set(['cue-y1-cool-manual'])

const DATA_BASE = resolve(
  process.env.PHOTONICS_APP_DATA ??
    `${process.env.HOME}/Library/Application Support/Photonics.rocks`,
)

const BUILTIN_FILES: Array<{ path: string; kind: Kind }> = [
  { path: `${DATA_BASE}/node-cues/yarg/yarg-alt1.json`, kind: 'cues' },
  { path: `${DATA_BASE}/node-cues/yarg/yarg-stagekit.json`, kind: 'cues' },
  { path: `${DATA_BASE}/node-cues/yarg/yarg-stagekit-mine.json`, kind: 'cues' },
  { path: `${DATA_BASE}/effects/yarg/yarg-core-effects.json`, kind: 'effects' },
  { path: `${DATA_BASE}/effects/yarg/yarg-stagekit-effects.json`, kind: 'effects' },
  { path: `${DATA_BASE}/effects/yarg/yarg-stagekit-effects-mine.json`, kind: 'effects' },
]

function parseArgs(): {
  files: Array<{ path: string; kind?: Kind }>
  filterById: string | null
} {
  const argv = process.argv.slice(2)
  const files: Array<{ path: string; kind?: Kind }> = []
  let filterById: string | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--file') {
      const value = argv[++i]
      if (!value) throw new Error('--file needs a path')
      files.push({ path: resolve(value) })
    } else if (arg === '--kind') {
      const value = argv[++i]
      if (value !== 'cues' && value !== 'effects') {
        throw new Error("--kind must be 'cues' or 'effects'")
      }
      const last = files[files.length - 1]
      if (!last) throw new Error('--kind must follow a --file')
      last.kind = value
    } else if (arg === '--id') {
      filterById = argv[++i] ?? null
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  return { files, filterById }
}

/** Which key the file carries, when the caller did not say. */
function detectKind(data: Record<string, unknown>): Kind | null {
  const hasCues = Array.isArray(data.cues)
  const hasEffects = Array.isArray(data.effects)
  if (hasCues === hasEffects) return null
  return hasCues ? 'cues' : 'effects'
}

function processFile(filePath: string, kind: Kind, filterById: string | null): boolean {
  console.log(`\nProcessing: ${filePath}`)
  const data = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, GraphItem[]>
  const items = data[kind] ?? []
  let updated = 0
  let matchedRequestedId = false

  for (const item of items) {
    if (filterById && item.id !== filterById) continue
    if (SKIP_IDS.has(item.id)) {
      console.log(`  Skipping ${item.id} (reference layout)`)
      continue
    }

    const next = layoutGraph(
      item.id,
      (item.nodes ?? {}) as Parameters<typeof layoutGraph>[1],
      item.connections,
      item.layout?.nodePositions ?? {},
    )
    if (!('nodePositions' in next)) {
      console.log(`  Skipping ${item.id} (no nodes)`)
      continue
    }

    item.layout = next
    updated++
    if (filterById && item.id === filterById) matchedRequestedId = true
    console.log(`  Laid out ${item.id} (${Object.keys(next.nodePositions).length} nodes)`)
  }

  copyFileSync(filePath, `${filePath}.bak`)
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
  console.log(`  Wrote ${updated} layouts, backup at ${filePath}.bak`)
  return matchedRequestedId
}

function main(): void {
  const { files, filterById } = parseArgs()
  const targets = files.length > 0 ? files : BUILTIN_FILES
  let matchedRequestedId = false

  for (const target of targets) {
    if (!existsSync(target.path)) {
      console.warn(`File not found, skipping: ${target.path}`)
      continue
    }
    let kind = target.kind
    if (!kind) {
      const detected = detectKind(JSON.parse(readFileSync(target.path, 'utf-8')))
      if (!detected) {
        console.error(
          `Cannot tell whether "${target.path}" holds cues or effects. Pass --kind after --file.`,
        )
        process.exit(1)
      }
      kind = detected
      console.log(`  Detected kind: ${kind}`)
    }
    matchedRequestedId = processFile(target.path, kind, filterById) || matchedRequestedId
  }

  if (filterById && !matchedRequestedId) {
    console.warn(`No cue or effect with id "${filterById}" was found.`)
  }
  console.log('\nDone.')
}

main()
