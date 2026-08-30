/**
 * Spec for the cue-kind schema registry: what a registration makes valid, and the ordering rule that
 * keeps a late registration from being silently ignored.
 *
 * The registry holds module-level state and the real kinds register when `cueFiles` is imported, so
 * each case here resets it and registers its own kinds. Jest gives every test file its own module
 * registry, so that reset cannot reach another suite.
 */

import { beforeEach, describe, expect, it } from '@jest/globals'
import {
  __resetCueSchemaRegistryForTests,
  registerKindSchema,
  setGroupSchema,
  validatorFor,
} from '../../../cues/node/schema/cueSchemaRegistry'

/** A minimal definition schema, keyed so the two families are distinguishable. */
const kindSchema = (kind: string, keyField: string) => ({
  type: 'object',
  required: ['id', 'kind', keyField],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', const: kind },
    [keyField]: { type: 'string' },
  },
})

const GROUP = {
  type: 'object',
  required: ['id', 'name'],
  additionalProperties: false,
  properties: { id: { type: 'string' }, name: { type: 'string' } },
}

const file = (mode: string, cues: unknown[]) => ({
  version: 1,
  mode,
  group: { id: 'g', name: 'G' },
  cues,
})

describe('cue schema registry', () => {
  beforeEach(() => {
    __resetCueSchemaRegistryForTests()
    setGroupSchema(GROUP)
  })

  it('accepts a cue of a registered kind and rejects an unregistered one', () => {
    registerKindSchema('lighting', {
      net: kindSchema('lighting', 'cueType'),
      audio: kindSchema('lighting', 'cueTypeId'),
    })

    const validate = validatorFor('yarg')
    expect(validate(file('yarg', [{ id: 'a', kind: 'lighting', cueType: 'Chorus' }]))).toBe(true)
    expect(validate(file('yarg', [{ id: 'a', kind: 'motion', cueType: 'Chorus' }]))).toBe(false)
  })

  it('gives a mode the schema for its own family', () => {
    registerKindSchema('lighting', {
      net: kindSchema('lighting', 'cueType'),
      audio: kindSchema('lighting', 'cueTypeId'),
    })

    // rb3 is in the net family, so it takes the net variant and its cueType key.
    expect(validatorFor('rb3')(file('rb3', [{ id: 'a', kind: 'lighting', cueType: 'RB3' }]))).toBe(
      true,
    )
    // audio takes its own variant, so the net key is not accepted there.
    expect(
      validatorFor('audio')(file('audio', [{ id: 'a', kind: 'lighting', cueType: 'RB3' }])),
    ).toBe(false)
    expect(
      validatorFor('audio')(file('audio', [{ id: 'a', kind: 'lighting', cueTypeId: 'organ' }])),
    ).toBe(true)
  })

  it('widens a mode to every kind registered before the first validation', () => {
    registerKindSchema('lighting', {
      net: kindSchema('lighting', 'cueType'),
      audio: kindSchema('lighting', 'cueTypeId'),
    })
    registerKindSchema('laser', {
      net: kindSchema('laser', 'cueType'),
      audio: kindSchema('laser', 'cueTypeId'),
    })

    const validate = validatorFor('yarg')
    expect(validate(file('yarg', [{ id: 'a', kind: 'laser', cueType: 'Chorus' }]))).toBe(true)
    expect(validate(file('yarg', [{ id: 'b', kind: 'lighting', cueType: 'Chorus' }]))).toBe(true)
  })

  it('throws on a registration made after a validator was compiled', () => {
    registerKindSchema('lighting', {
      net: kindSchema('lighting', 'cueType'),
      audio: kindSchema('lighting', 'cueTypeId'),
    })
    validatorFor('yarg')

    // The compiled validator cannot grow a kind, so this has to be loud rather than a no-op.
    expect(() =>
      registerKindSchema('laser', {
        net: kindSchema('laser', 'cueType'),
        audio: kindSchema('laser', 'cueTypeId'),
      }),
    ).toThrow(/registered after/i)
  })

  it('compiles one validator per mode and reuses it', () => {
    registerKindSchema('lighting', {
      net: kindSchema('lighting', 'cueType'),
      audio: kindSchema('lighting', 'cueTypeId'),
    })
    expect(validatorFor('yarg')).toBe(validatorFor('yarg'))
    expect(validatorFor('yarg')).not.toBe(validatorFor('rb3'))
  })

  it('refuses to build a validator with no kinds registered', () => {
    expect(() => validatorFor('yarg')).toThrow(/no cue kinds registered/i)
  })
})

describe('the shipped registration path', () => {
  it('still accepts a kind registered after cueFiles is imported', async () => {
    // The deferral is only worth anything if importing the module that registers the built-in kinds
    // does not itself compile a validator. Resolving the exported accessors here rather than binding
    // them at import is what keeps that true, so an added kind is not order-dependent.
    const cueFiles = await import('../../../cues/node/schema/cueFiles')

    expect(() =>
      registerKindSchema('laser', {
        net: kindSchema('laser', 'cueType'),
        audio: kindSchema('laser', 'cueTypeId'),
      }),
    ).not.toThrow()

    // And the kind it registered is in the validator the shipped accessor hands back.
    const validate = cueFiles.validateYargSchema()
    expect(
      validate(file('yarg', [{ id: 'c1', kind: 'laser', cueType: 'Chorus' }]) as unknown as object),
    ).toBe(true)
  })
})
