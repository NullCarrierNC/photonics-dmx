import { Effect, EffectTransition, RGBIP, TrackedLight } from '../../types';
import { 
  IEffectManager, 
  IEffectTransformer, 
  ILayerManager, 
  ISystemEffectsController, 
  ITimeoutManager, 
  ITransitionEngine,
  LightEffectState
} from './interfaces';

/**
 * @class EffectManager
 * @description 
 * Coordinates the addition, removal, and updating of effects.
 * 
 * Responsibilities:
 * - Coordinates the addition, removal, and updating of effects
 * - Routes effects to appropriate layers
 * - Manages effect transitions, queuing, and lifecycle
 * - Handles scheduling via offset timing
 * - Coordinates with SystemEffects for blackout handling
 * - Tracks layer-specific effect history
 * 
 * Provides four key methods for effects:
 * - addEffect: Adds an effect, replacing existing ones (if on same layer) or queueing
 * - setEffect: Like addEffect but clears all effects on all layers first
 * - addEffectUnblockedName: Discards if effect with same name exists anywhere
 * - setEffectUnblockedName: Like addEffectUnblockedName but cancels existing effects
 */
export class EffectManager implements IEffectManager {
  private layerManager: ILayerManager;
  private transitionEngine: ITransitionEngine;
  private effectTransformer: IEffectTransformer;
  private timeoutManager: ITimeoutManager;
  private systemEffects: ISystemEffectsController;
  private _lastCalled0LayerEffect: string = ""; // Tracks the last effect name that targeted layer 0

  /**
   * @constructor
   * @param layerManager The layer manager
   * @param transitionEngine The transition engine
   * @param effectTransformer The effect transformer
   * @param timeoutManager The timeout manager
   * @param systemEffects The system effects controller
   */
  constructor(
    layerManager: ILayerManager,
    transitionEngine: ITransitionEngine,
    effectTransformer: IEffectTransformer,
    timeoutManager: ITimeoutManager,
    systemEffects: ISystemEffectsController
  ) {
    this.layerManager = layerManager;
    this.transitionEngine = transitionEngine;
    this.effectTransformer = effectTransformer;
    this.timeoutManager = timeoutManager;
    this.systemEffects = systemEffects;
    
    // Set this instance on the transition engine to allow it to start queued effects
    this.transitionEngine.setEffectManager(this);
    
    // Register a callback to reset our state when a blackout completes
    if ('setOnBlackoutCompleteCallback' in this.systemEffects) {
      (this.systemEffects as any).setOnBlackoutCompleteCallback(() => {
        // Reset layer 0 effect tracking when a blackout completes
        this._lastCalled0LayerEffect = "";
      //  console.debug("EffectManager: Reset _lastCalled0LayerEffect after blackout");
      });
    }
  }

