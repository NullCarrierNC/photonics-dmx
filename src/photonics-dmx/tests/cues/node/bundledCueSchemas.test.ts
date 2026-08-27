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

describe('bundled default group designations', () => {
  // A group's default claim is routed by what it holds, so at most one group per mode can serve
  // fallback lighting cues and at most one can serve fallback motion programs.
  const holdsLighting = (parsed: { cues?: { kind?: string }[] }): boolean =>
    (parsed.cues ?? []).some((cue) => cue.kind !== 'motion')

  const claimsByMode = (): Map<string, { lighting: string[]; motion: string[] }> => {
    const byMode = new Map<string, { lighting: string[]; motion: string[] }>()
    for (const { mode, full } of bundledFiles()) {
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8'))
      if (!parsed.group?.isDefault) {
        continue
      }
      const entry = byMode.get(mode) ?? { lighting: [], motion: [] }
      if (holdsLighting(parsed)) {
        entry.lighting.push(parsed.group.id)
      }
      if ((parsed.cues ?? []).some((cue: { kind?: string }) => cue.kind === 'motion')) {
        entry.motion.push(parsed.group.id)
      }
      byMode.set(mode, entry)
    }
    return byMode
  }

  it('claims at most one lighting and one motion default per mode', () => {
    const overClaimed = [...claimsByMode()].flatMap(([mode, entry]) => [
      ...(entry.lighting.length > 1 ? [`${mode} lighting: ${entry.lighting.join(', ')}`] : []),
      ...(entry.motion.length > 1 ? [`${mode} motion: ${entry.motion.join(', ')}`] : []),
    ])
    expect(overClaimed).toEqual([])
  })

  it('serves yarg and rb3 fallback lighting cues from the stage kit group', () => {
    for (const mode of ['yarg', 'rb3']) {
      const lightingDefault = bundledFiles()
        .filter((entry) => entry.mode === mode)
        .map((entry) => JSON.parse(fs.readFileSync(entry.full, 'utf8')))
        .find((parsed) => parsed.group?.isDefault && holdsLighting(parsed))
      expect(lightingDefault?.group).toMatchObject({ isStageKit: true })
    }
  })
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
