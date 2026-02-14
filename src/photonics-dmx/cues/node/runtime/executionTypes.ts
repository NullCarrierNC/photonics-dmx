import { TrackedLight } from '../../../types';

/**
 * Variable value stored in variable stores.
 */
export interface VariableValue {
  type: 'number' | 'boolean' | 'string' | 'color' | 'light-array' | 'cue-type' | 'event';
  value: number | boolean | string | TrackedLight[];
}

/**
 * Callback fired when a node completes execution.
 */
export type NodeCompletionCallback = (nodeId: string) => void;

/**
 * Callback fired when an execution context completes.
 */
export type ContextCompletionCallback = () => void;

/**
 * Execution state for debugging and monitoring.
 */
export interface ExecutionState {
  activeContexts: {
    id: string;
    eventNodeId: string;
    eventType: string;
    startTime: number;
    visitedNodes: string[];
    activeNodes: string[];
  }[];
}

/**
 * Effect completion callback.
 */
export type EffectCompletionCallback = () => void;
