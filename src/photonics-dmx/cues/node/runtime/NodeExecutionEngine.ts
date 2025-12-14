/**
 * Event-driven execution engine for node graphs.
 * Executes nodes sequentially, respecting blocking semantics.
 */

import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { CueData } from '../../types/cueTypes';
import { AudioCueData } from '../../types/audioCueTypes';
import {  CompiledYargCue, CompiledAudioCue } from '../compiler/NodeCueCompiler';
import { ActionEffectFactory, ResolvedActionTarget, ResolvedColorSetting, ResolvedActionTiming } from '../compiler/ActionEffectFactory';
import {
  ActionNode,
  BaseEventNode,
  EventRaiserNode,
  EventListenerNode,
  EffectRaiserNode,
  LogicNode,
  ValueSource,
  VariableType,
  VariableDefinition,
  YargCueDataProperty,
  AudioCueDataProperty
} from '../../types/nodeCueTypes';
import { Color, Brightness, BlendMode, LocationGroup, LightTarget } from '../../../types';
import { ExecutionContext } from './ExecutionContext';
import { ExecutionState, VariableValue } from './executionTypes';
import { EffectRegistry } from './EffectRegistry';
import { EffectExecutionEngine } from './EffectExecutionEngine';

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
          waitForTime: Number(this.resolveValue('number', actionNode.timing.waitForTime, context)),
          waitForConditionCount: actionNode.timing.waitForConditionCount 
            ? Number(this.resolveValue('number', actionNode.timing.waitForConditionCount, context))
            : undefined,
          duration: Number(this.resolveValue('number', actionNode.timing.duration, context)),
          waitUntilTime: Number(this.resolveValue('number', actionNode.timing.waitUntilTime, context)),
          waitUntilConditionCount: actionNode.timing.waitUntilConditionCount
            ? Number(this.resolveValue('number', actionNode.timing.waitUntilConditionCount, context))
            : undefined,
          level: actionNode.timing.level
            ? Number(this.resolveValue('number', actionNode.timing.level, context))
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
        groups: this.resolveLocationGroups(actionNode.target.groups, context),
        filter: this.resolveLightTarget(actionNode.target.filter, context)
      };
      
      // Resolve color
      const resolvedColor: ResolvedColorSetting = {
        name: this.resolveColor(actionNode.color.name, context),
        brightness: this.resolveBrightness(actionNode.color.brightness, context),
        blendMode: this.resolveBlendMode(actionNode.color.blendMode, context),
        opacity: actionNode.color.opacity
          ? Number(this.resolveValue('number', actionNode.color.opacity, context))
          : undefined
      };
      
      // Resolve secondary color if present
      const resolvedSecondaryColor: ResolvedColorSetting | undefined = actionNode.secondaryColor ? {
        name: this.resolveColor(actionNode.secondaryColor.name, context),
        brightness: this.resolveBrightness(actionNode.secondaryColor.brightness, context),
        blendMode: this.resolveBlendMode(actionNode.secondaryColor.blendMode, context),
        opacity: actionNode.secondaryColor.opacity
          ? Number(this.resolveValue('number', actionNode.secondaryColor.opacity, context))
          : undefined
      } : undefined;
      
      // Resolve timing
      const resolvedTiming: ResolvedActionTiming = {
        ...actionNode.timing,
        waitForTime: Number(this.resolveValue('number', actionNode.timing.waitForTime, context)),
        waitForConditionCount: actionNode.timing.waitForConditionCount 
          ? Number(this.resolveValue('number', actionNode.timing.waitForConditionCount, context))
          : undefined,
        duration: Number(this.resolveValue('number', actionNode.timing.duration, context)),
        waitUntilTime: Number(this.resolveValue('number', actionNode.timing.waitUntilTime, context)),
        waitUntilConditionCount: actionNode.timing.waitUntilConditionCount
          ? Number(this.resolveValue('number', actionNode.timing.waitUntilConditionCount, context))
          : undefined,
        level: actionNode.timing.level
          ? Number(this.resolveValue('number', actionNode.timing.level, context))
          : 1
      };
      
      // Resolve layer
      const resolvedLayer = actionNode.layer
        ? Number(this.resolveValue('number', actionNode.layer, context))
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
      
      const lights = ActionEffectFactory.resolveLights(this.lightManager, resolvedTarget);
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
        paramValues[paramName] = this.resolveValue(expectedType, valueSource, context);
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

      case 'cue-data': {
        const value = this.extractCueDataValue(logicNode.dataProperty, context.cueData);
        
        if (logicNode.assignTo) {
          const varStore = this.getVariableStore(logicNode.assignTo);
          const type = this.inferType(value);
          varStore.set(logicNode.assignTo, { type, value });
        }
        
        return edges.map(edge => edge.to);
      }

      case 'config-data': {
        const value = this.extractConfigDataValue(logicNode.dataProperty);
        
        if (logicNode.assignTo) {
          const varStore = this.getVariableStore(logicNode.assignTo);
          varStore.set(logicNode.assignTo, { type: 'number', value });
        }
        
        return edges.map(edge => edge.to);
      }
    }

    return edges.map(edge => edge.to);
  }

  /**
   * Infer variable type from value.
   */
  private inferType(value: number | string | boolean): VariableType {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    return 'string';
  }

  /**
   * Extract cue data value based on property.
   */
  private extractCueDataValue(property: string, cueData: CueData | AudioCueData): number | string | boolean {
    // Mode detection (YARG vs Audio)
    const isYargMode = 'lightingCue' in cueData;
    
    if (isYargMode) {
      return this.extractYargCueDataValue(property as YargCueDataProperty, cueData as CueData);
    } else {
      return this.extractAudioCueDataValue(property as AudioCueDataProperty, cueData as AudioCueData);
    }
  }

  /**
   * Extract YARG-specific cue data.
   */
  private extractYargCueDataValue(property: YargCueDataProperty, cueData: CueData): number | string | boolean {
    switch (property) {
      case 'cue-name': return this.cueId;
      case 'cue-type': return cueData.lightingCue;
      case 'execution-count': return cueData.executionCount ?? 0;
      case 'bpm': return cueData.beatsPerMinute;
      case 'song-section': return cueData.songSection;
      case 'current-scene': return cueData.currentScene;
      case 'beat-type': return cueData.beat;
      case 'keyframe': return cueData.keyframe;
      case 'guitar-note-count': return cueData.guitarNotes.length;
      case 'bass-note-count': return cueData.bassNotes.length;
      case 'drum-note-count': return cueData.drumNotes.length;
      case 'keys-note-count': return cueData.keysNotes.length;
      case 'total-score': return cueData.totalScore ?? 0;
      case 'performer': return cueData.performer;
      case 'bonus-effect': return cueData.bonusEffect;
      case 'fog-state': return cueData.fogState;
      case 'time-since-cue-start': return Date.now() - (cueData.cueStartTime ?? Date.now());
      case 'time-since-last-cue': return cueData.timeSinceLastCue ?? 0;
      default: return 0;
    }
  }

  /**
   * Extract Audio-specific cue data.
   */
  private extractAudioCueDataValue(property: AudioCueDataProperty, cueData: AudioCueData): number | string | boolean {
    switch (property) {
      case 'cue-name': return this.cueId;
      case 'cue-type-id': return ''; // Audio cues have cueTypeId
      case 'execution-count': return cueData.executionCount;
      case 'timestamp': return cueData.timestamp;
      case 'overall-level': return cueData.audioData.overallLevel;
      case 'bpm': return cueData.audioData.bpm ?? 0;
      case 'beat-detected': return cueData.audioData.beatDetected;
      case 'energy': return cueData.audioData.energy;
      case 'freq-range1': return cueData.audioData.frequencyBands.range1;
      case 'freq-range2': return cueData.audioData.frequencyBands.range2;
      case 'freq-range3': return cueData.audioData.frequencyBands.range3;
      case 'freq-range4': return cueData.audioData.frequencyBands.range4;
      case 'freq-range5': return cueData.audioData.frequencyBands.range5;
      case 'enabled-band-count': return cueData.enabledBandCount;
      default: return 0;
    }
  }

  /**
   * Extract config data value based on property.
   */
  private extractConfigDataValue(property: string): number {
    switch (property) {
      case 'total-lights':
        return this.lightManager.getLightsInGroup(['front', 'back', 'strobe']).length;
      case 'front-lights-count':
        return this.lightManager.getLightsInGroup('front').length;
      case 'back-lights-count':
        return this.lightManager.getLightsInGroup('back').length;
      case 'strobe-lights-count':
        return this.lightManager.getLightsInGroup('strobe').length;
      default:
        return 0;
    }
  }

  /**
   * Resolve location groups from ValueSource (comma-separated string to array).
   */
  private resolveLocationGroups(source: ValueSource, context: ExecutionContext): LocationGroup[] {
    const value = this.resolveValue('string', source, context);
    if (typeof value !== 'string') return ['front'];
    
    // Parse comma-separated groups: "front,back" → ['front', 'back']
    const validGroups: LocationGroup[] = ['front', 'back', 'strobe'];
    return value.split(',')
      .map(g => g.trim())
      .filter(g => validGroups.includes(g as LocationGroup)) as LocationGroup[];
  }

  /**
   * Resolve light target filter from ValueSource.
   */
  private resolveLightTarget(source: ValueSource, context: ExecutionContext): LightTarget {
    const value = this.resolveValue('string', source, context);
    const valid: LightTarget[] = ['all', 'even', 'odd', 'random-1', 'random-2', 'random-3'];
    return valid.includes(value as LightTarget) ? (value as LightTarget) : 'all';
  }

  /**
   * Resolve color name from ValueSource.
   */
  private resolveColor(source: ValueSource, context: ExecutionContext): Color {
    const value = this.resolveValue('string', source, context);
    // Import COLOR_OPTIONS to validate
    const validColors: Color[] = [
      'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white', 'transparent'
    ];
    return validColors.includes(value as Color) ? (value as Color) : 'blue';
  }

  /**
   * Resolve brightness level from ValueSource.
   */
  private resolveBrightness(source: ValueSource, context: ExecutionContext): Brightness {
    const value = this.resolveValue('string', source, context);
    const valid: Brightness[] = ['low', 'medium', 'high', 'max'];
    return valid.includes(value as Brightness) ? (value as Brightness) : 'medium';
  }

  /**
   * Resolve blend mode from ValueSource.
   */
  private resolveBlendMode(source: ValueSource | undefined, context: ExecutionContext): BlendMode | undefined {
    if (!source) return undefined;
    const value = this.resolveValue('string', source, context);
    const valid: BlendMode[] = ['replace', 'add', 'multiply', 'overlay'];
    return valid.includes(value as BlendMode) ? (value as BlendMode) : 'replace';
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
