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

describe('the built-in cue-called execution policy check', () => {
  beforeEach(() => __resetCueSemanticChecksForTests())

  /** An audio file whose one cue runs a set-color from cue-called. */
  const cueCalledFile = (waitUntil: string, executionPolicy?: string): Record<string, unknown> => ({
    version: 1,
    mode: 'audio',
    group: { id: 'policy', name: 'Policy' },
    cues: [
      {
        kind: 'lighting',
        id: 'called',
        cueTypeId: 'called',
        name: 'Called',
        nodes: {
          events: [
            {
              id: 'ev',
              type: 'event',
              eventType: 'cue-called',
              triggerMode: 'edge',
              ...(executionPolicy && { executionPolicy }),
            },
          ],
          actions: [
            {
              id: 'paint',
              type: 'action',
              effectType: 'set-color',
              target: {
                groups: { source: 'literal', value: 'front' },
                filter: { source: 'literal', value: 'all' },
              },
              color: {
                name: { source: 'literal', value: 'red' },
                brightness: { source: 'literal', value: 'high' },
              },
              timing: {
                waitForCondition: { source: 'literal', value: 'none' },
                waitForTime: { source: 'literal', value: 0 },
                duration: { source: 'literal', value: 100 },
                waitUntilCondition: { source: 'literal', value: waitUntil },
                waitUntilTime: { source: 'literal', value: 0 },
              },
            },
          ],
          logic: [],
        },
        connections: [{ from: 'ev', to: 'paint' }],
        layout: { nodePositions: {} },
      },
    ],
  })

  it('warns when a continuous cue-called graph waits on a blocking action', () => {
    const result = validateAudioNodeCueFile(cueCalledFile('beat'))

    expect(result.valid).toBe(true)
    expect(result.valid && result.warnings.join('\n')).toContain(
      "the cue-called event starts a run on every audio frame and 'paint' waits",
    )
  })

  it('stays quiet once the event has another policy, or nothing waits', () => {
    for (const file of [
      cueCalledFile('beat', 'ignore-while-running'),
      cueCalledFile('beat', 'latest-pending'),
      cueCalledFile('none'),
    ]) {
      const result = validateAudioNodeCueFile(file)
      expect(result.valid && result.warnings).toEqual([])
    }
  })

  it('rejects a policy it does not know', () => {
    expect(validateAudioNodeCueFile(cueCalledFile('beat', 'sometimes')).valid).toBe(false)
  })
})

describe('the built-in action literal check', () => {
  beforeEach(() => __resetCueSemanticChecksForTests())

  /** Give the first action of a bundled library a wait-until condition. */
  const withWaitUntil = (
    mode: string,
    file: string,
    condition: string,
  ): Record<string, unknown> => {
    const parsed = JSON.parse(fs.readFileSync(path.join(CUE_ROOT, mode, file), 'utf8'))
    const cue = (
      parsed.cues as { nodes: { actions?: { timing: Record<string, unknown> }[] } }[]
    ).find((c) => (c.nodes.actions ?? []).length > 0)
    cue!.nodes.actions![0].timing.waitUntilCondition = { source: 'literal', value: condition }
    return parsed
  }

  it('warns when an rb3 action waits until a YARG song event', () => {
    const result = validateRb3NodeCueFile(withWaitUntil('rb3', 'rb3-stagekit.json', 'measure'))

    expect(result.valid).toBe(true)
    expect(result.valid && result.warnings.join('\n')).toContain(
      "timing.waitUntilCondition 'measure' never fires in rb3 mode",
    )
  })

  it('leaves a condition the mode raises alone', () => {
    const result = validateYargNodeCueFile(withWaitUntil('yarg', 'yarg-alt1.json', 'measure'))

    expect(result.valid && result.warnings).toEqual([])
  })
})