  /**
   * Adds a new effect without impacting other effects running on different layers. 
   * Will replace any effect running on the passed transition(s) layer(s) if a different
   * effect was running. If the same effect is passed again, it will be queued.
   * 
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param offset How long to wait before applying this effect (in ms)
   * @param isPersistent If true, the effect re-queues itself after completing
   */
  public addEffect(name: string, effect: Effect, offset: number = 0, isPersistent: boolean = false): void {
    if (this.systemEffects.isBlackoutActive() && effect.transitions[0].layer < 200) {
      console.warn('Add cancelling blackout');
      this.systemEffects.cancelBlackout();
    }
    
    if (effect.transitions.length === 0) {
      console.warn(`Effect "${name}" has no transitions. Ignoring.`);
      return;
    }

    const transitionsByLayerAndLight = this.effectTransformer.groupTransitionsByLayerAndLight(effect.transitions);
    
    // Check if the effect contains transitions for layer 0
    const hasLayer0 = transitionsByLayerAndLight.has(0);
    if (hasLayer0) {
      this._lastCalled0LayerEffect = name;
    }

    const startEffectForLight = (layer: number, lightId: string, transitionsForLight: EffectTransition[]) => {
      // Check if this specific light has an active effect
      const activeEffect = this.layerManager.getActiveEffect(layer, lightId);
      
      if (activeEffect) {
        if (activeEffect.name === name) {
          // Same effect name - queue it for this light
          this.layerManager.addQueuedEffect(layer, lightId, { name, effect, isPersistent, lightId });
        } else {
          // Different effect name - remove current effect and start new one
          this.removeEffectByLayer(layer, false);
          this.layerManager.removeQueuedEffect(layer, lightId);
          this.startEffect(name, effect, [transitionsForLight[0].lights.find(l => l.id === lightId)!], layer, transitionsForLight, isPersistent);
        }
      } else {
        // No active effect - start new one
        this.startEffect(name, effect, [transitionsForLight[0].lights.find(l => l.id === lightId)!], layer, transitionsForLight, isPersistent);
      }
    };

    const executeAddEffect = () => {
      transitionsByLayerAndLight.forEach((layerMap, layer) => {
        layerMap.forEach((transitionsForLight, lightId) => {
          startEffectForLight(layer, lightId, transitionsForLight);
        });
      });
    };

    if (offset > 0) {
      this.timeoutManager.setTimeout(() => {
        executeAddEffect();
      }, offset);
    } else {
      executeAddEffect();
    }
  }

  /**
   * Adds a new effect and clears all other effects that were running.
   * Used for significant changes in scenes. E.g., from Menu to in-game.
   * 
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param offset How long to wait before applying this effect (in ms)
   * @param isPersistent If true, the effect re-queues itself after completing
   */
  public async setEffect(name: string, effect: Effect, offset: number = 0, isPersistent: boolean = false): Promise<void> {
   // console.log(`Setting effect ${name} with offset ${offset}`);
    if (this.systemEffects.isBlackoutActive()) {
      console.warn('Cancelling blackout for setEffect');
      this.systemEffects.cancelBlackout();
    }

    if (effect.transitions.length === 0) {
      console.warn(`Effect "${name}" has no transitions. Ignoring.`);
      return;
    }

    const transitionsByLayerAndLight = this.effectTransformer.groupTransitionsByLayerAndLight(effect.transitions);
    
    // Check if the effect contains transitions for layer 0
    const hasLayer0 = transitionsByLayerAndLight.has(0);
    
    const executeSetEffect = () => {
      // Check to see if we've called setEffect before for this effect. If so, queue it and don't clear all.
      if (hasLayer0 && this._lastCalled0LayerEffect === name) {
        transitionsByLayerAndLight.forEach((layerMap, layer) => {
                  layerMap.forEach((_, lightId) => {
          this.layerManager.addQueuedEffect(layer, lightId, { name, effect, isPersistent, lightId });
        });
        });
      } else {
        this.removeAllEffects();
        this.addEffect(name, effect, 0, isPersistent);
        
        // Update the last layer 0 effect name if this effect targets layer 0
        if (hasLayer0) {
          this._lastCalled0LayerEffect = name;
        }
      }
    };

    if (offset > 0) {
      await new Promise<void>(resolve => {
        this.timeoutManager.setTimeout(() => {
          executeSetEffect();
          resolve();
        }, offset);
      });
    } else {
      executeSetEffect();
    }
  }

