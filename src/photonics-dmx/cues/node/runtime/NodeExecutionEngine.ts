/**
 * Event-driven execution engine for node graphs.
 * Executes nodes sequentially, respecting blocking semantics.
 */

import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { CueData } from '../../types/cueTypes';
import {  CompiledYargCue, CompiledAudioCue } from '../compiler/NodeCueCompiler';
import { ActionEffectFactory } from '../compiler/ActionEffectFactory';
import {
  ActionNode,
  BaseEventNode,
  EventRaiserNode,
  EventListenerNode,
  LogicNode,
  ValueSource,
  VariableType,
  VariableDefinition
} from '../../types/nodeCueTypes';
import { ExecutionContext } from './ExecutionContext';
import { ExecutionState, VariableValue } from './executionTypes';

export class NodeExecutionEngine {
  private compiledCue: CompiledYargCue | CompiledAudioCue;
  private cueId: string;
  private activeContexts: Map<string, ExecutionContext> = new Map();
  private sequencer: ILightingController;
  private lightManager: DmxLightManager;
  private cueLevelVarStore: Map<string, VariableValue>;
  private groupLevelVarStore: Map<string, VariableValue>;
  private variableDefinitions: VariableDefinition[];
  private eventListeners: Map<string, EventListenerNode[]> = new Map();

  constructor(
    compiledCue: CompiledYargCue | CompiledAudioCue,
    cueId: string,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
    cueLevelVarStore: Map<string, VariableValue>,
    groupLevelVarStore: Map<string, VariableValue>,
    variableDefinitions: VariableDefinition[] = []
  ) {
    this.compiledCue = compiledCue;
    this.cueId = cueId;
    this.sequencer = sequencer;
    this.lightManager = lightManager;
    this.cueLevelVarStore = cueLevelVarStore;
    this.groupLevelVarStore = groupLevelVarStore;
    this.variableDefinitions = variableDefinitions;
    
    // Register all event listeners during initialization
    this.registerEventListeners();
  }

  /**
   * Register all event listeners from the compiled cue.
   */
  private registerEventListeners(): void {
    const { eventListenerMap } = this.compiledCue;
    for (const listener of eventListenerMap.values()) {
      // Skip listeners with no event selected
      if (!listener.eventName) {
        continue;
      }
      const listeners = this.eventListeners.get(listener.eventName) ?? [];
      listeners.push(listener);
      this.eventListeners.set(listener.eventName, listeners);
    }
  }

  /**
   * Start executing a node graph from an event node.
   * Creates a new ExecutionContext and begins execution.
   */
  public startExecution(eventNode: BaseEventNode, _parameters: CueData): void {
    try {
      const context = new ExecutionContext(
        eventNode,
        this.cueLevelVarStore,
        this.groupLevelVarStore
      );

      // Set up completion callbacks
      context.setOnNodeComplete((nodeId: string) => {
        this.onActionComplete(context.id, nodeId);
      });

      context.setOnContextComplete(() => {
        this.activeContexts.delete(context.id);
      });

      this.activeContexts.set(context.id, context);

      // Get outgoing edges from event node and start execution
      const { adjacency } = this.compiledCue;
      const outgoing = adjacency.get(eventNode.id) ?? [];
      const nextNodes = outgoing.map(conn => conn.to);

      if (nextNodes.length > 0) {
        this.continueExecution(nextNodes, context);
      } else {
        // No nodes to execute, context completes immediately
        context.dispose();
        this.activeContexts.delete(context.id);
      }
    } catch (error) {
      console.error(`Error starting execution for event ${eventNode.id}:`, error);
    }
  }

