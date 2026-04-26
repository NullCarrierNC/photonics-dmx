import { JSONSchemaType } from 'ajv'
import {
  YARG_CUE_DATA_PROPERTIES,
  AUDIO_CUE_DATA_PROPERTIES,
  ALL_CONFIG_DATA_PROPERTIES,
} from '../../../constants/nodeConstants'
import { LogicNode } from '../../types/nodeCueTypes'
import { LOGIC_COMPARATORS, MATH_OPERATORS } from './helpers'
import { stringIdSchema, valueSourceSchema } from './primitives'

// Combine cue data properties without duplicates (dedupe overlapping properties like 'cue-name', 'bpm', 'execution-count')
const CUE_DATA_PROPERTIES = [
  ...new Set([...YARG_CUE_DATA_PROPERTIES, ...AUDIO_CUE_DATA_PROPERTIES]),
]

// Use shared config data properties
const CONFIG_DATA_PROPERTIES = ALL_CONFIG_DATA_PROPERTIES

const variableLogicSchema: JSONSchemaType<LogicNode> = {
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
      enum: ['number', 'boolean', 'string', 'color', 'light-array', 'cue-type', 'event'] as const,
    },
    value: { ...valueSourceSchema, nullable: true },
  },
} as any

const mathLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const conditionalLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const cueDataLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const configDataLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const lightsFromIndexLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const arrayLengthLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const reverseLightsLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const createPairsLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const concatLightsLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const delayLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const debuggerLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const randomLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const shuffleLightsLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

const forEachLightLogicSchema: JSONSchemaType<LogicNode> = {
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
} as any

export const logicNodeSchema: JSONSchemaType<LogicNode> = {
  oneOf: [
    variableLogicSchema,
    mathLogicSchema,
    conditionalLogicSchema,
    cueDataLogicSchema,
    configDataLogicSchema,
    lightsFromIndexLogicSchema,
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
} as any
