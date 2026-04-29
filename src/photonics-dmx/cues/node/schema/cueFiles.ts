import { JSONSchemaType } from 'ajv'
import type {
  AudioNodeCueDefinition,
  AudioNodeCueFile,
  AudioEventNodeUnion,
  NodeCueGroupMeta,
  YargNodeCueDefinition,
  YargNodeCueFile,
} from '../../types/nodeCueTypes'
import { ajv } from './helpers'
import { logicNodeSchema } from './logic'
import {
  actionSchema,
  audioEventSchema,
  audioTriggerSchema,
  connectionSchema,
  effectListenerNodeSchema,
  effectRaiserNodeSchema,
  eventListenerNodeSchema,
  eventRaiserNodeSchema,
  layoutSchema,
  notesNodeSchema,
  yargEventSchema,
} from './nodes'
import {
  effectReferenceSchema,
  eventDefinitionSchema,
  stringIdSchema,
  variableDefinitionSchema,
} from './primitives'

const yargLightingCueSchema = {
  type: 'object',
  required: ['id', 'name', 'nodes', 'connections', 'kind', 'cueType', 'style'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', nullable: true },
    kind: { type: 'string', const: 'lighting' },
    cueType: { type: 'string' },
    style: { type: 'string', enum: ['primary', 'secondary'] },
    nodes: {
      type: 'object',
      required: ['events', 'actions'],
      additionalProperties: false,
      properties: {
        events: {
          type: 'array',
          minItems: 1,
          items: yargEventSchema,
        },
        actions: {
          type: 'array',
          items: actionSchema,
        },
        logic: {
          type: 'array',
          nullable: true,
          items: logicNodeSchema,
          default: [],
        },
        eventRaisers: {
          type: 'array',
          nullable: true,
          items: eventRaiserNodeSchema,
          default: [],
        },
        eventListeners: {
          type: 'array',
          nullable: true,
          items: eventListenerNodeSchema,
          default: [],
        },
        effectRaisers: {
          type: 'array',
          nullable: true,
          items: effectRaiserNodeSchema,
          default: [],
        },
        effectListeners: {
          type: 'array',
          nullable: true,
          items: effectListenerNodeSchema,
          default: [],
        },
        notes: {
          type: 'array',
          nullable: true,
          items: notesNodeSchema,
          default: [],
        },
      },
    },
    connections: {
      type: 'array',
      items: connectionSchema,
    },
    layout: { ...layoutSchema, nullable: true },
    variables: {
      type: 'array',
      nullable: true,
      items: variableDefinitionSchema,
      default: [],
    },
    events: {
      type: 'array',
      nullable: true,
      items: eventDefinitionSchema,
      default: [],
    },
    effects: {
      type: 'array',
      nullable: true,
      items: effectReferenceSchema,
      default: [],
    },
  },
}

const yargMotionCueSchema = {
  type: 'object',
  required: ['id', 'name', 'nodes', 'connections', 'kind'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', nullable: true },
    kind: { type: 'string', const: 'motion' },
    nodes: {
      type: 'object',
      required: ['events', 'actions'],
      additionalProperties: false,
      properties: {
        events: {
          type: 'array',
          minItems: 1,
          items: yargEventSchema,
        },
        actions: {
          type: 'array',
          items: actionSchema,
        },
        logic: {
          type: 'array',
          nullable: true,
          items: logicNodeSchema,
          default: [],
        },
        eventRaisers: {
          type: 'array',
          nullable: true,
          items: eventRaiserNodeSchema,
          default: [],
        },
        eventListeners: {
          type: 'array',
          nullable: true,
          items: eventListenerNodeSchema,
          default: [],
        },
        effectRaisers: {
          type: 'array',
          nullable: true,
          items: effectRaiserNodeSchema,
          default: [],
        },
        effectListeners: {
          type: 'array',
          nullable: true,
          items: effectListenerNodeSchema,
          default: [],
        },
        notes: {
          type: 'array',
          nullable: true,
          items: notesNodeSchema,
          default: [],
        },
      },
    },
    connections: {
      type: 'array',
      items: connectionSchema,
    },
    layout: { ...layoutSchema, nullable: true },
    variables: {
      type: 'array',
      nullable: true,
      items: variableDefinitionSchema,
      default: [],
    },
    events: {
      type: 'array',
      nullable: true,
      items: eventDefinitionSchema,
      default: [],
    },
    effects: {
      type: 'array',
      nullable: true,
      items: effectReferenceSchema,
      default: [],
    },
  },
}

/** YARG cue definition: lighting (CueType-keyed) or motion (id-keyed). */

const yargCueSchema = {
  oneOf: [yargLightingCueSchema, yargMotionCueSchema],
} as unknown as JSONSchemaType<YargNodeCueDefinition>

