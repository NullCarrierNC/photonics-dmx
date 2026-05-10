import { JSONSchemaType } from 'ajv'
import {
  ActionTimingConfig,
  EffectReference,
  EventDefinition,
  NodeActionConfig,
  NodeMotionPatternSetting,
  NodePositionSetting,
  ValueSource,
  VariableDefinition,
} from '../../types/nodeCueTypes'
export const stringIdSchema: JSONSchemaType<string> = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
}

export const valueSourceSchema: JSONSchemaType<ValueSource> = {
  type: 'object',
  required: ['source'],
  additionalProperties: false,
  properties: {
    source: { type: 'string', enum: ['literal', 'variable'] },
    value: { type: ['number', 'boolean', 'string'], nullable: true },
    name: { type: 'string', nullable: true },
    // fallback accepted for backwards compatibility with existing cue files; ignored at runtime
    fallback: { type: ['number', 'boolean', 'string'], nullable: true },
  },
  allOf: [
    {
      if: {
        properties: {
          source: { const: 'literal' },
        },
      },
      then: {
        required: ['value'],
      },
    },
    {
      if: {
        properties: {
          source: { const: 'variable' },
        },
      },
      then: {
        required: ['name'],
      },
    },
  ],
} as unknown as JSONSchemaType<ValueSource>

export const colorSchema: JSONSchemaType<{
  name: ValueSource
  brightness: ValueSource
  blendMode?: ValueSource
  opacity?: ValueSource
}> = {
  type: 'object',
  required: ['name', 'brightness'],
  additionalProperties: false,
  properties: {
    name: valueSourceSchema,
    brightness: valueSourceSchema,
    blendMode: { ...valueSourceSchema, nullable: true },
    opacity: { ...valueSourceSchema, nullable: true },
  },
} as unknown as JSONSchemaType<{
  name: ValueSource
  brightness: ValueSource
  blendMode?: ValueSource
  opacity?: ValueSource
}>

export const positionSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['pan', 'tilt'],
      properties: {
        pan: valueSourceSchema,
        tilt: valueSourceSchema,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['mode', 'bearing', 'angle'],
      properties: {
        mode: { type: 'string', const: 'direction' },
        bearing: valueSourceSchema,
        angle: valueSourceSchema,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['mode', 'pan', 'tilt'],
      properties: {
        mode: { type: 'string', const: 'offset' },
        pan: valueSourceSchema,
        tilt: valueSourceSchema,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['mode', 'pan', 'tilt'],
      properties: {
        mode: { type: 'string', const: 'absolute' },
        pan: valueSourceSchema,
        tilt: valueSourceSchema,
      },
    },
  ],
} as unknown as JSONSchemaType<NodePositionSetting>

export const motionPatternSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pattern', 'speed', 'size'],
  properties: {
    pattern: valueSourceSchema,
    speed: valueSourceSchema,
    size: valueSourceSchema,
    bearing: { ...valueSourceSchema, nullable: true },
    fanSpread: { ...valueSourceSchema, nullable: true },
    linearSweepAxis: { ...valueSourceSchema, nullable: true },
    panWaveform: { ...valueSourceSchema, nullable: true },
    tiltWaveform: { ...valueSourceSchema, nullable: true },
    panAmplitude: { ...valueSourceSchema, nullable: true },
    tiltAmplitude: { ...valueSourceSchema, nullable: true },
    panPhaseOffset: { ...valueSourceSchema, nullable: true },
    reverse: { ...valueSourceSchema, nullable: true },
  },
} as unknown as JSONSchemaType<NodeMotionPatternSetting>

export const timingSchema: JSONSchemaType<ActionTimingConfig> = {
  type: 'object',
  required: ['waitForCondition', 'waitForTime', 'duration', 'waitUntilCondition', 'waitUntilTime'],
  additionalProperties: false,
  properties: {
    waitForCondition: valueSourceSchema,
    waitForTime: valueSourceSchema,
    waitForConditionCount: { ...valueSourceSchema, nullable: true },
    duration: valueSourceSchema,
    waitUntilCondition: valueSourceSchema,
    waitUntilTime: valueSourceSchema,
    waitUntilConditionCount: { ...valueSourceSchema, nullable: true },
    easing: { ...valueSourceSchema, nullable: true },
    level: { ...valueSourceSchema, nullable: true },
  },
} as unknown as JSONSchemaType<ActionTimingConfig>

export const actionConfigSchema: JSONSchemaType<NodeActionConfig> = {
  type: 'object',
  additionalProperties: false,
  required: [],
  properties: {
    custom: { type: 'object', nullable: true, additionalProperties: true },
  },
}

export const variableDefinitionSchema = {
  type: 'object',
  required: ['name', 'type', 'scope', 'initialValue'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$' },
    type: {
      type: 'string',
      enum: ['number', 'boolean', 'string', 'color', 'light-array', 'cue-type', 'event'],
    },
    scope: { type: 'string', enum: ['cue', 'cue-group'] },
    initialValue: { type: ['number', 'boolean', 'string', 'array'] },
    description: { type: 'string', nullable: true },
    isParameter: { type: 'boolean', nullable: true },
    validValues: { type: 'array', items: { type: 'string' }, nullable: true },
  },
} as unknown as JSONSchemaType<VariableDefinition>

export const eventDefinitionSchema: JSONSchemaType<EventDefinition> = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$' },
    description: { type: 'string', nullable: true },
  },
}

export const effectReferenceSchema: JSONSchemaType<EffectReference> = {
  type: 'object',
  required: ['effectId', 'effectFileId', 'name'],
  additionalProperties: false,
  properties: {
    effectId: { type: 'string', minLength: 1 },
    effectFileId: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
  },
}
