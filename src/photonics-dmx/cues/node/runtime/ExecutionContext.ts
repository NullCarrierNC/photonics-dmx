/**
 * Execution state for a single event chain.
 * Tracks progress through the node graph for one event execution.
 */

import { ActionNode, BaseEventNode } from '../../types/nodeCueTypes';
import { CueData } from '../../types/cueTypes';
import { AudioCueData } from '../../types/audioCueTypes';
import { VariableValue, NodeCompletionCallback, ContextCompletionCallback } from './executionTypes';

export class ExecutionContext {
  public readonly id: string;
  public readonly eventNode: BaseEventNode;
  public readonly startTime: number;
  
  private visitedNodes: Map<string, number> = new Map(); // nodeId -> phase when last visited
  private phase: number = 0;
  private activeNodes: Map<string, ActionNode> = new Map(); // Nodes waiting for completion
  /** Per-node state for for-each-light iteration (index for next iteration, length). */
  private forEachLightState: Map<string, { index: number; length: number }> = new Map();
  private completed = false;
  private activeTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  // Variable store references (shared with cue)
  public readonly cueLevelVarStore: Map<string, VariableValue>;
  public readonly groupLevelVarStore: Map<string, VariableValue>;
  
  // Cue data reference for data nodes
  public readonly cueData: CueData | AudioCueData;

  // Callbacks
  private onNodeCompleteCallback?: NodeCompletionCallback;
  private onContextCompleteCallback?: ContextCompletionCallback;

  constructor(
    eventNode: BaseEventNode,
    cueData: CueData | AudioCueData,
    cueLevelVarStore: Map<string, VariableValue>,
    groupLevelVarStore: Map<string, VariableValue>
  ) {
    this.id = `${eventNode.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.eventNode = eventNode;
    this.startTime = Date.now();
    this.cueData = cueData;
    this.cueLevelVarStore = cueLevelVarStore;
    this.groupLevelVarStore = groupLevelVarStore;
  }

  /**
   * Set callback for when a node completes.
   */
  public setOnNodeComplete(callback: NodeCompletionCallback): void {
    this.onNodeCompleteCallback = callback;
  }

  /**
   * Set callback for when the entire context completes.
   */
  public setOnContextComplete(callback: ContextCompletionCallback): void {
    this.onContextCompleteCallback = callback;
  }

  /**
   * Mark a node as visited in the current phase.
   */
  public markVisited(nodeId: string): void {
    this.visitedNodes.set(nodeId, this.phase);
  }

  /**
   * Check if a node has been visited in the current phase (allows re-execution after advancePhase).
   */
  public hasVisited(nodeId: string): boolean {
    return this.visitedNodes.get(nodeId) === this.phase;
  }

  /**
   * Get iteration state for a for-each-light node. Returns undefined if not yet started.
   */
  public getForEachLightState(nodeId: string): { index: number; length: number } | undefined {
    return this.forEachLightState.get(nodeId);
  }

  /**
   * Set iteration state for a for-each-light node (next index and length).
   */
  public setForEachLightState(nodeId: string, state: { index: number; length: number }): void {
    this.forEachLightState.set(nodeId, state);
  }

  /**
   * Clear iteration state for a for-each-light node (when loop is done).
   */
  public clearForEachLightState(nodeId: string): void {
    this.forEachLightState.delete(nodeId);
  }

  /**
   * Advance the execution phase. Called when execution resumes from a blocking node (action or delay)
   * so that logic nodes can re-execute in the new phase (enables Action -> Math -> Conditional -> Action loops).
   */
  public advancePhase(): void {
    this.phase++;
  }

  /**
   * Register an active action node (waiting for completion).
   */
  public registerActiveAction(nodeId: string, actionNode: ActionNode): void {
    this.activeNodes.set(nodeId, actionNode);
  }

  /**
   * Mark an action node as complete and remove from active set (no callback).
   * Used for intermediate chain members so only the last action triggers continuation.
   */
  public completeActionSilent(nodeId: string): void {
    this.activeNodes.delete(nodeId);
  }

  /**
   * Mark an action node as complete and remove from active set.
   */
  public completeAction(nodeId: string): void {
    if (!this.activeNodes.has(nodeId)) return;
    this.activeNodes.delete(nodeId);
    if (this.onNodeCompleteCallback) {
      this.onNodeCompleteCallback(nodeId);
    }
  }

  /**
   * Register a timer (e.g. from delay node) so it can be cleared on dispose.
   */
  public addTimer(timerId: ReturnType<typeof setTimeout>): void {
    this.activeTimers.add(timerId);
  }

  /**
   * Unregister a timer (e.g. when delay callback runs).
   */
  public removeTimer(timerId: ReturnType<typeof setTimeout>): void {
    this.activeTimers.delete(timerId);
  }

  /**
   * Check if any actions are still active.
   */
  public hasActiveActions(): boolean {
    return this.activeNodes.size > 0;
  }

  /**
   * Check if execution is complete (no active nodes). Pure getter, no side effects.
   */
  public isComplete(): boolean {
    return !this.hasActiveActions();
  }

  /**
   * If execution is complete, fire the context-complete callback once and return true.
   * Safe to call multiple times; callback fires at most once.
   * Returns false while there are active actions, even if completed was set earlier.
   */
  public tryComplete(): boolean {
    if (this.hasActiveActions()) return false;
    if (this.completed) return true;
    this.completed = true;
    if (this.onContextCompleteCallback) {
      this.onContextCompleteCallback();
    }
    return true;
  }

  /**
   * Get debug info about this context.
   */
  public getDebugInfo() {
    return {
      id: this.id,
      eventNodeId: this.eventNode.id,
      startTime: this.startTime,
      phase: this.phase,
      visitedNodes: Array.from(this.visitedNodes.keys()),
      activeNodes: Array.from(this.activeNodes.keys())
    };
  }

  /**
   * Clean up context resources. Clears all active delay timers.
   */
  public dispose(): void {
    for (const timerId of this.activeTimers) {
      clearTimeout(timerId);
    }
    this.activeTimers.clear();
    this.visitedNodes.clear();
    this.phase = 0;
    this.activeNodes.clear();
    this.forEachLightState.clear();
    this.onNodeCompleteCallback = undefined;
    this.onContextCompleteCallback = undefined;
  }
}
