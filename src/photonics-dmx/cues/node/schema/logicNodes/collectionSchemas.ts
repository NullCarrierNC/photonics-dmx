/**
 * Schemas for the logic nodes that build and reshape light and colour collections.
 */
import { JSONSchemaType } from 'ajv'
import type {
  ArrayLengthLogicNode,
  BuildRingLogicNode,
  ColorFromIndexLogicNode,
  ConcatColorsLogicNode,
  ConcatLightsLogicNode,
  CreatePairsLogicNode,
  ForEachLightLogicNode,
  LightsFromIndexLogicNode,
  ReverseColorsLogicNode,
  ReverseLightsLogicNode,
  ShuffleColorsLogicNode,
  ShuffleLightsLogicNode,
} from '../../../types/nodeCueTypes'
import { stringIdSchema, valueSourceSchema, colorArrayValueSourceSchema } from '../primitives'

export const lightsFromIndexLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariable', 'index', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'lights-from-index' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariable: { type: 'string' },
    index: valueSourceSchema,
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<LightsFromIndexLogicNode>

export const colorFromIndexLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'colors', 'index', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'color-from-index' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    // Palette: an inline literal Color[] (each entry enum-validated against COLOR_OPTIONS, so
    // typos are rejected at load) or a reference to a color-array variable.
    colors: colorArrayValueSourceSchema,
    index: valueSourceSchema,
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<ColorFromIndexLogicNode>

export const reverseColorsLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariable', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'reverse-colors' },
    label: { type: 'string', nullable: true },
    outputs: { type: 'array', nullable: true, items: { type: 'string' } },
    sourceVariable: { type: 'string' },
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<ReverseColorsLogicNode>

export const concatColorsLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariables', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'concat-colors' },
    label: { type: 'string', nullable: true },
    outputs: { type: 'array', nullable: true, items: { type: 'string' } },
    sourceVariables: { type: 'array', items: { type: 'string' }, minItems: 1 },
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<ConcatColorsLogicNode>

export const shuffleColorsLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariable', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'shuffle-colors' },
    label: { type: 'string', nullable: true },
    outputs: { type: 'array', nullable: true, items: { type: 'string' } },
    sourceVariable: { type: 'string' },
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<ShuffleColorsLogicNode>

export const arrayLengthLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariable', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'array-length' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariable: { type: 'string' },
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<ArrayLengthLogicNode>

export const reverseLightsLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariable', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'reverse-lights' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariable: { type: 'string' },
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<ReverseLightsLogicNode>

export const createPairsLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'pairType', 'sourceVariable', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'create-pairs' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    pairType: { type: 'string', enum: ['opposite', 'diagonal'] as const },
    sourceVariable: { type: 'string' },
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<CreatePairsLogicNode>

export const concatLightsLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariables', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'concat-lights' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariables: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<ConcatLightsLogicNode>

export const buildRingLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'assignTo', 'assignGroupSize'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'build-ring' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    assignTo: { type: 'string' },
    assignGroupSize: { type: 'string' },
  },
} as unknown as JSONSchemaType<BuildRingLogicNode>

export const shuffleLightsLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariable', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'shuffle-lights' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariable: { type: 'string' },
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<ShuffleLightsLogicNode>

export const forEachLightLogicSchema = {
  type: 'object',
  required: [
    'id',
    'type',
    'logicType',
    'sourceVariable',
    'currentLightVariable',
    'currentIndexVariable',
  ],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'for-each-light' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariable: { type: 'string' },
    currentLightVariable: { type: 'string' },
    currentIndexVariable: { type: 'string' },
    groupSize: { ...valueSourceSchema, nullable: true },
  },
} as unknown as JSONSchemaType<ForEachLightLogicNode>
