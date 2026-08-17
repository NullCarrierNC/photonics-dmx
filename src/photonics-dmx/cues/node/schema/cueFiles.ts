import { JSONSchemaType } from 'ajv'
import type {
  AudioNodeCueFile,
  AudioEventNodeUnion,
  NodeCueGroupMeta,
  NetNodeCueFile,
} from '../../types/nodeCueTypes'
import type { ValidateFunction } from 'ajv'
import { registerKindSchema, setGroupSchema, validatorFor } from './cueSchemaRegistry'
import { audioEventSchema, audioTriggerSchema, netEventSchema } from './nodes'
import { stringIdSchema, variableDefinitionSchema } from './primitives'
import { buildCueSchema } from './cueSchemaBuilder'

const netEventItems = netEventSchema
// audio-trigger first: the same shape is rejected by audioEventSchema (wrong enum, extra props,
// missing triggerMode), so the looser trigger variant has to be tried before it.
const audioEventItems = {
  anyOf: [audioTriggerSchema, audioEventSchema],
} as unknown as JSONSchemaType<AudioEventNodeUnion>

const netLightingCueSchema = buildCueSchema({
  kind: 'lighting',
  eventItems: netEventItems,
  key: {
    field: 'cueType',
    schema: { type: 'string' },
    style: { values: ['primary', 'secondary'] },
  },
})

const netMotionCueSchema = buildCueSchema({ kind: 'motion', eventItems: netEventItems })

const audioLightingCueSchema = buildCueSchema({
  kind: 'lighting',
  eventItems: audioEventItems,
  key: {
    field: 'cueTypeId',
    schema: { type: 'string', minLength: 1 },
    style: { values: ['primary', 'secondary', 'strobe'], nullable: true },
  },
})

const audioMotionCueSchema = buildCueSchema({ kind: 'motion', eventItems: audioEventItems })

const groupSchema: JSONSchemaType<NodeCueGroupMeta> = {
  type: 'object',
  required: ['id', 'name'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', nullable: true },
    variables: {
      type: 'array',
      nullable: true,
      items: variableDefinitionSchema,
      default: [],
    },
    isDefault: { type: 'boolean', nullable: true },
    isStageKit: { type: 'boolean', nullable: true },
  },
}

setGroupSchema(groupSchema)

// The two kinds every build ships. A cue file accepts whichever kinds are registered for its family,
// so these two registrations are what make `lighting` and `motion` valid in a cue file.
registerKindSchema('lighting', { net: netLightingCueSchema, audio: audioLightingCueSchema })
registerKindSchema('motion', { net: netMotionCueSchema, audio: audioMotionCueSchema })

export const validateYargSchema = validatorFor('yarg') as ValidateFunction<NetNodeCueFile>
export const validateAudioSchema = validatorFor('audio') as ValidateFunction<AudioNodeCueFile>
export const validateRb3Schema = validatorFor('rb3') as ValidateFunction<NetNodeCueFile>
