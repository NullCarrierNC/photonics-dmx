/**
 * Holds the cue-definition schema for each cue kind, per family, and compiles one file validator per
 * family on demand.
 *
 * A cue file's envelope is the same for every mode apart from its `mode` and which cue definitions
 * it accepts, and the definitions it accepts are the registered kinds for that mode's family. So the
 * modes of a family share one validator, which takes any of them, and the caller checks the file's
 * mode is the one it expects. So a kind is a registration rather than an edit: `lighting` and `motion` register below,
 * and a build that adds its own kind registers from an import-time module of its own.
 *
 * Compilation is deferred to the first {@link validatorFor} so a registration made while modules are
 * still loading is still included. That deferral only holds if nothing resolves a validator at
 * import time, which is why `cueFiles` exports accessors rather than bound validators. Registering
 * after the first validation throws, because the validator it would have joined has already been
 * built and a silent no-op there would look like a schema that simply refuses the new kind.
 */

import type { ValidateFunction } from 'ajv'
import type { CueFamily } from '../../domains'
import { CUE_DOMAIN_DESCRIPTORS, getCueDomain } from '../../domains'
import type { NodeCueKind, NodeCueMode } from '../../types/nodeCueTypes'
import { ajv } from './helpers'

/** One kind's definition schema for each family. */
export type KindSchemas = Record<CueFamily, unknown>

const kindSchemas = new Map<string, KindSchemas>()
const compiled = new Map<CueFamily, ValidateFunction>()

/** The group metadata block, shared by every mode's envelope. */
let groupSchema: unknown

export function setGroupSchema(schema: unknown): void {
  groupSchema = schema
}

export function registerKindSchema(kind: NodeCueKind | string, schemas: KindSchemas): void {
  if (compiled.size > 0) {
    throw new Error(
      `Cue kind '${kind}' was registered after a file validator was compiled. Register kinds from an import-time module so every kind is present before the first validation.`,
    )
  }
  kindSchemas.set(kind, schemas)
}

/** Which kinds a family's files may carry, as that family's variant of each registered kind. */
function definitionsFor(family: CueFamily): unknown[] {
  return Array.from(kindSchemas.values()).map((schemas) => schemas[family])
}

/** The modes a family's files may declare. */
function familyModes(family: CueFamily): NodeCueMode[] {
  return (Object.keys(CUE_DOMAIN_DESCRIPTORS) as NodeCueMode[]).filter(
    (mode) => getCueDomain(mode).family === family,
  )
}

function buildFileSchema(family: CueFamily): Record<string, unknown> {
  const definitions = definitionsFor(family)
  if (definitions.length === 0) {
    throw new Error('No cue kinds registered, so no cue file could be validated.')
  }
  return {
    type: 'object',
    required: ['version', 'mode', 'group', 'cues'],
    additionalProperties: false,
    properties: {
      version: { type: 'integer', const: 1 },
      mode: { type: 'string', enum: familyModes(family) },
      group: groupSchema,
      cues: {
        type: 'array',
        minItems: 1,
        // A single registered kind needs no oneOf, and ajv reports a clearer error without it.
        items: definitions.length === 1 ? definitions[0] : { oneOf: definitions },
      },
      bundled: { type: 'boolean', nullable: true },
      cueVersion: { type: 'integer', nullable: true, minimum: 1 },
    },
  }
}

/** The file validator of a mode's family, which every mode of that family shares. */
export function validatorFor(mode: NodeCueMode): ValidateFunction {
  const family = getCueDomain(mode).family
  const existing = compiled.get(family)
  if (existing) return existing
  const validate = ajv.compile(buildFileSchema(family))
  compiled.set(family, validate)
  return validate
}

/** Drops every registration and compiled validator. Tests only, so each case starts clean. */
export function __resetCueSchemaRegistryForTests(): void {
  kindSchemas.clear()
  compiled.clear()
  groupSchema = undefined
}
