/**
 * Schemas for the logic nodes that compute a value: variables, maths, comparisons and rolls.
 */
import { JSONSchemaType } from 'ajv'
import { VARIABLE_TYPES } from '../../../types/nodeCueTypes'
import type {
  ClampLogicNode,
  ExpressionLogicNode,
  SelectFromListLogicNode,
  PulseLogicNode,
  ConditionalLogicNode,
  MathLogicNode,
  RandomLogicNode,
  VariableLogicNode,
} from '../../../types/nodeCueTypes'
import { LOGIC_COMPARATORS, MATH_OPERATORS } from '../helpers'
import { stringIdSchema, valueSourceSchema } from '../primitives'

export const variableLogicSchema = {
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
      enum: VARIABLE_TYPES,
    },
    value: { ...valueSourceSchema, nullable: true },
    assignments: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        required: ['varName', 'valueType'],
        additionalProperties: false,
        properties: {
          varName: { type: 'string' },
          valueType: {
            type: 'string',
            enum: VARIABLE_TYPES,
          },
          value: { ...valueSourceSchema, nullable: true },
        },
      },
    },
  },
} as unknown as JSONSchemaType<VariableLogicNode>

export const mathLogicSchema = {
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

export const expressionLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'expression', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'expression' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    expression: { type: 'string', minLength: 1 },
    assignTo: { type: 'string', minLength: 1 },
  },
} as unknown as JSONSchemaType<ExpressionLogicNode>

export const clampLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'value', 'min', 'max', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'clamp' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    value: valueSourceSchema,
    min: valueSourceSchema,
    max: valueSourceSchema,
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<ClampLogicNode>

export const selectFromListLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'list', 'index', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'select-from-list' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    list: { type: 'array', items: { type: 'number' } },
    index: valueSourceSchema,
    assignTo: { type: 'string' },
  },
} as unknown as JSONSchemaType<SelectFromListLogicNode>

export const pulseLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'interval', 'anchorVar', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'pulse' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    interval: valueSourceSchema,
    anchorVar: { type: 'string' },
    assignTo: { type: 'string' },
    assignPhase: { type: 'string', nullable: true },
  },
} as unknown as JSONSchemaType<PulseLogicNode>

export const conditionalLogicSchema = {
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

export const randomLogicSchema = {
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
    rolls: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        required: ['mode', 'assignTo'],
        additionalProperties: false,
        properties: {
          mode: {
            type: 'string',
            enum: ['random-integer', 'random-choice', 'random-light'] as const,
          },
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
      },
    },
  },
} as unknown as JSONSchemaType<RandomLogicNode>
