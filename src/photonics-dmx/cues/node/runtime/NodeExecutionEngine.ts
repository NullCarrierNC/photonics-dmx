/**
 * Event-driven execution engine for node graphs.
 * Executes nodes sequentially, respecting blocking semantics.
 * 
 * This module has been refactored for maintainability:
 * - dataExtractors.ts: CueData and config data extraction
 * - valueResolver.ts: ValueSource resolution and type inference
 * - logicNodeEvaluator.ts: Logic node evaluation (variable, math, conditional, loops)
 */

import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { CueData } from '../../types/cueTypes';
import {  CompiledYargCue, CompiledAudioCue } from '../compiler/NodeCueCompiler';
import { ActionEffectFactory, ResolvedActionTarget, ResolvedColorSetting, ResolvedActionTiming } from '../compiler/ActionEffectFactory';
import {
  ActionNode,
  BaseEventNode,
  EventRaiserNode,
  EventListenerNode,
  EffectRaiserNode,
  LogicNode,
  VariableDefinition
} from '../../types/nodeCueTypes';
import { ExecutionContext } from './ExecutionContext';
import { ExecutionState, VariableValue } from './executionTypes';
import { EffectRegistry } from './EffectRegistry';
import { EffectExecutionEngine } from './EffectExecutionEngine';

