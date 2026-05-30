import {
  validateYargEffectFile,
  validateAudioEffectFile,
  validateEffectFile,
} from '../../../cues/node/schema/validation'

/**
 * Parity coverage: effect-file validation now runs the SAME semantic checks the
 * YARG/Audio cue validators run — logic-only cycle detection (detectCycles) and
 * conditional literal-vs-variable validValues checks (checkConditionalValidValues).
 * These mirror the cue-file cases in validation.test.ts.
 */

const baseEffect = (
  mode: 'yarg' | 'audio',
  overrides: Record<string, unknown>,
): Record<string, unknown> => ({
  id: 'fx-1',
  name: 'Effect One',
  mode,
  nodes: { events: [], actions: [], logic: [] },
  connections: [],
  variables: [],
  ...overrides,
})

const effectFile = (
  mode: 'yarg' | 'audio',
  effects: Array<Record<string, unknown>>,
): Record<string, unknown> => ({
  version: 1,
  mode,
  group: { id: 'grp-1', name: 'Group One' },
  effects,
})

describe('effect validation parity (cycles + conditional valid values)', () => {
  describe('logic-only cycle detection', () => {
    it('rejects a YARG effect with a logic-only cycle', () => {
      const file = effectFile('yarg', [
        baseEffect('yarg', {
          nodes: {
            events: [],
            actions: [],
            logic: [
              { id: 'l1', type: 'logic', logicType: 'delay' },
              { id: 'l2', type: 'logic', logicType: 'delay' },
            ],
          },
          connections: [
            { id: 'c1', from: 'l1', to: 'l2' },
            { id: 'c2', from: 'l2', to: 'l1' },
          ],
        }),
      ])
      const result = validateYargEffectFile(file)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Circular dependency'))).toBe(true)
    })

    it('rejects an Audio effect with a logic-only cycle', () => {
      const file = effectFile('audio', [
        baseEffect('audio', {
          nodes: {
            events: [],
            actions: [],
            logic: [
              { id: 'l1', type: 'logic', logicType: 'delay' },
              { id: 'l2', type: 'logic', logicType: 'delay' },
            ],
          },
          connections: [
            { id: 'c1', from: 'l1', to: 'l2' },
            { id: 'c2', from: 'l2', to: 'l1' },
          ],
        }),
      ])
      const result = validateAudioEffectFile(file)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Circular dependency'))).toBe(true)
    })

    it('allows a cycle that passes through an action node', () => {
      const file = effectFile('yarg', [
        baseEffect('yarg', {
          nodes: {
            events: [],
            actions: [{ id: 'a1' }],
            logic: [{ id: 'l1', type: 'logic', logicType: 'delay' }],
          },
          connections: [
            { id: 'c1', from: 'l1', to: 'a1' },
            { id: 'c2', from: 'a1', to: 'l1' },
          ],
        }),
      ])
      const result = validateYargEffectFile(file)
      expect(result.valid).toBe(true)
    })

    it('accepts an acyclic effect graph', () => {
      const file = effectFile('yarg', [
        baseEffect('yarg', {
          nodes: {
            events: [],
            actions: [],
            logic: [
              { id: 'l1', type: 'logic', logicType: 'delay' },
              { id: 'l2', type: 'logic', logicType: 'delay' },
            ],
          },
          connections: [{ id: 'c1', from: 'l1', to: 'l2' }],
        }),
      ])
      const result = validateYargEffectFile(file)
      expect(result.valid).toBe(true)
    })
  })

  describe('conditional literal vs variable validValues', () => {
    const conditionalEffect = (literal: string): Record<string, unknown> =>
      baseEffect('yarg', {
        variables: [
          {
            name: 'mood',
            type: 'string',
            initialValue: 'happy',
            validValues: ['happy', 'sad'],
          },
        ],
        nodes: {
          events: [],
          actions: [],
          logic: [
            {
              id: 'cond1',
              type: 'logic',
              logicType: 'conditional',
              comparator: '==',
              left: { source: 'literal', value: literal },
              right: { source: 'variable', name: 'mood' },
            },
          ],
        },
        connections: [],
      })

    it('rejects an effect whose conditional literal is not in the variable validValues', () => {
      const file = effectFile('yarg', [conditionalEffect('angry')])
      const result = validateYargEffectFile(file)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('valid values are'))).toBe(true)
    })

    it('accepts an effect whose conditional literal is in the variable validValues', () => {
      const file = effectFile('yarg', [conditionalEffect('happy')])
      const result = validateYargEffectFile(file)
      expect(result.valid).toBe(true)
    })
  })

  describe('validateEffectFile (auto-detect mode) routes through the semantic checks', () => {
    it('rejects a cyclic effect via the auto-detecting entrypoint', () => {
      const file = effectFile('yarg', [
        baseEffect('yarg', {
          nodes: {
            events: [],
            actions: [],
            logic: [
              { id: 'l1', type: 'logic', logicType: 'delay' },
              { id: 'l2', type: 'logic', logicType: 'delay' },
            ],
          },
          connections: [
            { id: 'c1', from: 'l1', to: 'l2' },
            { id: 'c2', from: 'l2', to: 'l1' },
          ],
        }),
      ])
      const result = validateEffectFile(file)
      expect(result.valid).toBe(false)
    })

    it('still accepts a valid effect file', () => {
      const file = effectFile('yarg', [baseEffect('yarg', {})])
      const result = validateEffectFile(file)
      expect(result.valid).toBe(true)
    })
  })
})
