/**
 * Audits the shipped corpus and the engine's naming.
 *
 * The first half keeps every bundled cue inside the vocabulary its mode advertises, so the editor
 * lists and what the files actually author cannot drift apart. The second half keeps game-specific
 * names out of the shared engine: the whole point of the domain split is that a fix for one mode
 * does not land in a file named for another.
 */

import { describe, expect, it } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { getCueDomain } from '../../../cues/domains'
import type { NodeCueMode } from '../../../cues/types/nodeCueTypes'

const SRC = path.resolve(__dirname, '../../..')
const CUE_ROOT = path.resolve(__dirname, '../../../../../resources/defaults/node-data/cues')

interface LogicNode {
  logicType?: string
  dataProperty?: string
}
interface EventNodeJson {
  eventType?: string
}
interface CueJson {
  nodes?: { events?: EventNodeJson[]; logic?: LogicNode[] }
}

const modesOnDisk = (): NodeCueMode[] =>
  fs
    .readdirSync(CUE_ROOT)
    .filter((m) => fs.statSync(path.join(CUE_ROOT, m)).isDirectory()) as NodeCueMode[]

const cuesFor = (mode: NodeCueMode): { file: string; cue: CueJson }[] =>
  fs
    .readdirSync(path.join(CUE_ROOT, mode))
    .filter((f) => f.endsWith('.json'))
    .flatMap((file) => {
      const parsed = JSON.parse(fs.readFileSync(path.join(CUE_ROOT, mode, file), 'utf8'))
      return (parsed.cues ?? []).map((cue: CueJson) => ({ file, cue }))
    })

describe('bundled cues stay inside their mode vocabulary', () => {
  const modes = modesOnDisk()

  it('finds every mode on disk', () => {
    // Without this the per-mode cases below would pass by iterating nothing.
    expect(modes.length).toBeGreaterThan(0)
  })

  for (const mode of modes) {
    it(`${mode} authors only event types its domain allows`, () => {
      const allowed = new Set(getCueDomain(mode).eventTypes)
      const offenders = cuesFor(mode)
        .flatMap(({ file, cue }) =>
          (cue.nodes?.events ?? []).map((e) => ({ file, eventType: e.eventType })),
        )
        .filter((e) => e.eventType && !allowed.has(e.eventType))
      expect(offenders).toEqual([])
    })

    it(`${mode} reads only cue-data properties its domain allows`, () => {
      // config-data nodes share the `dataProperty` field but resolve against the rig, not the frame,
      // so only cue-data nodes are in scope here.
      const allowed = new Set(getCueDomain(mode).cueDataProperties)
      const offenders = cuesFor(mode)
        .flatMap(({ file, cue }) =>
          (cue.nodes?.logic ?? [])
            .filter((n) => n.logicType === 'cue-data' && n.dataProperty)
            .map((n) => ({ file, property: n.dataProperty as string })),
        )
        .filter((n) => !allowed.has(n.property))
      expect(offenders).toEqual([])
    })
  }
})

/** Every .ts under the engine, excluding tests. */
function engineSources(dir = SRC, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'tests') continue
      engineSources(full, acc)
    } else if (entry.name.endsWith('.ts')) {
      acc.push(full)
    }
  }
  return acc
}

/**
 * Where a game name is still correct: the YARG listener and its packet parsing, the effect trees
 * that really are keyed `yarg` on disk, the mode-pinned validators, the editor's per-mode lists, and
 * the two dwell schedulers that genuinely schedule game mode.
 */
const ALLOWED = [
  /^listeners\/YARG\//,
  /^processors\/Rb3/,
  /^cues\/registries\/Rb3/,
  /Rb3GameModeManager|AudioGameModeManager/,
]
const ALLOWED_NAMES =
  /^(YargCueData|YargNetworkListener|YargParseResult|YargParseRejectReason|parseYargPacket|YargEffectFile|YargEffectDefinition|CompiledYargEffect|compileYargEffect|validateYargEffectFile|validateYargEffectSchema|validateYargNodeCueFile|validateYargSchema|getYargEventCategories)$/

describe('the engine carries no stale game names', () => {
  const files = engineSources()

  it('reads the engine sources', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each([
    // Any Yarg-named identifier outside the allow-list below.
    ['Yarg', /\b[A-Za-z_]*Yarg[A-Za-z_]*\b/g],
    // Only where Game names the cue family. Game mode is a real feature (Audio Game Mode versus
    // manual), so `AudioGameModeManager` and `Gameplay` are correct and must not trip this.
    ['Game as a family name', /\b[A-Za-z_]*Game(Cue|Event|Node)[A-Za-z_]*\b/gi],
  ])('no unexpected %s identifier', (_label, pattern) => {
    const offenders: string[] = []
    for (const full of files) {
      const rel = path.relative(SRC, full)
      if (ALLOWED.some((r) => r.test(rel))) continue
      const source = fs.readFileSync(full, 'utf8')
      for (const match of source.match(pattern) ?? []) {
        if (ALLOWED_NAMES.test(match)) continue
        offenders.push(`${rel}: ${match}`)
      }
    }
    expect([...new Set(offenders)]).toEqual([])
  })
})