  /**
   * Adds an effect without applying it if an effect with the same name is already running.
   * Behaves like addEffect, except that if an effect of the same name is running, it discards
   * this new instance instead of queuing it. This prevents queue breaking timing issues.
   * 
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param offset How long to wait before applying this effect (in ms)
   * @param isPersistent If true, the effect re-queues itself after completing
   * @returns True if the effect was added, false otherwise
   */
  public addEffectUnblockedName(name: string, effect: Effect, offset: number = 0, isPersistent: boolean = false): boolean {
    if (this.systemEffects.isBlackoutActive() && effect.transitions[0].layer < 200) {
      console.warn(`Cannot add effect "${name}" because a blackout is in progress.`);
      return false;
    }
    
    if (effect.transitions.length === 0) {
      console.warn(`Effect "${name}" has no transitions. Ignoring.`);
      return false;
    }

    // Check if any effect with the same name is already running across all layers
    const effectAlreadyRunning = Array.from(this.layerManager.getActiveEffects().values()).some(
      (layerMap) => Array.from(layerMap.values()).some(
        (activeEffect) => activeEffect.name === name
      )
    );
    
    if (effectAlreadyRunning) {
    //  console.warn(`Not adding effect "${name}" because an effect with the same name is already running. Preventing timing issues.`);
      return false;
    }

    const transitionsByLayerAndLight = this.effectTransformer.groupTransitionsByLayerAndLight(effect.transitions);
    
    // Check if the effect contains transitions for layer 0
    const hasLayer0 = transitionsByLayerAndLight.has(0);
    if (hasLayer0) {
      this._lastCalled0LayerEffect = name;
    }

    const startEffectForLight = (layer: number, lightId: string, transitionsForLight: EffectTransition[]) => {
      // Check if there are any active effects on this layer for this specific light
      const hasActiveEffects = this.layerManager.getActiveEffect(layer, lightId);

      if (hasActiveEffects) {
        this.removeEffectByLayer(layer, false);
        // Remove queued effects for this specific light
        this.layerManager.removeQueuedEffect(layer, lightId);
      }
      this.startEffect(name, effect, [transitionsForLight[0].lights.find(l => l.id === lightId)!], layer, transitionsForLight, isPersistent);
    };

    const executeAddEffect = () => {
      transitionsByLayerAndLight.forEach((layerMap, layer) => {
        layerMap.forEach((transitionsForLight, lightId) => {
          startEffectForLight(layer, lightId, transitionsForLight);
        });
      });
    };

    if (offset > 0) {
      this.timeoutManager.setTimeout(() => {
        executeAddEffect();
      }, offset);
    } else {
      executeAddEffect();
    }

    return true;
  }

  /**
   * Sets an effect without applying it if an effect with the same name is already running.
   * Behaves like setEffect, except that if an effect of the same name is running, it discards
   * this new instance instead of replacing it. This prevents queue breaking timing issues.
   * 
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param offset How long to wait before applying this effect (in ms)
   * @param isPersistent If true, the effect re-queues itself after completing
   * @returns True if the effect was set, false otherwise
   */
  public setEffectUnblockedName(name: string, effect: Effect, offset: number = 0, isPersistent: boolean = false): boolean {
    if (this.systemEffects.isBlackoutActive() && effect.transitions[0].layer < 200) {
      console.warn(`Cannot add effect "${name}" because a blackout is in progress.`);
      return false;
    }

    if (effect.transitions.length === 0) {
      console.warn(`Effect "${name}" has no transitions. Ignoring.`);
      return false;
    }

    // Check if any effect with the same name is already running across all layers
    const effectAlreadyRunning = Array.from(this.layerManager.getActiveEffects().values()).some(
      (layerMap) => Array.from(layerMap.values()).some(
        (activeEffect) => activeEffect.name === name
      )
    );
    
    if (effectAlreadyRunning) {
      console.warn(`Not setting effect "${name}" because an effect with the same name is already running. Preventing timing issues.`);
      return false;
    }

    // Remove all existing effects first
    this.removeAllEffects();

    const transitionsByLayerAndLight = this.effectTransformer.groupTransitionsByLayerAndLight(effect.transitions);

    // Check if the effect contains transitions for layer 0
    const hasLayer0 = transitionsByLayerAndLight.has(0);
    if (hasLayer0) {
      this._lastCalled0LayerEffect = name;
    }

    const executeSetEffect = () => {
      transitionsByLayerAndLight.forEach((layerMap, layer) => {
        layerMap.forEach((transitionsForLight, lightId) => {
          this.startEffect(name, effect, [transitionsForLight[0].lights.find(l => l.id === lightId)!], layer, transitionsForLight, isPersistent);
        });
      });
    };

    if (offset > 0) {
      this.timeoutManager.setTimeout(() => {
        executeSetEffect();
      }, offset);
    } else {
      executeSetEffect();
    }

    return true;
  }

