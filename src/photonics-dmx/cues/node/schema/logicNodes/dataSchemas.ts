/**
 * Schemas for the logic nodes that read runtime data: cue and config properties, indexed
 * variables, LED edges, and the debugger.
 */
import { JSONSchemaType } from 'ajv'
import { VARIABLE_TYPES } from '../../../types/nodeCueTypes'
import {
  NET_CUE_DATA_PROPERTIES,
  AUDIO_CUE_DATA_PROPERTIES,
  ALL_CONFIG_DATA_PROPERTIES,
} from '../../../../constants/nodeConstants'
import type {
  ConfigDataLogicNode,
  CueDataLogicNode,
  DebuggerLogicNode,
  IndexedVariableLogicNode,
  LedChangedLogicNode,
} from '../../../types/nodeCueTypes'
import { stringIdSchema, valueSourceSchema } from '../primitives'

const CUE_DATA_PROPERTIES = [...new Set([...NET_CUE_DATA_PROPERTIES, ...AUDIO_CUE_DATA_PROPERTIES])]
const CONFIG_DATA_PROPERTIES = ALL_CONFIG_DATA_PROPERTIES

export const cueDataLogicSchema = {
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

export const configDataLogicSchema = {
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

export const debuggerLogicSchema = {
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

export const indexedVariableLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'mode', 'varName', 'index', 'valueType'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'indexed-variable' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    mode: { type: 'string', enum: ['get', 'set'] as const },
    varName: { type: 'string' },
    index: valueSourceSchema,
    valueType: {
      type: 'string',
      enum: VARIABLE_TYPES,
    },
    value: { ...valueSourceSchema, nullable: true },
    assignTo: { type: 'string', nullable: true },
  },
} as unknown as JSONSchemaType<IndexedVariableLogicNode>

export const ledChangedLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'assignIndex'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'led-changed' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    assignIndex: { type: 'string' },
    assignColor: { type: 'string', nullable: true },
    assignEdge: { type: 'string', nullable: true },
  },
} as unknown as JSONSchemaType<LedChangedLogicNode>