// Import refactored modules
import { resolveValue, resolveLocationGroups, resolveLightTarget, resolveColor, resolveBrightness, resolveBlendMode } from './valueResolver';
import { evaluateLogicNode, LogicNodeEvaluatorContext } from './logicNodeEvaluator';

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
  private effectRegistry: EffectRegistry;

  constructor(
    compiledCue: CompiledYargCue | CompiledAudioCue,
    cueId: string,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
    cueLevelVarStore: Map<string, VariableValue>,
    groupLevelVarStore: Map<string, VariableValue>,
    effectRegistry: EffectRegistry,
    variableDefinitions: VariableDefinition[] = []
  ) {
    this.compiledCue = compiledCue;
    this.cueId = cueId;
    this.sequencer = sequencer;
    this.lightManager = lightManager;
    this.cueLevelVarStore = cueLevelVarStore;
    this.groupLevelVarStore = groupLevelVarStore;
    this.effectRegistry = effectRegistry;
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
  public startExecution(eventNode: BaseEventNode, parameters: CueData): void {
    try {
      const context = new ExecutionContext(
        eventNode,
        parameters,
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

    const { actionMap, logicMap, eventRaiserMap, effectRaiserMap } = this.compiledCue;

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

    // Check if it's an effect raiser node
    const effectRaiserNode = effectRaiserMap?.get(nodeId);
    if (effectRaiserNode) {
      this.executeEffectRaiserNode(effectRaiserNode, context);
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
      // Handle blackout specially - it uses sequencer.blackout() directly
      if (actionNode.effectType === 'blackout') {
        // Resolve timing to get duration
        const resolvedTiming: ResolvedActionTiming = {
          ...actionNode.timing,
          waitForTime: Number(resolveValue('number', actionNode.timing.waitForTime, context)),
          waitForConditionCount: actionNode.timing.waitForConditionCount 
            ? Number(resolveValue('number', actionNode.timing.waitForConditionCount, context))
            : undefined,
          duration: Number(resolveValue('number', actionNode.timing.duration, context)),
          waitUntilTime: Number(resolveValue('number', actionNode.timing.waitUntilTime, context)),
          waitUntilConditionCount: actionNode.timing.waitUntilConditionCount
            ? Number(resolveValue('number', actionNode.timing.waitUntilConditionCount, context))
            : undefined,
          level: actionNode.timing.level
            ? Number(resolveValue('number', actionNode.timing.level, context))
            : 1
        };

        // Register this action as active (waiting for completion)
        context.registerActiveAction(actionNode.id, actionNode);

        // Call sequencer.blackout() which returns a Promise<void>
        this.sequencer.blackout(resolvedTiming.duration).then(() => {
          // Blackout completed
          if (context.hasVisited(actionNode.id)) {
            context.completeAction(actionNode.id);
          }
        }).catch((error) => {
          console.error(`Error during blackout for action node ${actionNode.id}:`, error);
          // Continue execution despite error
          if (context.hasVisited(actionNode.id)) {
            context.completeAction(actionNode.id);
          }
        });
        return;
      }

      // Resolve target
      const resolvedTarget: ResolvedActionTarget = {
        groups: resolveLocationGroups(actionNode.target.groups, context),
        filter: resolveLightTarget(actionNode.target.filter, context)
      };
      
      // Resolve color
      const resolvedColor: ResolvedColorSetting = {
        name: resolveColor(actionNode.color.name, context),
        brightness: resolveBrightness(actionNode.color.brightness, context),
        blendMode: resolveBlendMode(actionNode.color.blendMode, context),
        opacity: actionNode.color.opacity
          ? Number(resolveValue('number', actionNode.color.opacity, context))
          : undefined
      };
      
      // Resolve secondary color if present
      const resolvedSecondaryColor: ResolvedColorSetting | undefined = actionNode.secondaryColor ? {
        name: resolveColor(actionNode.secondaryColor.name, context),
        brightness: resolveBrightness(actionNode.secondaryColor.brightness, context),
        blendMode: resolveBlendMode(actionNode.secondaryColor.blendMode, context),
        opacity: actionNode.secondaryColor.opacity
          ? Number(resolveValue('number', actionNode.secondaryColor.opacity, context))
          : undefined
      } : undefined;
      
      // Resolve timing
      const resolvedTiming: ResolvedActionTiming = {
        ...actionNode.timing,
        waitForTime: Number(resolveValue('number', actionNode.timing.waitForTime, context)),
        waitForConditionCount: actionNode.timing.waitForConditionCount 
          ? Number(resolveValue('number', actionNode.timing.waitForConditionCount, context))
          : undefined,
        duration: Number(resolveValue('number', actionNode.timing.duration, context)),
        waitUntilTime: Number(resolveValue('number', actionNode.timing.waitUntilTime, context)),
        waitUntilConditionCount: actionNode.timing.waitUntilConditionCount
          ? Number(resolveValue('number', actionNode.timing.waitUntilConditionCount, context))
          : undefined,
        level: actionNode.timing.level
          ? Number(resolveValue('number', actionNode.timing.level, context))
          : 1
      };
      
      // Resolve layer
      const resolvedLayer = actionNode.layer
        ? Number(resolveValue('number', actionNode.layer, context))
        : 0;
      
      // Create resolved action node for effect building (keep config as-is, not used by factory)
      const resolvedAction: any = {
        ...actionNode,
        target: resolvedTarget,
        color: resolvedColor,
        secondaryColor: resolvedSecondaryColor,
        timing: resolvedTiming,
        layer: resolvedLayer
      };
      
      const lights = ActionEffectFactory.resolveLights(
        this.lightManager,
        actionNode.target,  // Pass the ORIGINAL target with ValueSource intact
        (varName: string) => {
          const cueVar = context.cueLevelVarStore.get(varName);
          const groupVar = context.groupLevelVarStore.get(varName);
          return cueVar ?? groupVar;
        }
      );
      if (!lights || lights.length === 0) {
        // No lights to target, continue immediately
        this.continueToNextNodes(actionNode.id, context);
        return;
      }

      const effect = ActionEffectFactory.buildEffect({
        action: resolvedAction,
        lights,
        waitCondition: undefined,
        waitTime: 0,
        resolvedTarget,
        resolvedColor,
        resolvedSecondaryColor,
        resolvedTiming,
        resolvedLayer
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
      const { adjacency } = this.compiledCue;
      const edges = adjacency.get(nodeId) ?? [];

      // Create evaluator context with bound executeNode
      const evaluatorContext: LogicNodeEvaluatorContext = {
        cueId: this.cueId,
        lightManager: this.lightManager,
        cueLevelVarStore: this.cueLevelVarStore,
        groupLevelVarStore: this.groupLevelVarStore,
        variableDefinitions: this.variableDefinitions,
        executeNode: (nextNodeId: string, ctx: ExecutionContext) => this.executeNode(nextNodeId, ctx)
      };

      const nextNodes = evaluateLogicNode(logicNode, nodeId, edges, context, evaluatorContext);
      
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
        // Create new execution context for each listener, passing cue data
        this.startListenerExecution(listener, context.cueData as CueData);
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
   * Execute an effect raiser node: trigger effect and continue immediately (non-blocking).
   */
  private executeEffectRaiserNode(raiserNode: EffectRaiserNode, context: ExecutionContext): void {
    try {
      const { effectId } = raiserNode;

      // Skip if no effect selected
      if (!effectId) {
        console.warn(`Effect raiser ${raiserNode.id} has no effect selected, skipping`);
        this.continueToNextNodes(raiserNode.id, context);
        return;
      }

      // Look up effect from registry
      const compiledEffect = this.effectRegistry.getEffect(effectId);
      
      if (!compiledEffect) {
        // Gracefully handle missing effect (may have been deleted)
        console.warn(`Effect ${effectId} not found (missing dependency), skipping effect raiser ${raiserNode.id}`);
        this.continueToNextNodes(raiserNode.id, context);
        return;
      }

      // Resolve parameter values
      const paramValues: Record<string, any> = {};
      for (const [paramName, valueSource] of Object.entries(raiserNode.parameterValues ?? {})) {
        // Get parameter type from effect definition
        const paramDef = compiledEffect.parameters.get(paramName);
        const expectedType = paramDef?.type ?? 'number'; // Default to number if not found
        paramValues[paramName] = resolveValue(expectedType, valueSource, context);
      }

      // Create effect execution engine
      const effectEngine = new EffectExecutionEngine(
        compiledEffect,
        this.sequencer,
        this.lightManager,
        paramValues,
        context.cueData  // Pass caller's cue data
      );

      // Trigger effect (non-blocking, runs in parallel)
      effectEngine.triggerEffect(context.cueData);

      // Continue immediately (non-blocking like EventRaiserNode)
      this.continueToNextNodes(raiserNode.id, context);
    } catch (error) {
      console.error(`Error executing effect raiser node ${raiserNode.id}:`, error);
      // Continue execution despite error
      this.continueToNextNodes(raiserNode.id, context);
    }
  }

  /**
   * Start execution from a listener node.
   * Creates a new execution context for the listener chain.
   */
  private startListenerExecution(listenerNode: EventListenerNode, cueData: CueData): void {
    try {
      // Create new context for listener chain (treat listener as event-like node)
      const context = new ExecutionContext(
        listenerNode as any, // Treat as event-like node
        cueData,
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
