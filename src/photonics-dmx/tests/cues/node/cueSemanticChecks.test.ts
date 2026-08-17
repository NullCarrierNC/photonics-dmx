/**
 * Spec for the registered semantic-check hook. A build that ships its own cue kind registers a check
 * here rather than editing each mode's validator, so this pins that a registered check runs for every
 * mode, sees the parsed file, and can fail one the schema accepted.
 *
 * The fixtures are bundled cue files, so the schema layer passes for reasons unrelated to the hook.
 */

import { describe, expect, it } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import {
  registerCueSemanticCheck,
  validateAudioNodeCueFile,
  validateRb3NodeCueFile,
  validateYargNodeCueFile,
} from '../../../cues/node/schema/validation'
import type { NodeCueFile } from '../../../cues/types/nodeCueTypes'

const CUE_ROOT = path.resolve(__dirname, '../../../../../resources/defaults/node-data/cues')

/** The first bundled file of a mode, parsed fresh so a case can mutate its copy. */
const bundled = (mode: string): Record<string, unknown> => {
  const dir = path.join(CUE_ROOT, mode)
  const file = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))[0]
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
}

describe('registered cue semantic checks', () => {
  it('runs for every mode and can fail a file the schema accepted', () => {
    const seen: string[] = []
    registerCueSemanticCheck((file: NodeCueFile, errors: string[]) => {
      seen.push(file.mode)
      // Only the marked group fails, so the passing cases below stay unaffected.
      if (file.group.id === 'reject-me') errors.push('registered check rejected this file')
    })

    expect(validateYargNodeCueFile(bundled('yarg')).valid).toBe(true)
    expect(validateRb3NodeCueFile(bundled('rb3')).valid).toBe(true)
    expect(validateAudioNodeCueFile(bundled('audio')).valid).toBe(true)
    expect(seen).toEqual(['yarg', 'rb3', 'audio'])

    // The same file fails once the check objects, so the hook reaches the result rather than
    // running somewhere its errors are dropped.
    const rejected = bundled('yarg')
    ;(rejected.group as Record<string, unknown>).id = 'reject-me'
    const result = validateYargNodeCueFile(rejected)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('registered check rejected this file')
  })
})
