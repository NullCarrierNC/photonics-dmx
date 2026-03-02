/**
 * Execution state for a single event chain.
 * Tracks progress through the node graph for one event execution.
 */

import { ActionNode, BaseEventNode } from '../../types/nodeCueTypes'
import { CueData } from '../../types/cueTypes'
import { AudioCueData } from '../../types/audioCueTypes'
import { VariableValue, NodeCompletionCallback, ContextCompletionCallback } from './executionTypes'

export class ExecutionContext {
  public readonly id: string
  public readonly eventNode: BaseEventNode
  public readonly startTime: number

  private visitedNodes: Map<string, number> = new Map() // nodeId -> phase when last visited
  private phase: number = 0
  private activeNodes: Map<string, ActionNode> = new Map() // Nodes waiting for completion
  /**
   * Depth counter incremented while a synchronous node-dispatch batch is in progress.
   * Prevents premature context disposal when a dead-end branch is encountered before
   * a sibling branch has had a chance to register a blocking node (e.g. delay).
   */
  private batchDepth: number = 0
  /** Per-node state for for-each-light iteration (index for next iteration, length). */
  private forEachLightState: Map<string, { index: number; length: number }> = new Map()
  /** Current iteration index when inside a for-each-light body (for unique effect naming). */
  private forEachIterationIndex: number = -1
  private completed = false
  private activeTimers: Set<ReturnType<typeof setTimeout>> = new Set()

  // Variable store references (shared with cue)
  public readonly cueLevelVarStore: Map<string, VariableValue>
  public readonly groupLevelVarStore: Map<string, VariableValue>

  // Cue data reference for data nodes
  public readonly cueData: CueData | AudioCueData

  // Callbacks
  private onNodeCompleteCallback?: NodeCompletionCallback
  private onContextCompleteCallback?: ContextCompletionCallback

