import { TrackedLight } from '../../../types'

/**
 * Variable value stored in variable stores.
 */
export interface VariableValue {
  type: 'number' | 'boolean' | 'string' | 'color' | 'light-array' | 'cue-type' | 'event'
  value: number | boolean | string | TrackedLight[]
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
 * Effect completion callback.
 */
export type EffectCompletionCallback = () => void

/**
 * Optional runtime callbacks for debug/error emission. When provided,
 * the engine uses them in preference to sendToAllWindows; when absent,
 * engines fall back to main-process emission.
 */
export interface NodeRuntimeCallbacks {
  emit(channel: string, payload: unknown): void
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
