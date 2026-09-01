/**
 * Schemas for the logic nodes that gate on time: frame divisors, tempo and delay.
 */
import { JSONSchemaType } from 'ajv'
import type {
  FrameGateLogicNode,
  TempoLogicNode,
  DelayLogicNode,
} from '../../../types/nodeCueTypes'
import { stringIdSchema, valueSourceSchema } from '../primitives'

export const frameGateLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'divisor'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'frame-gate' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    divisor: valueSourceSchema,
  },
} as unknown as JSONSchemaType<FrameGateLogicNode>

export const tempoLogicSchema = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'assignBeatMs'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'tempo' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    assignBeatMs: { type: 'string' },
    assignBarMs: { type: 'string', nullable: true },
    assignPhraseMs: { type: 'string', nullable: true },
    beatsPerBar: { ...valueSourceSchema, nullable: true },
    barsPerPhrase: { ...valueSourceSchema, nullable: true },
    minBeatMs: { ...valueSourceSchema, nullable: true },
    maxBeatMs: { ...valueSourceSchema, nullable: true },
    fallbackBeatMs: { ...valueSourceSchema, nullable: true },
    assignCycles: { type: 'string', nullable: true },
    cycleBands: {
      type: 'array',
      nullable: true,
      items: { type: 'number' },
    },
    cycleValues: {
      type: 'array',
      nullable: true,
      items: { type: 'number' },
    },
  },
} as unknown as JSONSchemaType<TempoLogicNode>

export const delayLogicSchema = {
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
