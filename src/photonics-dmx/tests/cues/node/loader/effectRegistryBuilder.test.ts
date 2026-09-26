import * as fs from 'fs'
import * as path from 'path'
import { describe, expect, it, jest } from '@jest/globals'
import {
  buildEffectRegistry,
  type EffectFilesByMode,
} from '../../../../cues/node/loader/effectRegistryBuilder'
import { validateEffectFile } from '../../../../cues/node/schema/validation'
import type { EffectFile, EffectMode, EffectReference } from '../../../../cues/types/nodeCueTypes'

const CORE_EFFECTS = path.join(
  __dirname,
  '../../../../../../resources/defaults/node-data/effects/yarg/yarg-core-effects.json',
)

function coreEffects(): EffectFile {
  const validation = validateEffectFile(JSON.parse(fs.readFileSync(CORE_EFFECTS, 'utf8')))
  if (!validation.valid || !validation.data) throw new Error(validation.errors.join(', '))
  return validation.data
}

/** An effect with no effect listener, which the compiler refuses. */
const uncompilable = (groupId: string, effectId: string): EffectFile => ({
  version: 1,
  mode: 'yarg',
  group: { id: groupId, name: 'G' },
  effects: [
    {
      id: effectId,
      name: 'No entry point',
      mode: 'yarg',
      nodes: {
        events: [{ id: 'e1', type: 'event', eventType: 'beat' }],
        actions: [],
      },
      connections: [],
    },
  ],
})

const ref = (effectFileId: string, effectId: string): EffectReference => ({
  effectFileId,
  effectId,
  name: effectId,
})

const fakeLoader = (files: EffectFile[]) => ({
  readEffectFilesByGroupId: jest.fn(async (_mode: EffectMode) => {
    return new Map(files.map((file) => [file.group.id, file]))
  }),
})

describe('buildEffectRegistry', () => {
  it('compiles each referenced effect under its effect id', async () => {
    const loader = fakeLoader([coreEffects()])

    const registry = await buildEffectRegistry(
      loader,
      [
        ref('yarg-core-effects', 'effect-flash-color'),
        ref('yarg-core-effects', 'effect-sweep-color'),
      ],
      'yarg',
      new Map(),
    )

    expect(registry.getEffectIds()).toEqual(['effect-flash-color', 'effect-sweep-color'])
  })

  it('leaves out a missing file, a missing effect and one that fails to compile', async () => {
    const loader = fakeLoader([coreEffects(), uncompilable('broken', 'no-entry')])

    const registry = await buildEffectRegistry(
      loader,
      [
        ref('gone', 'effect-flash-color'),
        ref('yarg-core-effects', 'gone'),
        ref('broken', 'no-entry'),
        ref('yarg-core-effects', 'effect-flash-color'),
      ],
      'yarg',
      new Map(),
    )

    expect(registry.getEffectIds()).toEqual(['effect-flash-color'])
  })

  it('reads the yarg effect files once for yarg and RB3 builds in one pass', async () => {
    const loader = fakeLoader([coreEffects()])
    const pass: EffectFilesByMode = new Map()
    const refs = [ref('yarg-core-effects', 'effect-flash-color')]

    await buildEffectRegistry(loader, refs, 'yarg', pass)
    await buildEffectRegistry(loader, refs, 'rb3', pass)

    expect(loader.readEffectFilesByGroupId).toHaveBeenCalledTimes(1)
    expect(loader.readEffectFilesByGroupId).toHaveBeenCalledWith('yarg')
  })

  it('builds an empty registry without an effect loader', async () => {
    const registry = await buildEffectRegistry(
      undefined,
      [ref('yarg-core-effects', 'effect-flash-color')],
      'yarg',
      new Map(),
    )

    expect(registry.size()).toBe(0)
  })
})
