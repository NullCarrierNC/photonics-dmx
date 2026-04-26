import { JSONSchemaType } from 'ajv'
import {
  ActionNode,
  AudioEventNode,
  EventListenerNode,
  EventRaiserNode,
  NodeActionTarget,
  NodeLayoutMetadata,
  NotesNode,
  YargEventNode,
} from '../../types/nodeCueTypes'
import { NODE_EFFECT_TYPES } from '../../types/nodeCueTypes'
import { YARG_EVENT_TYPES, AUDIO_EVENT_TYPES } from './helpers'
import {
  colorSchema,
  motionPatternSchema,
  positionSchema,
  stringIdSchema,
  timingSchema,
  valueSourceSchema,
  actionConfigSchema,
} from './primitives'

export const eventRaiserNodeSchema: JSONSchemaType<EventRaiserNode> = {
  type: 'object',
  required: ['id', 'type', 'eventName'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'event-raiser' },
    eventName: { type: 'string' },
    label: { type: 'string', nullable: true },
    inputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
  },
}

export const eventListenerNodeSchema: JSONSchemaType<EventListenerNode> = {
  type: 'object',
  required: ['id', 'type', 'eventName'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'event-listener' },
    eventName: { type: 'string' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
  },
}

export const notesNodeSchema: JSONSchemaType<NotesNode> = {
  type: 'object',
  required: ['id', 'type', 'note'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'notes' },
    label: { type: 'string', nullable: true },
    title: { type: 'string', nullable: true },
    style: { type: 'string', enum: ['notes', 'info', 'important'], nullable: true },
    note: { type: 'string' },
  },
}

export const targetSchema: JSONSchemaType<NodeActionTarget> = {
  type: 'object',
  required: ['groups', 'filter'],
  additionalProperties: false,
  properties: {
    groups: valueSourceSchema,
    filter: valueSourceSchema,
  },
} as any

export const actionSchema: JSONSchemaType<ActionNode> = {
  type: 'object',
  required: ['id', 'type', 'effectType', 'target', 'timing'],
  additionalProperties: true, // Allow editor/backup metadata (e.g. position) to be ignored
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'action' },
    effectType: { type: 'string', enum: NODE_EFFECT_TYPES },
    target: targetSchema,
    color: { ...colorSchema, nullable: true },
    position: {
      anyOf: [{ type: 'null' }, positionSchema],
    } as any,
    motionPattern: {
      anyOf: [{ type: 'null' }, motionPatternSchema],
    } as any,
    timing: timingSchema,
    layer: { ...valueSourceSchema, nullable: true },
    label: { type: 'string', nullable: true },
    inputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    config: { ...actionConfigSchema, nullable: true },
  },
  allOf: [
    {
      if: {
        properties: { effectType: { const: 'set-color' } },
      },
      then: {
        required: ['color'],
      },
    },
    {
      if: {
        properties: { effectType: { const: 'set-position' } },
      },
      then: {
        required: ['position'],
      },
    },
    {
      if: {
        properties: { effectType: { const: 'motion-pattern' } },
      },
      then: {
        required: ['motionPattern'],
      },
    },
  ],
} as any

export const yargEventSchema: JSONSchemaType<YargEventNode> = {
  type: 'object',
  required: ['id', 'type', 'eventType'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'event' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    // Uses YARG_EVENT_TYPES which includes both system events (cue-started, cue-called)
    // and song events (beat, measure, keyframe, instruments, etc.)
    eventType: { type: 'string', enum: YARG_EVENT_TYPES },
  },
}

export const audioEventSchema: JSONSchemaType<AudioEventNode> = {
  type: 'object',
  required: ['id', 'type', 'eventType', 'triggerMode'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'event' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    eventType: { type: 'string', enum: AUDIO_EVENT_TYPES },
    threshold: { type: 'number', nullable: true, minimum: 0, maximum: 1 },
    triggerMode: { type: 'string', enum: ['edge', 'level'] },
    cooldownMs: { type: 'number', nullable: true, minimum: 0 },
    useOnsetGating: { type: 'boolean', nullable: true },
    onsetThreshold: { type: 'number', nullable: true, minimum: 0, maximum: 1 },
  },
}

export const spectralGateRangeSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    min: { type: 'number', minimum: 0, maximum: 1 },
    max: { type: 'number', minimum: 0, maximum: 1 },
  },
}

export const audioTriggerSpectralGatesSchema = {
  type: 'object' as const,
  additionalProperties: false,
  nullable: true,
  properties: {
    flatness: spectralGateRangeSchema,
    zeroCrossingRate: spectralGateRangeSchema,
    hfcOnset: spectralGateRangeSchema,
    crest: spectralGateRangeSchema,
  },
}

export const audioTriggerInstrumentPresetIds = [
  'sub-bass',
  'kick',
  'snare',
  'bass-guitar',
  'electric-guitar',
  'vocals',
  'hi-hat-cymbals',
  'full-kit',
] as const

export const audioTriggerSchema = {
  type: 'object' as const,
  required: [
    'id',
    'type',
    'eventType',
    'frequencyRange',
    'threshold',
    'color',
    'nodeLabel',
    'outputs',
  ],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'event' },
    eventType: { type: 'string', const: 'audio-trigger' },
    label: { type: 'string', nullable: true },
    frequencyRange: {
      type: 'object',
      required: ['minHz', 'maxHz'],
      additionalProperties: false,
      properties: {
        minHz: { type: 'number', minimum: 20, maximum: 20000 },
        maxHz: { type: 'number', minimum: 20, maximum: 20000 },
      },
    },
    threshold: { type: 'number', minimum: 0, maximum: 1 },
    hysteresis: { type: 'number', minimum: 0, maximum: 1, nullable: true },
    holdMs: { type: 'number', minimum: 0, nullable: true },
    smoothing: { type: 'number', minimum: 0, maximum: 1, nullable: true },
    spectralGates: audioTriggerSpectralGatesSchema,
    useOnsetGating: { type: 'boolean', nullable: true },
    onsetThreshold: { type: 'number', nullable: true, minimum: 0, maximum: 1 },
    appliedTriggerPreset: {
      type: 'string',
      nullable: true,
      enum: [...audioTriggerInstrumentPresetIds],
    },
    triggerPresetDirty: { type: 'boolean', nullable: true },
    color: { type: 'string', minLength: 1 },
    nodeLabel: { type: 'string' },
    outputs: {
      type: 'array',
      items: { type: 'string', enum: ['enter', 'during', 'exit'] },
      minItems: 3,
      maxItems: 3,
    },
  },
} as any

export const connectionSchema: JSONSchemaType<{
  from: string
  to: string
  fromPort?: string
  toPort?: string
}> = {
  type: 'object',
  required: ['from', 'to'],
  additionalProperties: false,
  properties: {
    from: stringIdSchema,
    to: stringIdSchema,
    fromPort: { type: 'string', nullable: true },
    toPort: { type: 'string', nullable: true },
  },
}

export const layoutSchema: JSONSchemaType<NodeLayoutMetadata> = {
  type: 'object',
  additionalProperties: false,
  required: ['nodePositions'],
  properties: {
    nodePositions: {
      type: 'object',
      required: [] as const,
      additionalProperties: {
        type: 'object',
        required: ['x', 'y'],
        additionalProperties: false,
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
        },
      },
    },
    viewport: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      required: ['x', 'y', 'zoom'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        zoom: { type: 'number', minimum: 0.01 },
      },
    },
  },
}
