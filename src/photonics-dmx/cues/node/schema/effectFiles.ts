import { JSONSchemaType } from 'ajv'
import type {
  AudioEffectDefinition,
  AudioEffectFile,
  EffectGroupMeta,
  YargEffectDefinition,
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

const yargEffectFileSchema: JSONSchemaType<YargEffectFile> = {
  type: 'object',
  required: ['version', 'mode', 'group', 'effects'],
  additionalProperties: false,
  properties: {
    version: { type: 'integer', const: 1 },
    mode: { type: 'string', const: 'yarg' },
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
          mode: { type: 'string', const: 'yarg' },
          description: { type: 'string', nullable: true },
          nodes: { type: 'object', nullable: true },
          connections: { type: 'array', nullable: true },
          layout: { type: 'object', nullable: true },
          variables: { type: 'array', nullable: true },
          events: { type: 'array', nullable: true },
        },
      } as unknown as JSONSchemaType<YargEffectDefinition>,
    },
    bundled: { type: 'boolean', nullable: true },
  },
}

const audioEffectFileSchema: JSONSchemaType<AudioEffectFile> = {
  type: 'object',
  required: ['version', 'mode', 'group', 'effects'],
  additionalProperties: false,
  properties: {
    version: { type: 'integer', const: 1 },
    mode: { type: 'string', const: 'audio' },
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
          mode: { type: 'string', const: 'audio' },
          description: { type: 'string', nullable: true },
          nodes: { type: 'object', nullable: true },
          connections: { type: 'array', nullable: true },
          layout: { type: 'object', nullable: true },
          variables: { type: 'array', nullable: true },
          events: { type: 'array', nullable: true },
        },
      } as unknown as JSONSchemaType<AudioEffectDefinition>,
    },
    bundled: { type: 'boolean', nullable: true },
  },
}

export const validateYargEffectSchema = ajv.compile<YargEffectFile>(yargEffectFileSchema)
export const validateAudioEffectSchema = ajv.compile<AudioEffectFile>(audioEffectFileSchema)