  /**
   * Removes a specific effect by name and layer
   * @param name The name of the effect to remove
   * @param layer The layer on which the effect is running
   */
  public removeEffect(name: string, layer: number): void {
    const activeEffects = this.layerManager.getActiveEffects().get(layer);
    if (!activeEffects) return;
    
    // Find and remove effects with the matching name
    activeEffects.forEach((activeEffect, _lightId) => {
      if (activeEffect.name === name) {
        this.removeEffectByLayer(layer, true);
      }
    });
  }

  /**
   * Removes all active effects and clears the queue
   */
  public removeAllEffects(): void {
   // console.log("Removing all effects");
    
    // First clear the queue to prevent queued effects from being started when active effects are removed
    this.layerManager.getEffectQueue().clear();
    
    // Then remove active effects
    const allLayers = this.layerManager.getAllLayers();
    for (const layer of allLayers) {
      if (layer === 0) {
        // Remove effect from layer 0, but preserve final colour for transitioning
        this.removeEffectByLayer(layer, false);
      } else {
        // Remove effect + transitions from all other layers
        this.removeEffectByLayer(layer, true);
      }
    }
    
    // Reset the last called layer 0 effect to prevent jamming issues if we restart the same effect
    this._lastCalled0LayerEffect = "";
  }

  /**
   * Starts an effect
   * @param name The name of the effect
   * @param effect The effect data
   * @param lights The lights to apply the effect to
   * @param layer The layer to apply the effect on
   * @param transitions The transitions to apply
   * @param isPersistent Whether the effect should persist after completion
   */
  public startEffect(
    name: string,
    effect: Effect,
    lights: TrackedLight[],
    layer: number,
    transitions: EffectTransition[],
    isPersistent = false,
  ): void {
    // Create separate LightEffectState objects for each light
    lights.forEach(light => {
      // Expand transitions to one-light-per-transition for this specific light
      const lightTransitions = this.effectTransformer.expandTransitionsByLight(transitions)
        .filter(t => t.lights.some(l => l.id === light.id));
      
      if (lightTransitions.length === 0) return;
      
      const lightEffect: LightEffectState = {
        name,
        effect,
        transitions: lightTransitions,
        lightId: light.id,
        layer,
        currentTransitionIndex: 0,
        state: 'idle' as const,
        transitionStartTime: 0,
        waitEndTime: 0,
        isPersistent
      };

      // Add the effect to the layer manager for this specific light
      this.layerManager.addActiveEffect(layer, light.id, lightEffect);
    });
  }

  /**
   * Removes an effect from a specific layer
   * @param layer The layer from which to remove the effect
   * @param shouldRemoveTransitions Whether to remove transition (colour) data too
   */
  public removeEffectByLayer(layer: number, shouldRemoveTransitions: boolean): void {
    // Get all active effects for this layer
    const activeEffects = this.layerManager.getActiveEffects().get(layer);
    if (!activeEffects) return;
    
    // Process each light's effect on this layer
    activeEffects.forEach((activeEffect, lightId) => {
      // Capture final state before removing the effect
      this.layerManager.captureFinalStates(layer, [activeEffect.transitions[0].lights.find(l => l.id === lightId)!]);
      
      // Remove the effect from active effects
      this.layerManager.removeActiveEffect(layer, lightId);
      
      // Start the next effect in queue for this light on this layer if one exists
      const hasNextEffect = this.startNextEffectInQueue(layer, lightId);
    //  console.log(`Removing effect ${activeEffect.name} from layer ${layer}, light ${lightId}. Has next effect: ${hasNextEffect}`);

      // If we're removing the effect and there's no next effect in the queue,
      // also reset layer tracking to prevent cleanup after grace period
      if (!hasNextEffect) {
        this.layerManager.resetLayerTracking(layer);
      }

      // Clean up transitions ONLY if requested AND there's no next effect AND it's not layer 0
      if (shouldRemoveTransitions && !hasNextEffect && layer > 0) {
        // We've confirmed no new effect is starting on this layer for this light
        this.transitionEngine.getLightTransitionController().removeLightLayer(lightId, layer);
        
        // Don't clear states for layer 0 to maintain smooth transitions
      }
    });
  }

