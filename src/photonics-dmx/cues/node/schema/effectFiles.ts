import { JSONSchemaType } from 'ajv'
import type {
  AudioEffectFile,
  EffectGroupMeta,
  EffectMode,
  YargEffectFile,
} from '../../types/nodeCueTypes'
import { ajv } from './helpers'
import { stringIdSchema } from './primitives'

const effectGroupMetaSchema: JSONSchemaType<EffectGroupMeta> = {
  type: 'object',
  required: ['id', 'name'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', nullable: true },
  },
}

/**
 * An effect file envelope for one effect tree. The two trees on disk differ only by the `mode` const,
 * which appears on the file and again on each effect it carries, so both come from here.
 *
 * The effect bodies stay loosely typed (`additionalProperties: true`, `nodes` as a bare object): a
 * graph is validated when the effect compiler builds it, not by this envelope.
 */
const buildEffectFileSchema = (mode: EffectMode): Record<string, unknown> => ({
  type: 'object',
  required: ['version', 'mode', 'group', 'effects'],
  additionalProperties: false,
  properties: {
    version: { type: 'integer', const: 1 },
    mode: { type: 'string', const: mode },
    group: effectGroupMetaSchema,
    effects: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'name', 'mode'],
        additionalProperties: true,
        properties: {
          id: stringIdSchema,
          name: { type: 'string', minLength: 1 },
          mode: { type: 'string', const: mode },
          description: { type: 'string', nullable: true },
          nodes: { type: 'object', nullable: true },
          connections: { type: 'array', nullable: true },
          layout: { type: 'object', nullable: true },
          variables: { type: 'array', nullable: true },
          events: { type: 'array', nullable: true },
        },
      },
    },
    bundled: { type: 'boolean', nullable: true },
    cueVersion: { type: 'integer', nullable: true, minimum: 1 },
  },
})

export const validateYargEffectSchema = ajv.compile<YargEffectFile>(
  buildEffectFileSchema('yarg') as unknown as JSONSchemaType<YargEffectFile>,
)
export const validateAudioEffectSchema = ajv.compile<AudioEffectFile>(
  buildEffectFileSchema('audio') as unknown as JSONSchemaType<AudioEffectFile>,
)
