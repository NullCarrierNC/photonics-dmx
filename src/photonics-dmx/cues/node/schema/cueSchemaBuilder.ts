/**
 * Builds a cue-definition schema from the parts that vary between cue kinds and families.
 *
 * Everything a cue graph carries (the node buckets, connections, layout, variables, events and
 * effect references) is identical across all four combinations. What differs is the `kind` const,
 * whether the definition is keyed by a `CueType` or by its own id, which style values are allowed,
 * and which event-node shape the events array accepts. Those are the builder's inputs, so a new
 * kind or family registers one call instead of copying the block.
 */

import type { NodeCueKind } from '../../types/nodeCueTypes'
import { logicNodeSchema } from './logic'
import {
  actionSchema,
  connectionSchema,
  effectListenerNodeSchema,
  effectRaiserNodeSchema,
  eventListenerNodeSchema,
  eventRaiserNodeSchema,
  layoutSchema,
  notesNodeSchema,
} from './nodes'
import {
  effectReferenceSchema,
  eventDefinitionSchema,
  stringIdSchema,
  variableDefinitionSchema,
} from './primitives'

/** How a cue of this kind is addressed: lighting cues are keyed, motion cues use their own id. */
export interface CueKeySpec {
  /** Property holding the key, e.g. `cueType` for the net family or `cueTypeId` for audio. */
  field: string
  /** Schema for that property. */
  schema: Record<string, unknown>
  /** Allowed `style` values, and whether style may be omitted. */
  style: { values: string[]; nullable?: boolean }
}

export interface BuildCueSchemaOptions {
  kind: NodeCueKind
  /** Schema for one entry of `nodes.events`, which is where the families genuinely differ. */
  eventItems: unknown
  /** Present for lighting cues, omitted for motion cues, which carry neither key nor style. */
  key?: CueKeySpec
}

/** The node buckets every cue graph carries, whatever its kind or family. */
const nodeBuckets = (eventItems: unknown): Record<string, unknown> => ({
  type: 'object',
  required: ['events', 'actions'],
  additionalProperties: false,
  properties: {
    events: { type: 'array', minItems: 1, items: eventItems },
    actions: { type: 'array', items: actionSchema },
    logic: { type: 'array', nullable: true, items: logicNodeSchema, default: [] },
    eventRaisers: { type: 'array', nullable: true, items: eventRaiserNodeSchema, default: [] },
    eventListeners: { type: 'array', nullable: true, items: eventListenerNodeSchema, default: [] },
    effectRaisers: { type: 'array', nullable: true, items: effectRaiserNodeSchema, default: [] },
    effectListeners: {
      type: 'array',
      nullable: true,
      items: effectListenerNodeSchema,
      default: [],
    },
    notes: { type: 'array', nullable: true, items: notesNodeSchema, default: [] },
  },
})

export function buildCueSchema({
  kind,
  eventItems,
  key,
}: BuildCueSchemaOptions): Record<string, unknown> {
  const keyRequired = key ? [key.field, ...(key.style.nullable ? [] : ['style'])] : []

  return {
    type: 'object',
    required: ['id', 'name', 'nodes', 'connections', 'kind', ...keyRequired],
    additionalProperties: false,
    properties: {
      id: stringIdSchema,
      name: { type: 'string', minLength: 1 },
      description: { type: 'string', nullable: true },
      kind: { type: 'string', const: kind },
      ...(key
        ? {
            [key.field]: key.schema,
            style: {
              type: 'string',
              ...(key.style.nullable ? { nullable: true } : {}),
              enum: key.style.values,
            },
          }
        : {}),
      nodes: nodeBuckets(eventItems),
      connections: { type: 'array', items: connectionSchema },
      layout: { ...layoutSchema, nullable: true },
      variables: { type: 'array', nullable: true, items: variableDefinitionSchema, default: [] },
      events: { type: 'array', nullable: true, items: eventDefinitionSchema, default: [] },
      effects: { type: 'array', nullable: true, items: effectReferenceSchema, default: [] },
    },
  }
}
