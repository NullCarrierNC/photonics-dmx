/**
 * Every bundled cue file validates against its mode's schema, and the schema still requires the
 * fields that identify a lighting cue.
 *
 * The four cue schemas are assembled by `buildCueSchema` from one block, so these cover the whole
 * shipped corpus rather than a couple of sampled files: a mode added to `resources/defaults` is
 * picked up here without editing the test.
 */

import { describe, expect, it } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { validateNodeCueFile } from '../../../cues/node/schema/validation'

const CUE_ROOT = path.resolve(__dirname, '../../../../../resources/defaults/node-data/cues')

const bundledFiles = (): { mode: string; file: string; full: string }[] =>
  fs
    .readdirSync(CUE_ROOT)
    .filter((mode) => fs.statSync(path.join(CUE_ROOT, mode)).isDirectory())
    .flatMap((mode) =>
      fs
        .readdirSync(path.join(CUE_ROOT, mode))
        .filter((file) => file.endsWith('.json'))
        .map((file) => ({ mode, file, full: path.join(CUE_ROOT, mode, file) })),
    )

describe('bundled cue files', () => {
  const files = bundledFiles()

  it('finds a corpus to check', () => {
    // Guards the suite below against silently passing on an empty directory listing.
    expect(files.length).toBeGreaterThan(0)
  })

  for (const { mode, file, full } of files) {
    it(`${mode}/${file} validates`, () => {
      const result = validateNodeCueFile(JSON.parse(fs.readFileSync(full, 'utf8')))
      expect(result.valid ? [] : result.errors).toEqual([])
    })
  }
})

describe('the assembled cue schema still demands a lighting cue key', () => {
  const lightingCueFrom = (mode: string): Record<string, unknown> => {
    const source = bundledFiles().find((f) => f.mode === mode)
    const parsed = JSON.parse(fs.readFileSync(source!.full, 'utf8'))
    return parsed.cues.find((c: { kind: string }) => c.kind === 'lighting')
  }

  it.each([
    ['yarg', 'cueType'],
    ['audio', 'cueTypeId'],
  ])('rejects a %s lighting cue with no %s', (mode, keyField) => {
    const source = bundledFiles().find((f) => f.mode === mode)!
    const parsed = JSON.parse(fs.readFileSync(source.full, 'utf8'))
    const cue = lightingCueFrom(mode)
    delete cue[keyField]
    parsed.cues = [cue]

    expect(validateNodeCueFile(parsed).valid).toBe(false)
  })
})