  /**
   * Execute a single node within a context.
   * Dispatches to appropriate handler based on node type.
   */
  private executeNode(nodeId: string, context: ExecutionContext): void {
    // Prevent cycles - don't execute a node twice in the same context
    if (context.hasVisited(nodeId)) {
      return;
    }

    context.markVisited(nodeId);

    const { actionMap, logicMap, eventRaiserMap } = this.compiledCue;

    // Check if it's an action node
    const actionNode = actionMap.get(nodeId);
    if (actionNode) {
      this.executeActionNode(actionNode, context);
      return;
    }

    // Check if it's a logic node
    const logicNode = logicMap.get(nodeId);
    if (logicNode) {
      this.executeLogicNode(logicNode, nodeId, context);
      return;
    }

    // Check if it's an event raiser node
    const eventRaiserNode = eventRaiserMap.get(nodeId);
    if (eventRaiserNode) {
      this.executeEventRaiserNode(eventRaiserNode, context);
      return;
    }

    // Unknown node type - skip and continue
    console.warn(`Unknown node type for node ${nodeId}`);
    this.continueToNextNodes(nodeId, context);
  }

  /**
   * Execute an action node: create effect and submit to sequencer.
   * The action blocks further execution until it completes.
   */
  private executeActionNode(actionNode: ActionNode, context: ExecutionContext): void {
    try {
      const lights = ActionEffectFactory.resolveLights(this.lightManager, actionNode.target);
      if (!lights || lights.length === 0) {
        // No lights to target, continue immediately
        this.continueToNextNodes(actionNode.id, context);
        return;
      }

      const effect = ActionEffectFactory.buildEffect({
        action: actionNode,
        lights,
        waitCondition: undefined,
        waitTime: 0
      });

      if (!effect) {
        // Failed to build effect, continue immediately
        this.continueToNextNodes(actionNode.id, context);
        return;
      }

      // Register this action as active (waiting for completion)
      context.registerActiveAction(actionNode.id, actionNode);

      // Generate unique effect name
      const effectName = `${this.cueId}:${context.eventNode.id}:${context.id}:${actionNode.id}`;

      // Submit effect to sequencer with completion callback
      this.sequencer.addEffectWithCallback(
        effectName,
        effect,
        () => {
          // This callback is fired when the effect completes
          if (context.hasVisited(actionNode.id)) {
            context.completeAction(actionNode.id);
          }
        },
        false // Not persistent
      );
    } catch (error) {
      console.error(`Error executing action node ${actionNode.id}:`, error);
      // Continue execution despite error
      this.continueToNextNodes(actionNode.id, context);
    }
  }

  /**
   * Execute a logic node: evaluate at runtime and continue to next nodes.
   * Logic nodes don't block - they execute immediately.
   */
  private executeLogicNode(logicNode: LogicNode, nodeId: string, context: ExecutionContext): void {
    try {
      const nextNodes = this.evaluateLogicNode(logicNode, nodeId, context);
      
      // Logic nodes execute immediately - continue to next nodes without waiting
      if (nextNodes.length > 0) {
        this.continueExecution(nextNodes, context);
      } else {
        // No more nodes, check if context is complete
        if (context.isComplete()) {
          context.dispose();
        }
      }
    } catch (error) {
      console.error(`Error executing logic node ${nodeId}:`, error);
      // Continue to all outgoing edges despite error
      this.continueToNextNodes(nodeId, context);
    }
  }

  /**
   * Execute an event raiser node: raise the event and continue immediately (non-blocking).
   */
  private executeEventRaiserNode(raiserNode: EventRaiserNode, context: ExecutionContext): void {
    try {
      const { eventName } = raiserNode;
      
      // Skip if no event selected
      if (!eventName) {
        console.warn(`Event raiser ${raiserNode.id} has no event selected, skipping`);
        this.continueToNextNodes(raiserNode.id, context);
        return;
      }
      
      // Fire all registered listeners for this event
      const listeners = this.eventListeners.get(eventName) ?? [];
      for (const listener of listeners) {
        // Create new execution context for each listener
        this.startListenerExecution(listener);
      }
      
      // Continue immediately to raiser's child (non-blocking)
      this.continueToNextNodes(raiserNode.id, context);
    } catch (error) {
      console.error(`Error executing event raiser node ${raiserNode.id}:`, error);
      // Continue execution despite error
      this.continueToNextNodes(raiserNode.id, context);
    }
  }

