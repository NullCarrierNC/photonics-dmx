/**
 * Execution engine for effect node graphs.
 * Similar to NodeExecutionEngine but for effects triggered by cues.
 */

import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { CueData } from '../../types/cueTypes';
import { AudioCueData } from '../../types/audioCueTypes';
import { CompiledEffect } from '../compiler/EffectCompiler';
import { ActionEffectFactory } from '../compiler/ActionEffectFactory';
import {
  ActionNode,
  BaseEventNode,
  EffectEventListenerNode,
  EventRaiserNode,
  EventListenerNode,
  LogicNode,
  ValueSource,
  VariableDefinition
} from '../../types/nodeCueTypes';
import { ExecutionContext } from './ExecutionContext';
import { VariableValue } from './executionTypes';

export class EffectExecutionEngine {
  private compiledEffect: CompiledEffect<BaseEventNode>;
  private sequencer: ILightingController;
  private lightManager: DmxLightManager;
  private effectVarStore: Map<string, VariableValue>;  // Effect-local variables
  private parameterValues: Record<string, any>;
  private activeContexts: Map<string, ExecutionContext> = new Map();
  private variableDefinitions: VariableDefinition[];
  private eventListeners: Map<string, EventListenerNode[]> = new Map();
  private callerCueData: CueData | AudioCueData;  // Cue data from caller

  constructor(
    compiledEffect: CompiledEffect<BaseEventNode>,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
    parameterValues: Record<string, any>,
    callerCueData: CueData | AudioCueData
  ) {
    this.compiledEffect = compiledEffect;
    this.sequencer = sequencer;
    this.lightManager = lightManager;
    this.parameterValues = parameterValues;
    this.callerCueData = callerCueData;
    this.variableDefinitions = compiledEffect.definition.variables ?? [];
    
    // Initialize effect-local variable store
    this.effectVarStore = new Map();
    this.initializeVariables();
    
    // Register runtime event listeners
    this.registerEventListeners();
  }

  /**
   * Initialize effect variables with their default values.
   */
  private initializeVariables(): void {
    for (const varDef of this.variableDefinitions) {
      this.effectVarStore.set(varDef.name, {
        type: varDef.type,
        value: varDef.initialValue
      });
    }
  }

  /**
   * Register all runtime event listeners from the compiled effect.
   */
  private registerEventListeners(): void {
    const { eventListenerMap } = this.compiledEffect;
    for (const listener of eventListenerMap.values()) {
      if (!listener.eventName) {
        continue;
      }
      const listeners = this.eventListeners.get(listener.eventName) ?? [];
      listeners.push(listener);
      this.eventListeners.set(listener.eventName, listeners);
    }
  }

  /**
   * Trigger the effect by starting execution from the effect listener.
   */
  public triggerEffect(cueData: CueData | AudioCueData): void {
    // Get the effect listener (entry point)
    const effectListener = Array.from(this.compiledEffect.effectListenerMap.values())[0];
    if (!effectListener) {
      console.warn('No effect listener found in effect');
      return;
    }

    // Apply parameter values to effect variables
    this.applyParameterValues(effectListener);

    // Create execution context with caller's cue data
    const context = new ExecutionContext(
      { id: effectListener.id, type: 'event', outputs: effectListener.outputs } as any,
      cueData,  // Pass caller's cue data
      this.effectVarStore,  // Use effect-local variables as "cue-level"
      new Map()  // No group-level variables for effects
    );

    // Set up completion callbacks
    context.setOnNodeComplete((nodeId: string) => {
      this.onActionComplete(context.id, nodeId);
    });

    context.setOnContextComplete(() => {
      this.activeContexts.delete(context.id);
    });

    this.activeContexts.set(context.id, context);

    // Get outgoing edges from effect listener and start execution
    const { adjacency } = this.compiledEffect;
    const outgoing = adjacency.get(effectListener.id) ?? [];
    const nextNodes = outgoing.map(conn => conn.to);

    if (nextNodes.length > 0) {
      for (const nodeId of nextNodes) {
        this.executeNode(nodeId, context);
      }
    } else {
      // No children - context completes immediately
      this.activeContexts.delete(context.id);
    }
  }

