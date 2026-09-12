/**
 * Every bundled cue and effect file, loaded onto the canvas and saved straight back. The canvas
 * drops any connection the editor refuses, so the bundled connections have to come back intact.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from '@jest/globals'
import {
  cueToFlow,
  effectToFlow,
  updateDocumentFromFlow,
  updateEffectDocumentFromFlow,
} from './cueTransforms'
import type {
  AudioEffectDefinition,
  EffectFile,
  NodeCueFile,
  YargEffectDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

const NODE_DATA = join(__dirname, '../../../../../../resources/defaults/node-data')

function bundled<T>(kind: 'cues' | 'effects'): Array<[string, T]> {
  const root = join(NODE_DATA, kind)
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap(({ name: mode }) =>
      readdirSync(join(root, mode))
        .filter((file) => file.endsWith('.json'))
        .map((file): [string, T] => [
          `${mode}/${file}`,
          JSON.parse(readFileSync(join(root, mode, file), 'utf8')) as T,
        ]),
    )
}

/** Loads each cue of a file onto the canvas and saves it back into the file. */
function roundTripCues(file: NodeCueFile): NodeCueFile {
  let saved = file
  for (const cue of file.cues) {
    const { nodes, edges } = cueToFlow(cue)
    saved = updateDocumentFromFlow(
      { mode: 'cue', file: saved, path: null },
      cue,
      nodes,
      edges,
      null,
    )!
  }
  return saved
}

/** Loads each effect of a file onto the canvas and saves it back into the file. */
function roundTripEffects(file: EffectFile): EffectFile {
  let saved = file
  for (const effect of file.effects as Array<YargEffectDefinition | AudioEffectDefinition>) {
    const { nodes, edges } = effectToFlow(effect)
    saved = updateEffectDocumentFromFlow(
      { mode: 'effect', file: saved, path: null },
      effect,
      nodes,
      edges,
      null,
    )!
  }
  return saved
}

function nodeIds(nodes: object): string[] {
  const ids = (Object.values(nodes) as Array<Array<{ id: string }> | undefined>)
    .flatMap((list) => list ?? [])
    .map((n) => n.id)
  return [...new Set(ids)].sort()
}

const CUE_FILES = bundled<NodeCueFile>('cues')
const EFFECT_FILES = bundled<EffectFile>('effects')

describe.each(CUE_FILES)('cue file %s through the canvas and back', (_name, file) => {
  it('keeps every node and connection', () => {
    const saved = roundTripCues(file)
    saved.cues.forEach((cue, i) => {
      const original = file.cues[i]!
      expect(cue.id).toBe(original.id)
      expect(cue.nodes.events.map((e) => e.id)).toEqual(original.nodes.events.map((e) => e.id))
      expect(cue.nodes.actions).toEqual(original.nodes.actions)
      expect(cue.nodes.logic).toEqual(original.nodes.logic ?? [])
      expect(cue.nodes.eventRaisers).toEqual(original.nodes.eventRaisers ?? [])
      expect(cue.nodes.eventListeners).toEqual(original.nodes.eventListeners ?? [])
      expect(cue.nodes.effectRaisers).toEqual(original.nodes.effectRaisers ?? [])
      expect(cue.nodes.notes).toEqual(original.nodes.notes ?? [])
      expect(cue.connections).toEqual(original.connections)
    })
  })

  it('gives every node a position', () => {
    for (const cue of roundTripCues(file).cues) {
      expect(Object.keys(cue.layout?.nodePositions ?? {}).sort()).toEqual(nodeIds(cue.nodes))
    }
  })

  it('saves the same file a second time', () => {
    const saved = roundTripCues(file)
    expect(roundTripCues(saved)).toEqual(saved)
  })
})

describe.each(EFFECT_FILES)('effect file %s through the canvas and back', (_name, file) => {
  it('keeps every node and connection', () => {
    const saved = roundTripEffects(file)
    saved.effects.forEach((effect, i) => {
      const original = file.effects[i]!
      expect(effect.id).toBe(original.id)
      expect((effect.nodes.events ?? []).map((e) => e.id)).toEqual(
        (original.nodes.events ?? []).map((e) => e.id),
      )
      expect(effect.nodes.actions).toEqual(original.nodes.actions)
      expect(effect.nodes.logic).toEqual(original.nodes.logic ?? [])
      expect(effect.nodes.eventRaisers).toEqual(original.nodes.eventRaisers ?? [])
      expect(effect.nodes.eventListeners).toEqual(original.nodes.eventListeners ?? [])
      expect(effect.nodes.effectListeners).toEqual(original.nodes.effectListeners ?? [])
      expect(effect.nodes.notes).toEqual(original.nodes.notes ?? [])
      expect(effect.connections).toEqual(original.connections)
    })
  })

  it('gives every node a position', () => {
    for (const effect of roundTripEffects(file).effects) {
      expect(Object.keys(effect.layout?.nodePositions ?? {}).sort()).toEqual(nodeIds(effect.nodes))
    }
  })

  it('saves the same file a second time', () => {
    const saved = roundTripEffects(file)
    expect(roundTripEffects(saved)).toEqual(saved)
  })
})