  /**
   * Start execution from a listener node.
   * Creates a new execution context for the listener chain.
   */
  private startListenerExecution(listenerNode: EventListenerNode): void {
    try {
      // Create new context for listener chain (treat listener as event-like node)
      const context = new ExecutionContext(
        listenerNode as any, // Treat as event-like node
        this.cueLevelVarStore,
        this.groupLevelVarStore
      );
      
      // Set up callbacks
      context.setOnNodeComplete((nodeId: string) => {
        this.onActionComplete(context.id, nodeId);
      });
      
      context.setOnContextComplete(() => {
        this.activeContexts.delete(context.id);
      });
      
      this.activeContexts.set(context.id, context);
      
      // Get listener's outgoing edges and start execution
      const { adjacency } = this.compiledCue;
      const outgoing = adjacency.get(listenerNode.id) ?? [];
      const nextNodes = outgoing.map(conn => conn.to);
      
      if (nextNodes.length > 0) {
        this.continueExecution(nextNodes, context);
      } else {
        // No child nodes, context completes immediately
        context.dispose();
        this.activeContexts.delete(context.id);
      }
    } catch (error) {
      console.error(`Error starting listener execution for ${listenerNode.id}:`, error);
    }
  }

  /**
   * Evaluate a logic node and determine which nodes to execute next.
   * This is where runtime variable evaluation happens.
   */
  private evaluateLogicNode(logicNode: LogicNode, nodeId: string, context: ExecutionContext): string[] {
    const { adjacency } = this.compiledCue;
    const edges = adjacency.get(nodeId) ?? [];

    switch (logicNode.logicType) {
      case 'variable': {
        if (logicNode.mode !== 'get') {
          const value = this.resolveValue(logicNode.valueType, logicNode.value, context);
          const varStore = this.getVariableStore(logicNode.varName);
          
          if (logicNode.mode === 'init') {
            if (!varStore.has(logicNode.varName)) {
              varStore.set(logicNode.varName, { type: logicNode.valueType, value });
            }
          } else {
            varStore.set(logicNode.varName, { type: logicNode.valueType, value });
          }
        }
        return edges.map(edge => edge.to);
      }

      case 'math': {
        const left = Number(this.resolveValue('number', logicNode.left, context));
        const right = Number(this.resolveValue('number', logicNode.right, context));
        let result = 0;
        
        switch (logicNode.operator) {
          case 'add':
            result = left + right;
            break;
          case 'subtract':
            result = left - right;
            break;
          case 'multiply':
            result = left * right;
            break;
          case 'divide':
            result = right === 0 ? 0 : left / right;
            break;
          case 'modulus':
            result = right === 0 ? 0 : left % right;
            break;
        }
        
        if (logicNode.assignTo) {
          const varStore = this.getVariableStore(logicNode.assignTo);
          varStore.set(logicNode.assignTo, { type: 'number', value: result });
        }
        
        return edges.map(edge => edge.to);
      }

      case 'conditional': {
        const left = Number(this.resolveValue('number', logicNode.left, context));
        const right = Number(this.resolveValue('number', logicNode.right, context));
        let outcome = false;
        
        switch (logicNode.comparator) {
          case '>':
            outcome = left > right;
            break;
          case '>=':
            outcome = left >= right;
            break;
          case '<':
            outcome = left < right;
            break;
          case '<=':
            outcome = left <= right;
            break;
          case '==':
            outcome = left === right;
            break;
          case '!=':
            outcome = left !== right;
            break;
        }
        
        const branch = outcome ? 'true' : 'false';
        const targeted = edges.filter(edge => edge.fromPort === branch);
        
        if (targeted.length > 0) {
          return targeted.map(edge => edge.to);
        }
        
        return edges.map(edge => edge.to);
      }
    }

    return edges.map(edge => edge.to);
  }

  /**
   * Get the appropriate variable store for a variable name.
   */
  private getVariableStore(varName: string): Map<string, VariableValue> {
    // Check if variable is defined in cue-level registry
    const isCueLevel = this.variableDefinitions.some(v => v.name === varName && v.scope === 'cue');
    return isCueLevel ? this.cueLevelVarStore : this.groupLevelVarStore;
  }

