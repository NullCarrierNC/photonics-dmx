import { JSONSchemaType } from 'ajv'
import { AudioNodeCueFile, NodeCueGroupMeta, YargNodeCueFile } from '../../types/nodeCueTypes'
import { ajv } from './helpers'
import { logicNodeSchema } from './logic'
import {
  actionSchema,
  audioEventSchema,
  audioTriggerSchema,
  connectionSchema,
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Simplified schema for now
          items: { type: 'object' } as any,
          default: [],
        },
        effectListeners: {
          type: 'array',
          nullable: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: { type: 'object' } as any, // Not used in cues, only in effects
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
          items: { type: 'object' } as any,
          default: [],
        },
        effectListeners: {
          type: 'array',
          nullable: true,
          items: { type: 'object' } as any,
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
} as any

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: { anyOf: [audioTriggerSchema, audioEventSchema] } as any,
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
          items: { type: 'object' } as any,
          default: [],
        },
        effectListeners: {
          type: 'array',
          nullable: true,
          items: { type: 'object' } as any,
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: { anyOf: [audioTriggerSchema, audioEventSchema] } as any,
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
          items: { type: 'object' } as any,
          default: [],
        },
        effectListeners: {
          type: 'array',
          nullable: true,
          items: { type: 'object' } as any,
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
} as any

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

export const validateYargSchema = ajv.compile(
  yargFileSchema as any,
) as import('ajv').ValidateFunction<YargNodeCueFile>

export const validateAudioSchema = ajv.compile(
  audioFileSchema as any,
) as import('ajv').ValidateFunction<AudioNodeCueFile>
