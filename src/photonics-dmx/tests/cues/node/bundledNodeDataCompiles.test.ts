import { describe, expect, it } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { validateEffectFile, validateNodeCueFile } from '../../../cues/node/schema/validation'
import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler'
import { EffectCompiler } from '../../../cues/node/compiler/EffectCompiler'

const NODE_DATA_ROOT = path.resolve(__dirname, '../../../../../resources/defaults/node-data')

const bundledFiles = (kind: 'cues' | 'effects'): { name: string; full: string }[] => {
  const root = path.join(NODE_DATA_ROOT, kind)
  return fs
    .readdirSync(root)
    .filter((mode) => fs.statSync(path.join(root, mode)).isDirectory())
    .flatMap((mode) =>
      fs
        .readdirSync(path.join(root, mode))
        .filter((file) => file.endsWith('.json'))
        .map((file) => ({ name: `${mode}/${file}`, full: path.join(root, mode, file) })),
    )
}

const compileErrors = (compileEach: () => { id: string; compile: () => unknown }[]): string[] =>
  compileEach().flatMap(({ id, compile }) => {
    try {
      compile()
      return []
    } catch (error) {
      return [`${id}: ${error instanceof Error ? error.message : String(error)}`]
    }
  })

describe('bundled node data', () => {
  const cueFiles = bundledFiles('cues')
  const effectFiles = bundledFiles('effects')

  it('finds cues and effects to compile', () => {
    expect(cueFiles.length).toBeGreaterThan(0)
    expect(effectFiles.length).toBeGreaterThan(0)
  })

  for (const { name, full } of cueFiles) {
    it(`cues/${name} compiles every cue`, () => {
      const result = validateNodeCueFile(JSON.parse(fs.readFileSync(full, 'utf8')))
      if (!result.valid) throw new Error(result.errors.join(', '))
      const file = result.data
      const errors = compileErrors(() =>
        file.cues.map((cue) => ({
          id: cue.id,
          compile: () => NodeCueCompiler.compileCue(cue, file.mode),
        })),
      )
      expect(errors).toEqual([])
    })
  }

  for (const { name, full } of effectFiles) {
    it(`effects/${name} compiles every effect`, () => {
      const result = validateEffectFile(JSON.parse(fs.readFileSync(full, 'utf8')))
      if (!result.valid || !result.data) throw new Error(result.errors.join(', '))
      const file = result.data
      const errors = compileErrors(() =>
        file.effects.map((effect) => ({
          id: effect.id,
          compile: () => EffectCompiler.compile(effect),
        })),
      )
      expect(errors).toEqual([])
    })
  }
})