  /**
   * Resolve a value source to an actual value at runtime.
   */
  private resolveValue(
    expectedType: VariableType,
    source: ValueSource | undefined,
    context: ExecutionContext
  ): number | boolean | string {
    if (!source) {
      return expectedType === 'number' ? 0 : expectedType === 'boolean' ? false : '';
    }

    if (source.source === 'literal') {
      if (expectedType === 'string') {
        return String(source.value);
      }
      if (expectedType === 'number') {
        if (typeof source.value === 'boolean') {
          return source.value ? 1 : 0;
        }
        if (typeof source.value === 'string') {
          const parsed = parseFloat(source.value);
          return isNaN(parsed) ? 0 : parsed;
        }
        return typeof source.value === 'number' ? source.value : 0;
      }
      return source.value === true || source.value === 'true';
    }

    // Check cue-level store first, then group-level (use context's stores)
    const cueVar = context.cueLevelVarStore.get(source.name);
    const groupVar = context.groupLevelVarStore.get(source.name);
    const existing = cueVar ?? groupVar;
    
    if (existing) {
      if (expectedType === 'string') {
        return String(existing.value);
      }
      if (expectedType === 'number') {
        if (typeof existing.value === 'string') {
          const parsed = parseFloat(existing.value);
          return isNaN(parsed) ? 0 : parsed;
        }
        return typeof existing.value === 'number' ? existing.value : (existing.value ? 1 : 0);
      }
      return existing.value === true || existing.value === 'true';
    }

    // Use fallback
    if (expectedType === 'string') {
      return source.fallback !== undefined ? String(source.fallback) : '';
    }
    if (expectedType === 'number') {
      if (typeof source.fallback === 'number') return source.fallback;
      if (typeof source.fallback === 'boolean') return source.fallback ? 1 : 0;
      if (typeof source.fallback === 'string') {
        const parsed = parseFloat(source.fallback);
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    }

    return source.fallback === true || source.fallback === 'true';
  }

  /**
   * Called when an action completes.
   * Continues execution to downstream nodes.
   */
  private onActionComplete(contextId: string, nodeId: string): void {
    const context = this.activeContexts.get(contextId);
    if (!context) {
      return; // Context already completed or cancelled
    }

    // Continue to next nodes after this action
    this.continueToNextNodes(nodeId, context);

    // Check if context is now complete
    if (context.isComplete()) {
      context.dispose();
    }
  }

  /**
   * Get the next nodes after the current node and continue execution.
   */
  private continueToNextNodes(nodeId: string, context: ExecutionContext): void {
    const { adjacency } = this.compiledCue;
    const outgoing = adjacency.get(nodeId) ?? [];
    const nextNodes = outgoing.map(conn => conn.to);
    
    if (nextNodes.length > 0) {
      this.continueExecution(nextNodes, context);
    } else {
      // No more nodes, check if context is complete
      if (context.isComplete()) {
        context.dispose();
      }
    }
  }

  /**
   * Continue execution to the next nodes.
   */
  private continueExecution(nodeIds: string[], context: ExecutionContext): void {
    for (const nodeId of nodeIds) {
      this.executeNode(nodeId, context);
    }
  }

  /**
   * Cancel all active executions (called on cue stop).
   */
  public cancelAll(): void {
    for (const context of this.activeContexts.values()) {
      context.dispose();
    }
    this.activeContexts.clear();
  }

  /**
   * Get execution state for debugging.
   */
  public getExecutionState(): ExecutionState {
    const activeContexts = Array.from(this.activeContexts.values()).map(context => {
      const info = context.getDebugInfo();
      return {
        id: info.id,
        eventNodeId: info.eventNodeId,
        eventType: (context.eventNode as any).eventType || 'unknown',
        startTime: info.startTime,
        visitedNodes: info.visitedNodes,
        activeNodes: info.activeNodes,
        pendingNodes: info.pendingNodes
      };
    });

    return { activeContexts };
  }
}
