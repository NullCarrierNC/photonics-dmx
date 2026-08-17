/**
 * Holds the cue-definition schema for each cue kind, per family, and compiles one file validator per
 * mode on demand.
 *
 * A cue file's envelope is the same for every mode apart from its `mode` const and which cue
 * definitions it accepts, and the definitions it accepts are the registered kinds for that mode's
 * family. So a kind is a registration rather than an edit: `lighting` and `motion` register below,
 * and a build that adds its own kind registers from an import-time module of its own.
 *
 * Compilation is deferred to the first {@link validatorFor} so a registration made while modules are
 * still loading is still included. Registering after that throws, because the validator it would
 * have joined has already been built and a silent no-op there would look like a schema that simply
 * refuses the new kind.
 */

import type { ValidateFunction } from 'ajv'
import type { CueFamily } from '../../domains'
import { getCueDomain } from '../../domains'
import type { NodeCueKind, NodeCueMode } from '../../types/nodeCueTypes'
import { ajv } from './helpers'

/** One kind's definition schema for each family. */
export type KindSchemas = Record<CueFamily, unknown>

const kindSchemas = new Map<string, KindSchemas>()
const compiled = new Map<NodeCueMode, ValidateFunction>()

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

/** Which kinds a mode may carry, as that family's variant of each registered kind. */
function definitionsFor(mode: NodeCueMode): unknown[] {
  const family = getCueDomain(mode).family
  return Array.from(kindSchemas.values()).map((schemas) => schemas[family])
}

function buildFileSchema(mode: NodeCueMode): Record<string, unknown> {
  const definitions = definitionsFor(mode)
  if (definitions.length === 0) {
    throw new Error('No cue kinds registered, so no cue file could be validated.')
  }
  return {
    type: 'object',
    required: ['version', 'mode', 'group', 'cues'],
    additionalProperties: false,
    properties: {
      version: { type: 'integer', const: 1 },
      mode: { type: 'string', const: mode },
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

export function validatorFor(mode: NodeCueMode): ValidateFunction {
  const existing = compiled.get(mode)
  if (existing) return existing
  const validate = ajv.compile(buildFileSchema(mode))
  compiled.set(mode, validate)
  return validate
}

/** Drops every registration and compiled validator. Tests only, so each case starts clean. */
export function __resetCueSchemaRegistryForTests(): void {
  kindSchemas.clear()
  compiled.clear()
  groupSchema = undefined
}