  /**
   * Apply parameter values to effect variables.
   * Parameters are variables with isParameter: true in the effect definition.
   */
  private applyParameterValues(_listener: EffectEventListenerNode): void {
    // Get all variables marked as parameters
    const parameterVars = this.variableDefinitions.filter(v => v.isParameter);

    for (const paramVar of parameterVars) {
      // Check if a value was provided, otherwise use the default
      const value = this.parameterValues[paramVar.name] ?? paramVar.initialValue;
      
      this.effectVarStore.set(paramVar.name, {
        type: paramVar.type,
        value: value
      });
    }
  }

  /**
   * Execute a node by its ID.
   */
  private executeNode(nodeId: string, context: ExecutionContext): void {
    // Check if already visited
    if (context.hasVisited(nodeId)) {
      // Allow action nodes to be revisited (blocking prevents infinite loops)
      if (!this.compiledEffect.actionMap.has(nodeId)) {
        return;
      }
    }

    context.markVisited(nodeId);

    // Determine node type and execute
    const action = this.compiledEffect.actionMap.get(nodeId);
    if (action) {
      this.executeActionNode(action, context);
      return;
    }

    const logic = this.compiledEffect.logicMap.get(nodeId);
    if (logic) {
      this.executeLogicNode(logic, context);
      return;
    }

    const eventRaiser = this.compiledEffect.eventRaiserMap.get(nodeId);
    if (eventRaiser) {
      this.executeEventRaiserNode(eventRaiser, context);
      return;
    }

    const eventListener = this.compiledEffect.eventListenerMap.get(nodeId);
    if (eventListener) {
      // Event listeners are only triggered by events, not executed directly
      return;
    }

    console.warn(`Unknown node type for id: ${nodeId}`);
  }

  /**
   * Execute an action node (blocking).
   */
  private executeActionNode(action: ActionNode, context: ExecutionContext): void {
    context.registerActiveAction(action.id, action);

    const effectName = `effect_${this.compiledEffect.definition.id}_${action.id}`;
    
    // Resolve lights for the action
    const lights = ActionEffectFactory.resolveLights(this.lightManager, action.target);
    
    // Build effect using ActionEffectFactory
    const effect = ActionEffectFactory.buildEffect({
      action,
      lights,
      intensityScale: 1
    });

    if (!effect) {
      console.warn(`Failed to create effect for action ${action.id}`);
      context.completeAction(action.id);
      this.continueToNextNodes(action.id, context);
      return;
    }

    // Add callback to continue execution after action completes
    const callback = () => {
      context.completeAction(action.id);
      this.continueToNextNodes(action.id, context);
    };

    this.sequencer.addEffectWithCallback(effectName, effect, callback);
  }

  /**
   * Execute a logic node (synchronous).
   */
  private executeLogicNode(logic: LogicNode, context: ExecutionContext): void {
    switch (logic.logicType) {
      case 'variable':
        this.executeVariableLogic(logic, context);
        break;
      case 'math':
        this.executeMathLogic(logic, context);
        break;
      case 'conditional':
        this.executeConditionalLogic(logic, context);
        return; // Conditional handles its own continuation
    }

    this.continueToNextNodes(logic.id, context);
  }

  /**
   * Execute variable logic.
   */
  private executeVariableLogic(logic: LogicNode, _context: ExecutionContext): void {
    if (logic.logicType !== 'variable') return;

    const varName = logic.varName;
    const value = logic.value ? this.resolveValueSource(logic.value) : undefined;

    switch (logic.mode) {
      case 'init':
        if (!this.effectVarStore.has(varName) && value !== undefined) {
          this.effectVarStore.set(varName, {
            type: logic.valueType,
            value
          });
        }
        break;
      case 'set':
        if (value !== undefined) {
          this.effectVarStore.set(varName, {
            type: logic.valueType,
            value
          });
        }
        break;
      case 'get':
        // Get operation - value is available for next node
        break;
    }
  }