describe('the built-in array compare check', () => {
  beforeEach(() => __resetCueSemanticChecksForTests())

  const withCompare = (left: Record<string, unknown>): Record<string, unknown> => {
    const file = JSON.parse(
      fs.readFileSync(path.join(CUE_ROOT, 'yarg', 'yarg-stagekit.json'), 'utf8'),
    ) as { cues: { name: string; nodes: { logic?: unknown[] } }[] }
    const cue = file.cues.find((c) => c.name === 'Searchlights')!
    cue.nodes.logic = [
      ...(cue.nodes.logic ?? []),
      {
        id: 'gate',
        type: 'logic',
        logicType: 'conditional',
        comparator: '>',
        left,
        right: { source: 'literal', value: 0 },
      },
    ]
    return file
  }

  it('warns when a conditional compares a light-array variable', () => {
    const result = validateYargNodeCueFile(withCompare({ source: 'variable', name: 'allLights' }))

    expect(result.valid).toBe(true)
    expect(result.valid && result.warnings.join('\n')).toContain(
      "cue 'Searchlights': conditional 'gate': 'allLights' is a light-array variable",
    )
  })

  it('leaves a number variable alone', () => {
    const result = validateYargNodeCueFile(withCompare({ source: 'variable', name: 'numLights' }))

    expect(result.valid && result.warnings).toEqual([])
  })
})

describe('the built-in light-array text check', () => {
  beforeEach(() => __resetCueSemanticChecksForTests())

  interface DischordJson {
    name: string
    variables?: unknown[]
    nodes: {
      actions: { id: string; target: Record<string, unknown> }[]
      logic?: unknown[]
    }
  }

  /** The bundled alt1 library, with its Dischord cue handed to `edit`. */
  const withDischord = (edit: (cue: DischordJson) => void): Record<string, unknown> => {
    const file = JSON.parse(fs.readFileSync(path.join(CUE_ROOT, 'yarg', 'yarg-alt1.json'), 'utf8'))
    edit((file.cues as DischordJson[]).find((c) => c.name === 'Dischord')!)
    return file
  }
  const allLights = { source: 'variable', name: 'allLights' }

  it('warns when an action reads a light-array variable as its filter', () => {
    const result = validateYargNodeCueFile(
      withDischord((cue) => {
        cue.nodes.actions[0].target.filter = allLights
      }),
    )

    expect(result.valid).toBe(true)
    expect(result.valid && result.warnings).toEqual([
      "cue 'Dischord': action 'y1-dischord-action-red-on' target.filter: 'allLights' is a light-array variable, and this field takes string.",
    ])
  })

  it('warns when a variable node stores a light-array variable as text', () => {
    const result = validateYargNodeCueFile(
      withDischord((cue) => {
        cue.nodes.logic = [
          ...(cue.nodes.logic ?? []),
          {
            id: 'store',
            type: 'logic',
            logicType: 'variable',
            mode: 'set',
            varName: 'venueSize',
            valueType: 'string',
            value: allLights,
          },
        ]
      }),
    )

    expect(result.valid).toBe(true)
    expect(result.valid && result.warnings).toEqual([
      "cue 'Dischord': variable node 'store': 'allLights' is a light-array variable, and this field takes string.",
    ])
  })

  it('warns when a groups variable starts as text naming no group', () => {
    const result = validateYargNodeCueFile(
      withDischord((cue) => {
        cue.variables = [
          ...(cue.variables ?? []),
          { name: 'aim', type: 'string', scope: 'cue', initialValue: 'fromt' },
        ]
        cue.nodes.actions[0].target.groups = { source: 'variable', name: 'aim' }
      }),
    )

    expect(result.valid).toBe(true)
    expect(result.valid && result.warnings).toEqual([
      "cue 'Dischord': action 'y1-dischord-action-red-on' target.groups reads 'aim', which can hold 'fromt': 'fromt' is not a known LocationGroup.",
    ])
  })

  it('leaves a light-array variable in the groups field alone', () => {
    const result = validateYargNodeCueFile(
      withDischord((cue) => {
        cue.nodes.actions[0].target.groups = allLights
      }),
    )

    expect(result.valid && result.warnings).toEqual([])
  })

  it('leaves every bundled library clean', () => {
    for (const [mode, validate] of [
      ['yarg', validateYargNodeCueFile],
      ['rb3', validateRb3NodeCueFile],
      ['audio', validateAudioNodeCueFile],
    ] as const) {
      const dir = path.join(CUE_ROOT, mode)
      for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
        const result = validate(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')))
        expect({ name, warnings: result.valid && result.warnings }).toEqual({ name, warnings: [] })
      }
    }
  })
})
