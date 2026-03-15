/**
 * V2 runtime types: explicit execution state, blocker shape (reserved), and re-export of injected callbacks.
 */

/** Explicit high-level run state layered on top of the existing ExecutionContext-based runtime. */
export enum ExecutionPhase {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  BLOCKED = 'BLOCKED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Re-export for convenience; defined in runtime/executionTypes to avoid runtime depending on v2. */
export type { NodeRuntimeCallbacks } from '../runtime/executionTypes'