const audioLightingCueSchema = {
  type: 'object',
  required: ['id', 'name', 'nodes', 'connections', 'kind', 'cueTypeId'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', nullable: true },
    kind: { type: 'string', const: 'lighting' },
    cueTypeId: { type: 'string', minLength: 1 },
    style: { type: 'string', nullable: true, enum: ['primary', 'secondary', 'strobe'] },
    nodes: {
      type: 'object',
      required: ['events', 'actions'],
      additionalProperties: false,
      properties: {
        events: {
          type: 'array',
          minItems: 1,
          // audio-trigger first: same shape is rejected by audioEventSchema (wrong enum, extra props, missing triggerMode)
          items: {
            anyOf: [audioTriggerSchema, audioEventSchema],
          } as unknown as JSONSchemaType<AudioEventNodeUnion>,
        },
        actions: {
          type: 'array',
          items: actionSchema,
        },
        logic: {
          type: 'array',
          nullable: true,
          items: logicNodeSchema,
          default: [],
        },
        eventRaisers: {
          type: 'array',
          nullable: true,
          items: eventRaiserNodeSchema,
          default: [],
        },
        eventListeners: {
          type: 'array',
          nullable: true,
          items: eventListenerNodeSchema,
          default: [],
        },
        effectRaisers: {
          type: 'array',
          nullable: true,
          items: effectRaiserNodeSchema,
          default: [],
        },
        effectListeners: {
          type: 'array',
          nullable: true,
          items: effectListenerNodeSchema,
          default: [],
        },
        notes: {
          type: 'array',
          nullable: true,
          items: notesNodeSchema,
          default: [],
        },
      },
    },
    connections: {
      type: 'array',
      items: connectionSchema,
    },
    layout: { ...layoutSchema, nullable: true },
    variables: {
      type: 'array',
      nullable: true,
      items: variableDefinitionSchema,
      default: [],
    },
    events: {
      type: 'array',
      nullable: true,
      items: eventDefinitionSchema,
      default: [],
    },
    effects: {
      type: 'array',
      nullable: true,
      items: effectReferenceSchema,
      default: [],
    },
  },
}

const audioMotionCueSchema = {
  type: 'object',
  required: ['id', 'name', 'nodes', 'connections', 'kind'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', nullable: true },
    kind: { type: 'string', const: 'motion' },
    nodes: {
      type: 'object',
      required: ['events', 'actions'],
      additionalProperties: false,
      properties: {
        events: {
          type: 'array',
          minItems: 1,
          items: {
            anyOf: [audioTriggerSchema, audioEventSchema],
          } as unknown as JSONSchemaType<AudioEventNodeUnion>,
        },
        actions: {
          type: 'array',
          items: actionSchema,
        },
        logic: {
          type: 'array',
          nullable: true,
          items: logicNodeSchema,
          default: [],
        },
        eventRaisers: {
          type: 'array',
          nullable: true,
          items: eventRaiserNodeSchema,
          default: [],
        },
        eventListeners: {
          type: 'array',
          nullable: true,
          items: eventListenerNodeSchema,
          default: [],
        },
        effectRaisers: {
          type: 'array',
          nullable: true,
          items: effectRaiserNodeSchema,
          default: [],
        },
        effectListeners: {
          type: 'array',
          nullable: true,
          items: effectListenerNodeSchema,
          default: [],
        },
        notes: {
          type: 'array',
          nullable: true,
          items: notesNodeSchema,
          default: [],
        },
      },
    },
    connections: {
      type: 'array',
      items: connectionSchema,
    },
    layout: { ...layoutSchema, nullable: true },
    variables: {
      type: 'array',
      nullable: true,
      items: variableDefinitionSchema,
      default: [],
    },
    events: {
      type: 'array',
      nullable: true,
      items: eventDefinitionSchema,
      default: [],
    },
    effects: {
      type: 'array',
      nullable: true,
      items: effectReferenceSchema,
      default: [],
    },
  },
}

const audioCueSchema = {
  oneOf: [audioLightingCueSchema, audioMotionCueSchema],
} as unknown as JSONSchemaType<AudioNodeCueDefinition>

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

const yargFileSchema: JSONSchemaType<YargNodeCueFile> = {
  type: 'object',
  required: ['version', 'mode', 'group', 'cues'],
  additionalProperties: false,
  properties: {
    version: { type: 'integer', const: 1 },
    mode: { type: 'string', const: 'yarg' },
    group: groupSchema,
    cues: {
      type: 'array',
      minItems: 1,
      items: yargCueSchema,
    },
    bundled: { type: 'boolean', nullable: true },
  },
}

const audioFileSchema: JSONSchemaType<AudioNodeCueFile> = {
  type: 'object',
  required: ['version', 'mode', 'group', 'cues'],
  additionalProperties: false,
  properties: {
    version: { type: 'integer', const: 1 },
    mode: { type: 'string', const: 'audio' },
    group: groupSchema,
    cues: {
      type: 'array',
      minItems: 1,
      items: audioCueSchema,
    },
    bundled: { type: 'boolean', nullable: true },
  },
}

export const validateYargSchema = ajv.compile<YargNodeCueFile>(yargFileSchema)

export const validateAudioSchema = ajv.compile<AudioNodeCueFile>(audioFileSchema)
