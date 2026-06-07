import { JSONSchemaType } from 'ajv'
import {
  YARG_CUE_DATA_PROPERTIES,
  AUDIO_CUE_DATA_PROPERTIES,
  ALL_CONFIG_DATA_PROPERTIES,
} from '../../../constants/nodeConstants'
import type {
  ArrayLengthLogicNode,
  ColorFromIndexLogicNode,
  ConcatColorsLogicNode,
  ConcatLightsLogicNode,
  ConditionalLogicNode,
  ConfigDataLogicNode,
  CueDataLogicNode,
  CreatePairsLogicNode,
  DebuggerLogicNode,
  DelayLogicNode,
  ForEachLightLogicNode,
  LightsFromIndexLogicNode,
  LogicNode,
  MathLogicNode,
  RandomLogicNode,
  ReverseColorsLogicNode,
  ReverseLightsLogicNode,
  ShuffleColorsLogicNode,
  ShuffleLightsLogicNode,
  VariableLogicNode,
} from '../../types/nodeCueTypes'
import { LOGIC_COMPARATORS, MATH_OPERATORS } from './helpers'
import { stringIdSchema, valueSourceSchema, colorArrayValueSourceSchema } from './primitives'

// Combine cue data properties without duplicates (dedupe overlapping properties like 'cue-name', 'bpm', 'execution-count')
const CUE_DATA_PROPERTIES = [
  ...new Set([...YARG_CUE_DATA_PROPERTIES, ...AUDIO_CUE_DATA_PROPERTIES]),
]

// Use shared config data properties
const CONFIG_DATA_PROPERTIES = ALL_CONFIG_DATA_PROPERTIES

const variableLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'mode', 'varName', 'valueType'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'variable' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    mode: { type: 'string', enum: ['set', 'get', 'init'] as const },
    varName: { type: 'string' },
    valueType: {
      type: 'string',
      enum: [
        'number',
        'boolean',
        'string',
        'color',
        'light-array',
        'color-array',
        'cue-type',
        'event',
      ] as const,
    },
    value: { ...valueSourceSchema, nullable: true },
  },
} as unknown as JSONSchemaType<VariableLogicNode>

const mathLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'operator', 'left', 'right'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'math' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    operator: { type: 'string', enum: MATH_OPERATORS },
    left: valueSourceSchema,
    right: valueSourceSchema,
    assignTo: { type: 'string', nullable: true },
  },
} as unknown as JSONSchemaType<MathLogicNode>

const conditionalLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'comparator', 'left', 'right'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'conditional' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    comparator: { type: 'string', enum: LOGIC_COMPARATORS },
    left: valueSourceSchema,
    right: valueSourceSchema,
  },
} as unknown as JSONSchemaType<ConditionalLogicNode>

const cueDataLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'dataProperty'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'cue-data' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    dataProperty: { type: 'string', enum: CUE_DATA_PROPERTIES },
    assignTo: { type: 'string', nullable: true },
  },
} as unknown as JSONSchemaType<CueDataLogicNode>

const configDataLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'dataProperty'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'config-data' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    dataProperty: { type: 'string', enum: CONFIG_DATA_PROPERTIES },
    assignTo: { type: 'string', nullable: true },
  },
} as unknown as JSONSchemaType<ConfigDataLogicNode>

const lightsFromIndexLogicSchema = {
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

const colorFromIndexLogicSchema = {
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

const reverseColorsLogicSchema = {
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

const concatColorsLogicSchema = {
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

const shuffleColorsLogicSchema = {
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

const arrayLengthLogicSchema = {
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

const reverseLightsLogicSchema = {
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

const createPairsLogicSchema = {
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

const concatLightsLogicSchema = {
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

const delayLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'delayTime'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'delay' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    delayTime: valueSourceSchema,
  },
} as unknown as JSONSchemaType<DelayLogicNode>

const debuggerLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'message', 'variablesToLog'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'debugger' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    message: valueSourceSchema,
    variablesToLog: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as unknown as JSONSchemaType<DebuggerLogicNode>

const randomLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'mode', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'random' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    mode: { type: 'string', enum: ['random-integer', 'random-choice', 'random-light'] },
    min: { ...valueSourceSchema, nullable: true },
    max: { ...valueSourceSchema, nullable: true },
    choices: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariable: { type: 'string', nullable: true },
    count: { ...valueSourceSchema, nullable: true },
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<RandomLogicNode>

const shuffleLightsLogicSchema = {
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

const forEachLightLogicSchema = {
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

export const logicNodeSchema = {
  oneOf: [
    variableLogicSchema,
    mathLogicSchema,
    conditionalLogicSchema,
    cueDataLogicSchema,
    configDataLogicSchema,
    lightsFromIndexLogicSchema,
    colorFromIndexLogicSchema,
    reverseColorsLogicSchema,
    concatColorsLogicSchema,
    shuffleColorsLogicSchema,
    arrayLengthLogicSchema,
    reverseLightsLogicSchema,
    createPairsLogicSchema,
    concatLightsLogicSchema,
    delayLogicSchema,
    debuggerLogicSchema,
    randomLogicSchema,
    shuffleLightsLogicSchema,
    forEachLightLogicSchema,
  ],
} as unknown as JSONSchemaType<LogicNode>
