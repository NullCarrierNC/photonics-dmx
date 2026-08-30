/**
 * Spec for the registered semantic-check hook. A build that ships its own cue kind registers a check
 * here rather than editing each mode's validator, so this pins that a registered check runs for every
 * mode, sees the parsed file, and can fail one the schema accepted.
 *
 * The fixtures are bundled cue files, so the schema layer passes for reasons unrelated to the hook.
 */

import { beforeEach, describe, expect, it } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import {
  __resetCueSemanticChecksForTests,
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

  it('reports a warning without failing the file', () => {
    registerCueSemanticCheck((file: NodeCueFile, _errors: string[], warnings: string[]) => {
      if (file.group.id === 'warn-me') warnings.push('registered check warned about this file')
    })

    const warned = bundled('yarg')
    ;(warned.group as Record<string, unknown>).id = 'warn-me'
    const result = validateYargNodeCueFile(warned)

    expect(result.valid).toBe(true)
    expect(result.valid && result.warnings).toContain('registered check warned about this file')
  })
})

describe('the built-in event vocabulary check', () => {
  // Drop the ad-hoc checks the cases above registered, so these assert the shipped set alone.
  beforeEach(() => __resetCueSemanticChecksForTests())

  /** Point the first cue's first event at an event type of the other net mode. */
  const withEvent = (mode: string, eventType: string): Record<string, unknown> => {
    const file = bundled(mode)
    const cues = file.cues as Record<string, unknown>[]
    const nodes = cues[0].nodes as Record<string, unknown>
    const events = nodes.events as Record<string, unknown>[]
    events[0].eventType = eventType
    return file
  }

  it('warns when an rb3 cue waits on a YARG song event', () => {
    // The envelope accepts the whole net superset, so this saves and then never fires.
    const result = validateRb3NodeCueFile(withEvent('rb3', 'beat'))

    expect(result.valid).toBe(true)
    expect(result.valid && result.warnings.join('\n')).toContain(
      "event 'beat' is never raised in rb3 mode",
    )
  })

  it('warns when a yarg cue waits on a StageKit edge', () => {
    const result = validateYargNodeCueFile(withEvent('yarg', 'led-3'))

    expect(result.valid).toBe(true)
    expect(result.valid && result.warnings.join('\n')).toContain(
      "event 'led-3' is never raised in yarg mode",
    )
  })

  it('leaves the bundled corpus clean', () => {
    for (const [mode, validate] of [
      ['yarg', validateYargNodeCueFile],
      ['rb3', validateRb3NodeCueFile],
      ['audio', validateAudioNodeCueFile],
    ] as const) {
      const result = validate(bundled(mode))
      expect(result.valid && result.warnings).toEqual([])
    }
  })
})