  /**
   * Execute math logic.
   */
  private executeMathLogic(logic: LogicNode, _context: ExecutionContext): void {
    if (logic.logicType !== 'math') return;

    const left = this.resolveValueSource(logic.left) as number;
    const right = this.resolveValueSource(logic.right) as number;

    let result: number;
    switch (logic.operator) {
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
        result = right !== 0 ? left / right : 0;
        break;
      case 'modulus':
        result = right !== 0 ? left % right : 0;
        break;
      default:
        result = 0;
    }

    if (logic.assignTo) {
      this.effectVarStore.set(logic.assignTo, {
        type: 'number',
        value: result
      });
    }
  }

  /**
   * Execute conditional logic (branching).
   */
  private executeConditionalLogic(logic: LogicNode, context: ExecutionContext): void {
    if (logic.logicType !== 'conditional') return;

    const left = this.resolveValueSource(logic.left);
    const right = this.resolveValueSource(logic.right);

    let conditionMet = false;
    switch (logic.comparator) {
      case '>':
        conditionMet = (left as number) > (right as number);
        break;
      case '>=':
        conditionMet = (left as number) >= (right as number);
        break;
      case '<':
        conditionMet = (left as number) < (right as number);
        break;
      case '<=':
        conditionMet = (left as number) <= (right as number);
        break;
      case '==':
        conditionMet = left === right;
        break;
      case '!=':
        conditionMet = left !== right;
        break;
    }

    // Follow appropriate branch
    const { adjacency } = this.compiledEffect;
    const outgoing = adjacency.get(logic.id) ?? [];
    const targetPort = conditionMet ? 'true' : 'false';

    for (const conn of outgoing) {
      if (conn.fromPort === targetPort) {
        this.executeNode(conn.to, context);
      }
    }
  }

  /**
   * Execute runtime event raiser node (non-blocking).
   */
  private executeEventRaiserNode(raiser: EventRaiserNode, context: ExecutionContext): void {
    const { eventName } = raiser;

    // Trigger all listeners for this event
    const listeners = this.eventListeners.get(eventName) ?? [];
    for (const listener of listeners) {
      this.startListenerExecution(listener);
    }

    // Continue immediately (non-blocking)
    this.continueToNextNodes(raiser.id, context);
  }

  /**
   * Start execution from a runtime event listener.
   */
  private startListenerExecution(listener: EventListenerNode): void {
    const context = new ExecutionContext(
      { id: listener.id, type: 'event', outputs: listener.outputs } as any,
      this.callerCueData,
      this.effectVarStore,
      new Map()
    );

    context.setOnNodeComplete((nodeId: string) => {
      this.onActionComplete(context.id, nodeId);
    });

    context.setOnContextComplete(() => {
      this.activeContexts.delete(context.id);
    });

    this.activeContexts.set(context.id, context);

    const { adjacency } = this.compiledEffect;
    const outgoing = adjacency.get(listener.id) ?? [];

    for (const conn of outgoing) {
      this.executeNode(conn.to, context);
    }
  }

  /**
   * Resolve a value source to its actual value.
   */
  private resolveValueSource(source: ValueSource): number | boolean | string {
    if (source.source === 'literal') {
      return source.value;
    } else {
      const varValue = this.effectVarStore.get(source.name);
      if (varValue) {
        return varValue.value;
      }
      return source.fallback ?? 0;
    }
  }

  /**
   * Continue to next nodes after current node completes.
   */
  private continueToNextNodes(nodeId: string, context: ExecutionContext): void {
    const { adjacency } = this.compiledEffect;
    const outgoing = adjacency.get(nodeId) ?? [];

    for (const conn of outgoing) {
      // Skip conditional branches (handled by conditional logic)
      if (conn.fromPort === 'true' || conn.fromPort === 'false') {
        continue;
      }
      this.executeNode(conn.to, context);
    }

    // Check if context is complete
    if (context.isComplete()) {
      this.activeContexts.delete(context.id);
    }
  }

  /**
   * Handle action completion callback.
   */
  private onActionComplete(contextId: string, _nodeId: string): void {
    const context = this.activeContexts.get(contextId);
    if (!context) {
      return;
    }

    // Continue is handled by the callback registered with sequencer
  }

  /**
   * Cancel all active executions.
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
  public getExecutionState() {
    return {
      activeContexts: this.activeContexts.size,
      contexts: Array.from(this.activeContexts.values()).map(ctx => ctx.getDebugInfo())
    };
  }
}
