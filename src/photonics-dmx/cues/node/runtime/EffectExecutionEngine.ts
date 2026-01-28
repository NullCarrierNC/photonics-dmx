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
  VariableDefinition
} from '../../types/nodeCueTypes';
import { ExecutionContext } from './ExecutionContext';
import { VariableValue } from './executionTypes';
import { resolveValue, resolveColor, resolveBrightness, resolveBlendMode } from './valueResolver';
import { ResolvedColorSetting, ResolvedActionTiming } from '../compiler/ActionEffectFactory';
import { evaluateLogicNode, LogicNodeEvaluatorContext, ExecuteNodeOptions } from './logicNodeEvaluator';

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
  private onIdleCallback?: () => void;  // Called when all contexts complete

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
      // Check if effect is now idle (all contexts done)
      if (this.activeContexts.size === 0 && this.onIdleCallback) {
        this.onIdleCallback();
      }
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
      // Check if effect is now idle (all contexts done)
      if (this.activeContexts.size === 0 && this.onIdleCallback) {
        this.onIdleCallback();
      }
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
  private executeNode(nodeId: string, context: ExecutionContext, options: ExecuteNodeOptions = {}): void {
    const allowRevisit = options.allowRevisit === true;

    // Check if already visited
    if (context.hasVisited(nodeId)) {
      if (!allowRevisit) {
        // Allow action nodes to be revisited (blocking prevents infinite loops)
        if (!this.compiledEffect.actionMap.has(nodeId)) {
          return;
        }
      } else {
        const logicNode = this.compiledEffect.logicMap.get(nodeId);
        if (logicNode && (logicNode.logicType === 'for-loop' || logicNode.logicType === 'while-loop')) {
          return;
        }

        const actionNode = this.compiledEffect.actionMap.get(nodeId);
        const eventRaiserNode = this.compiledEffect.eventRaiserMap.get(nodeId);
        if (!actionNode && !logicNode && !eventRaiserNode) {
          return;
        }
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
    
    // Resolve lights first - this handles both light-array variables and standard group/filter targets
    const lights = ActionEffectFactory.resolveLights(
      this.lightManager,
      action.target,
      (varName: string) => {
        const cueVar = context.cueLevelVarStore.get(varName);
        const groupVar = context.groupLevelVarStore.get(varName);
        return cueVar ?? groupVar;
      }
    );
    
    if (!lights || lights.length === 0) {
      console.warn(`No lights resolved for action ${action.id}, skipping`);
      context.completeAction(action.id);
      this.continueToNextNodes(action.id, context);
      return;
    }
    
    // Resolve color
    const resolvedColor: ResolvedColorSetting = {
      name: resolveColor(action.color.name, context),
      brightness: resolveBrightness(action.color.brightness, context),
      blendMode: resolveBlendMode(action.color.blendMode, context),
      opacity: action.color.opacity
        ? Number(resolveValue('number', action.color.opacity, context))
        : undefined
    };
    
    // Resolve timing
    const resolvedTiming: ResolvedActionTiming = {
      ...action.timing,
      waitForTime: Number(resolveValue('number', action.timing.waitForTime, context)),
      waitForConditionCount: action.timing.waitForConditionCount 
        ? Number(resolveValue('number', action.timing.waitForConditionCount, context))
        : undefined,
      duration: Number(resolveValue('number', action.timing.duration, context)),
      waitUntilTime: Number(resolveValue('number', action.timing.waitUntilTime, context)),
      waitUntilConditionCount: action.timing.waitUntilConditionCount
        ? Number(resolveValue('number', action.timing.waitUntilConditionCount, context))
        : undefined,
      level: action.timing.level
        ? Number(resolveValue('number', action.timing.level, context))
        : 1
    };
    
    // Resolve layer
    const resolvedLayer = action.layer
      ? Number(resolveValue('number', action.layer, context))
      : 0;
    
    // Build effect using ActionEffectFactory with resolved values
    const effect = ActionEffectFactory.buildEffect({
      action,
      lights,
      intensityScale: 1,
      resolvedColor,
      resolvedTiming,
      resolvedLayer
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
    try {
      // Handle delay nodes specially - they block execution
      if (logic.logicType === 'delay') {
        this.executeDelayNode(logic, context);
        return;
      }

      const { adjacency } = this.compiledEffect;
      const edges = adjacency.get(logic.id) ?? [];

      // Create evaluator context with bound executeNode
      const evaluatorContext: LogicNodeEvaluatorContext = {
        cueId: this.compiledEffect.definition.id,
        lightManager: this.lightManager,
        cueLevelVarStore: context.cueLevelVarStore, // Effect variables are stored as cue-level
        groupLevelVarStore: context.groupLevelVarStore, // Empty for effects
        variableDefinitions: this.variableDefinitions,
        executeNode: (nextNodeId: string, ctx: ExecutionContext, options) =>
          this.executeNode(nextNodeId, ctx, options)
      };

      const nextNodes = evaluateLogicNode(logic, logic.id, edges, context, evaluatorContext);
      
      // Logic nodes execute immediately - continue to next nodes without waiting
      if (nextNodes.length > 0) {
        for (const nextNodeId of nextNodes) {
          this.executeNode(nextNodeId, context);
        }
      }
    } catch (error) {
      console.error(`Error executing logic node ${logic.id}:`, error);
      // Continue to all outgoing edges despite error
      this.continueToNextNodes(logic.id, context);
    }
  }

  /**
   * Execute a delay node inside an effect: block until delay completes.
   */
  private executeDelayNode(
    delayNode: LogicNode & { logicType: 'delay'; delayTime: any },
    context: ExecutionContext
  ): void {
    try {
      const delayMs = Number(resolveValue('number', delayNode.delayTime, context));
      const actualDelay = Math.max(0, delayMs);

      // Register as active to block execution (dummy action for tracking)
      const dummyAction: ActionNode = {
        id: delayNode.id,
        type: 'action',
        effectType: 'set-color',
        target: { groups: { source: 'literal', value: 'front' }, filter: { source: 'literal', value: 'all' } },
        color: { name: { source: 'literal', value: 'blue' }, brightness: { source: 'literal', value: 'medium' } },
        timing: { waitForCondition: 'none', waitForTime: { source: 'literal', value: 0 }, duration: { source: 'literal', value: 0 }, waitUntilCondition: 'none', waitUntilTime: { source: 'literal', value: 0 } }
      };
      context.registerActiveAction(delayNode.id, dummyAction);

      setTimeout(() => {
        if (context.hasVisited(delayNode.id)) {
          context.completeAction(delayNode.id);
          this.continueToNextNodes(delayNode.id, context);
        }
      }, actualDelay);
    } catch (error) {
      console.error(`Error executing delay node ${delayNode.id}:`, error);
      this.continueToNextNodes(delayNode.id, context);
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
      // Check if effect is now idle (all contexts done)
      if (this.activeContexts.size === 0 && this.onIdleCallback) {
        this.onIdleCallback();
      }
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
   * Check if the effect has any active execution contexts.
   */
  public hasActiveContexts(): boolean {
    return this.activeContexts.size > 0;
  }

  /**
   * Set a callback to be invoked when all execution contexts complete (effect becomes idle).
   */
  public setOnIdle(callback: () => void): void {
    this.onIdleCallback = callback;
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