  /**
   * Starts the next effect in the queue for a specific layer and light
   * @param layer The layer to start the next effect on
   * @param lightId The light ID to start the next effect on
   */
  public startNextEffectInQueue(layer: number, lightId: string): boolean {
    const nextEffect = this.layerManager.getQueuedEffect(layer, lightId);
    if (!nextEffect) return false;
   // console.log(`Starting next effect in queue: ${JSON.stringify(nextEffect)}`);
    
   // Remove from queue
    this.layerManager.removeQueuedEffect(layer, lightId);
    
    // Check if we have any active transitions for these lights
    const transitions = nextEffect.effect.transitions.filter(t => t.layer === layer);
    if (transitions.length === 0) return false;
    
    // Find out what lights were tracked in the previous effect so we can
    // use their final states
    const previousEffect = this.layerManager.getActiveEffect(layer, lightId);
    const trackedLights = previousEffect ? [previousEffect.transitions[0].lights.find(l => l.id === lightId)!] : [];
    
    // Start the effect
    this.startEffect(
      nextEffect.name,
      nextEffect.effect,
      trackedLights.length > 0 ? trackedLights : transitions[0].lights,
      layer,
      transitions,
      nextEffect.isPersistent
    );

    return true;
  }


  /**
   * Sets the state of a group of lights to a specific colour over time.
   * Each light will have its state interpolated from the current state to the passed color value.
   * State tracking happens on layer 0.
   * 
   * @param lights Array of lights to update
   * @param color Target colour to transition to
   * @param time Duration of the transition in milliseconds
   */
  public setState(lights: TrackedLight[], color: RGBIP, time: number): void {
    if (lights.length === 0) {
      console.warn('No lights provided to setState');
      return;
    }

    if (this.systemEffects.isBlackoutActive()) {
      console.warn('Cancelling blackout to set light states');
      this.systemEffects.cancelBlackout();
    }

    // Create transitions for each light
    const transitions: EffectTransition[] = [{
      lights: lights,
      layer: 0, 
      waitFor: 'none',
      forTime: 0,
      transform: {
        color: color,
        easing: 'linear',
        duration: time
      },
      waitUntil: 'none',
      untilTime: 0
    }];

    // Create an effect
    const effect: Effect = {
      id: `setState`, 
      description: 'Set light state directly',
      transitions: transitions
    };

    // Use our existing mechanism to add the effect on layer 0
    this.addEffect('setState', effect);
  }

  /**
   * Gets all active effects for a specific light across all layers
   * @param lightId The ID of the light
   * @returns A map from layer number to LightEffectState
   */
  public getActiveEffectsForLight(lightId: string): Map<number, LightEffectState> {
    return this.layerManager.getActiveEffectsForLight(lightId);
  }

  /**
   * Checks if a specific layer is free for a specific light
   * @param layer The layer number to check
   * @param lightId The ID of the light
   * @returns True if the layer is free for the light, false otherwise
   */
  public isLayerFreeForLight(layer: number, lightId: string): boolean {
    return this.layerManager.isLayerFreeForLight(layer, lightId);
  }
}
