import { TrackedLight, Color, isColor } from '../../../types'
import type { VariableType } from '../../types/nodeCueTypes'

/**
 * Variable value stored in variable stores.
 */
export interface VariableValue {
  type:
    | 'number'
    | 'boolean'
    | 'string'
    | 'color'
    | 'light-array'
    | 'color-array'
    | 'cue-type'
    | 'event'
  value: number | boolean | string | TrackedLight[] | Color[]
}

/** A number from an authored or stored value, with 0 for anything unreadable. */
function toNumber(raw: unknown): number {
  if (typeof raw === 'boolean') return raw ? 1 : 0
  const n = typeof raw === 'string' ? parseFloat(raw) : raw
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0
}

/**
 * A variable of `type` holding `raw`, read as that type. Light arrays come only from the rig at
 * runtime, so a light-array variable starts empty.
 */
export function variableValue(type: VariableType, raw: unknown): VariableValue {
  switch (type) {
    case 'number':
      return { type, value: toNumber(raw) }
    case 'boolean':
      return { type, value: raw === true || raw === 'true' }
    case 'light-array':
      return { type, value: [] }
    case 'color-array':
      return { type, value: Array.isArray(raw) ? raw.filter(isColor) : [] }
    default:
      return { type, value: String(raw) }
  }
}

/**
 * Callback fired when a node completes execution.
 */
export type NodeCompletionCallback = (nodeId: string) => void

/**
 * Callback fired when an execution context completes.
 */
export type ContextCompletionCallback = () => void

/**
 * Execution state for debugging and monitoring.
 */
export interface ExecutionState {
  activeContexts: {
    id: string
    eventNodeId: string
    eventType: string
    startTime: number
    visitedNodes: string[]
    activeNodes: string[]
  }[]
}

/**
 * Optional runtime callbacks for debug/error emission. When provided,
 * the engine uses them in preference to {@link RuntimeBroadcaster}; when absent,
 * engines fall back to main-process emission.
 */
export interface NodeRuntimeCallbacks {
  emit(channel: string, payload: unknown): void
}

/**
 * Turns node-cue debug logging on and off while engines run. Its owner hands the same object to
 * every engine, so a change reaches the engines already running.
 */
export interface NodeCueDebugSwitch {
  enabled: boolean
}

/**
 * Explicit high-level run state layered on top of the existing ExecutionContext-based runtime.
 */
export enum ExecutionPhase {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  BLOCKED = 'BLOCKED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