  constructor(
    eventNode: BaseEventNode,
    cueData: CueData | AudioCueData,
    cueLevelVarStore: Map<string, VariableValue>,
    groupLevelVarStore: Map<string, VariableValue>,
  ) {
    this.id = `${eventNode.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    this.eventNode = eventNode
    this.startTime = Date.now()
    this.cueData = cueData
    this.cueLevelVarStore = cueLevelVarStore
    this.groupLevelVarStore = groupLevelVarStore
  }

  /**
   * Set callback for when a node completes.
   */
  public setOnNodeComplete(callback: NodeCompletionCallback): void {
    this.onNodeCompleteCallback = callback
  }

  /**
   * Set callback for when the entire context completes.
   */
  public setOnContextComplete(callback: ContextCompletionCallback): void {
    this.onContextCompleteCallback = callback
  }

  /**
   * Mark a node as visited in the current phase.
   */
  public markVisited(nodeId: string): void {
    this.visitedNodes.set(nodeId, this.phase)
  }

  /**
   * Check if a node has been visited in the current phase (allows re-execution after advancePhase).
   */
  public hasVisited(nodeId: string): boolean {
    return this.visitedNodes.get(nodeId) === this.phase
  }

  /**
   * Clear a node from the visited set so it can be re-executed (e.g. for-each-light body nodes each iteration).
   */
  public unmarkVisited(nodeId: string): void {
    this.visitedNodes.delete(nodeId)
  }

  /**
   * Get iteration state for a for-each-light node. Returns undefined if not yet started.
   */
  public getForEachLightState(nodeId: string): { index: number; length: number } | undefined {
    return this.forEachLightState.get(nodeId)
  }

  /**
   * Set iteration state for a for-each-light node (next index and length).
   */
  public setForEachLightState(nodeId: string, state: { index: number; length: number }): void {
    this.forEachLightState.set(nodeId, state)
  }

  /**
   * Clear iteration state for a for-each-light node (when loop is done).
   */
  public clearForEachLightState(nodeId: string): void {
    this.forEachLightState.delete(nodeId)
  }

  /**
   * Get the current for-each-light iteration index (-1 when not inside a for-each body).
   */
  public getForEachIterationIndex(): number {
    return this.forEachIterationIndex
  }

  /**
   * Set the current for-each-light iteration index (used for unique effect naming).
   */
  public setForEachIterationIndex(index: number): void {
    this.forEachIterationIndex = index
  }

  /**
   * Advance the execution phase. Called when execution resumes from a blocking node (action or delay)
   * so that logic nodes can re-execute in the new phase (enables Action -> Math -> Conditional -> Action loops).
   */
  public advancePhase(): void {
    this.phase++
  }

  /**
   * Signal that a synchronous node-dispatch batch is starting.
   * While batchDepth > 0, tryComplete() will not fire to avoid prematurely
   * disposing the context when a dead-end branch is reached before a sibling
   * branch has had a chance to register a blocking node (e.g. a delay).
   */
  public beginBatch(): void {
    this.batchDepth++
  }

  /**
   * Signal that a synchronous node-dispatch batch has ended.
   * The caller is responsible for calling tryComplete() after endBatch() returns.
   */
  public endBatch(): void {
    if (this.batchDepth > 0) this.batchDepth--
  }

  /**
   * Register an active action node (waiting for completion).
   */
  public registerActiveAction(nodeId: string, actionNode: ActionNode): void {
    this.activeNodes.set(nodeId, actionNode)
  }

  /**
   * Check whether a specific node is still registered as an active (blocking) action.
   * Used by delay timer callbacks to guard against phase-mismatch: other blocking nodes
   * can advance the execution phase while a delay waits, making hasVisited() unreliable.
   */
  public isActionActive(nodeId: string): boolean {
    return this.activeNodes.has(nodeId)
  }

  /**
   * Mark an action node as complete and remove from active set (no callback).
   * Used for intermediate chain members so only the last action triggers continuation.
   */
  public completeActionSilent(nodeId: string): void {
    this.activeNodes.delete(nodeId)
  }

  /**
   * Mark an action node as complete and remove from active set.
   */
  public completeAction(nodeId: string): void {
    if (!this.activeNodes.has(nodeId)) return
    this.activeNodes.delete(nodeId)
    if (this.onNodeCompleteCallback) {
      this.onNodeCompleteCallback(nodeId)
    }
  }

  /**
   * Register a timer (e.g. from delay node) so it can be cleared on dispose.
   */
  public addTimer(timerId: ReturnType<typeof setTimeout>): void {
    this.activeTimers.add(timerId)
  }

  /**
   * Unregister a timer (e.g. when delay callback runs).
   */
  public removeTimer(timerId: ReturnType<typeof setTimeout>): void {
    this.activeTimers.delete(timerId)
  }

  /**
   * Check if any actions are still active.
   */
  public hasActiveActions(): boolean {
    return this.activeNodes.size > 0
  }

  /**
   * Check if execution is complete (no active nodes). Pure getter, no side effects.
   */
  public isComplete(): boolean {
    return !this.hasActiveActions()
  }

  /**
   * If execution is complete, fire the context-complete callback once and return true.
   * Safe to call multiple times; callback fires at most once.
   * Returns false while there are active actions, a for-each-light loop is in progress,
   * or a synchronous node-dispatch batch is still running (batchDepth > 0).
   */
  public tryComplete(): boolean {
    if (this.hasActiveActions()) return false
    if (this.forEachLightState.size > 0) return false
    if (this.batchDepth > 0) return false
    if (this.completed) return true
    this.completed = true
    if (this.onContextCompleteCallback) {
      this.onContextCompleteCallback()
    }
    return true
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
      activeNodes: Array.from(this.activeNodes.keys()),
    }
  }

  /**
   * Clean up context resources. Clears all active delay timers.
   */
  public dispose(): void {
    for (const timerId of this.activeTimers) {
      clearTimeout(timerId)
    }
    this.activeTimers.clear()
    this.visitedNodes.clear()
    this.phase = 0
    this.batchDepth = 0
    this.activeNodes.clear()
    this.forEachLightState.clear()
    this.forEachIterationIndex = -1
    this.onNodeCompleteCallback = undefined
    this.onContextCompleteCallback = undefined
  }
}
