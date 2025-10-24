import { performance } from 'perf_hooks';
import { EffectTransition, RGBIO } from '../../types';
import { LightTransitionController } from './LightTransitionController';
import { LightEffectState, ILayerManager, ITransitionEngine } from './interfaces';
import { IEffectManager } from './interfaces';
import { Clock } from './Clock';

/**
 * @class TransitionEngine
 * @description Handles moving effect transitions through their states.
 * 
 */
export class TransitionEngine implements ITransitionEngine {
  private lightTransitionController: LightTransitionController;
  private layerManager: ILayerManager;
  private effectManager!: IEffectManager;
  private clock: Clock | null = null;
  private updateCallback: (deltaTime: number) => void; 
  
  /**
   * @constructor
   * @param lightTransitionController The underlying transition controller
   * @param layerManager The layer manager instance
   */
  constructor(
    lightTransitionController: LightTransitionController,
    layerManager: ILayerManager
  ) {
    this.lightTransitionController = lightTransitionController;
    this.layerManager = layerManager;
    
    // Create the update callback bound to this instance
    this.updateCallback = this.updateTransitions.bind(this);
  }


  /**
   * Gets the current time using performance.now() for absolute time
   * @returns The current time in milliseconds
   */
  private getCurrentTime(): number {
    return performance.now();
  }

  /**
   * Register this component with the clock
   * @param clock The clock instance
   */
  public registerWithClock(clock: Clock): void {
    this.clock = clock;
    clock.onTick(this.updateCallback);
  }

  /**
   * Unregister from the clock
   */
  public unregisterFromClock(): void {
    if (this.clock) {
      this.clock.offTick(this.updateCallback);
      this.clock = null;
    }
  }

  /**
   * Set the effect manager reference
   * This needs to be set after construction to avoid circular dependencies
   * @param effectManager The effect manager instance
   */
  public setEffectManager(effectManager: IEffectManager): void {
    this.effectManager = effectManager;
  }

  /**
   * Helper method to ensure a LightEffectState has a lastEndState
   * @param effect The effect to ensure has lastEndState
   */
  private ensureLastEndState(effect: LightEffectState): void {
    if (!effect.lastEndState) {
      // Get the current state for this light on this layer
      const currentState = this.lightTransitionController.getLightState(effect.lightId, effect.layer);
      if (currentState) {
        effect.lastEndState = { ...currentState };
      } else {
        // Default black state if no current state exists
        effect.lastEndState = {
          red: 0,
          green: 0,
          blue: 0,
          intensity: 0,
          opacity: 1.0,
          blendMode: 'replace'
        };
      }
    }
  }



  /**
   * Gets the underlying light transition controller
   * @returns The light transition controller
   */
  public getLightTransitionController(): LightTransitionController {
    return this.lightTransitionController;
  }

  /**
   * Updates all active transitions using a single timestamp for atomic calculations.
   * This method is called by the Clock system to advance transitions incrementally.
   * 
   * @param deltaTime The time elapsed since last update in milliseconds (unused)
   */
  public updateTransitions(_deltaTime: number = 0): void {
    // Skip processing if a global clear is in progress to avoid races
    if (this.lightTransitionController && (this.lightTransitionController as any).isClearing && (this.lightTransitionController as any).isClearing()) {
      return;
    }

    // Single timestamp for all effect state machines
    const currentTime = this.getCurrentTime();

    const effectsToRemove: Array<{layer: number, lightId: string}> = [];

    // Process ALL light effects using the SAME currentTime
    this.layerManager.getActiveEffects().forEach((layerMap, layer) => {
      this.layerManager.setLayerLastUsed(layer, currentTime);
      
      layerMap.forEach((lightEffect, lightId) => {
        if (lightEffect.currentTransitionIndex >= lightEffect.transitions.length) {
          effectsToRemove.push({layer, lightId});
          return;
        }

        const currentTransition = lightEffect.transitions[lightEffect.currentTransitionIndex];
        
        // Process state machine - all use the same currentTime
        switch (lightEffect.state) {
          case 'idle':
            this.prepareTransition(lightEffect, currentTransition, currentTime);
            break;
          case 'waitingFor':
            this.handleWaitingFor(lightEffect, currentTransition, currentTime);
            break;
          case 'transitioning':
            this.handleTransitioning(lightEffect, currentTransition, currentTime);
            break;
          case 'waitingUntil':
            this.handleWaitingUntil(lightEffect, currentTransition, currentTime);
            break;
          default:
            console.warn(`Unknown state "${lightEffect.state}" for effect "${lightEffect.effect.id}".`);
        }
      });
    });

    // Process completed effects
    for (const {layer, lightId} of effectsToRemove) {
      const justFinishedEffect = this.layerManager.getActiveEffect(layer, lightId);
      if (!justFinishedEffect) continue;

      // Remove the effect from active effects
      this.layerManager.removeActiveEffect(layer, lightId);

      // If the effect is persistent, re-queue it for immediate restart
      if (justFinishedEffect.isPersistent) {
        this.layerManager.addQueuedEffect(layer, lightId, {
          name: justFinishedEffect.name,
          effect: justFinishedEffect.effect,
          lightId: lightId,
          isPersistent: true
        });
        
        // Start the next cycle immediately for persistent effects
        if (this.effectManager) {
          this.effectManager.startNextEffectInQueue(layer, lightId);
        }
      } else {
        // Non-persistent effect - check for queued effects
        const nextQueuedEffect = this.layerManager.getQueuedEffect(layer, lightId);
        if (nextQueuedEffect) {
          // Start the next effect if we have an effect manager
          if (this.effectManager) {
            this.effectManager.startNextEffectInQueue(layer, lightId);
          } else {
            console.warn(`Cannot start next queued effect for layer ${layer}, light ${lightId} - no effect manager set`);
          }
        } else {
          // Only if there's no next effect, remove transitions for non-base layers
          if (layer > 0) {
            // Only remove transitions if we've confirmed no new effect is queued
            this.lightTransitionController.removeLightLayer(lightId, layer);
            
            // Only clear final states if there's no next effect and we've removed transitions
            this.layerManager.clearLayerStates(layer);
          }
        }
      }
    }

    // Clean up unused layers
    this.layerManager.cleanupUnusedLayers(currentTime);
  }

  /**
   * Prepares the transition by setting it to the 'waitingFor' state.
   * If no wait is needed, the transition starts immediately.
   * 
   * @param activeEffect The active effect record
   * @param transition The current transition to prepare
   * @param currentTime The current timestamp (shared across all calculations)
   */
  public prepareTransition(activeEffect: LightEffectState, transition: EffectTransition, currentTime: number): void {
    activeEffect.state = 'waitingFor';
    if (transition.waitForCondition === 'none') {
      this.startTransition(activeEffect, transition, currentTime);
    } else {
      activeEffect.transitionStartTime = currentTime;
      if (transition.waitForCondition === 'delay') {
        activeEffect.waitEndTime = currentTime + transition.waitForTime;
      } else {
        activeEffect.waitEndTime = currentTime;
      }
    }
  }

    /**
   * Checks if the transition can start now if we're waiting on a delay or immediate start.
   * 
   * @param activeEffect The active effect record
   * @param transition The current transition being waited on
   * @param currentTime The current timestamp (shared across all calculations)
   */
  public handleWaitingFor(activeEffect: LightEffectState, transition: EffectTransition, currentTime: number): void {
    if (transition.waitForCondition === 'delay') {
      if (currentTime >= activeEffect.waitEndTime) {
        this.startTransition(activeEffect, transition, currentTime);
      }
    } else if (transition.waitForCondition === 'none') {
      this.startTransition(activeEffect, transition, currentTime);
    }
  }

  /**
   * Starts a transition and configures the LightTransitionController
   * 
   * @param activeEffect The active effect record
   * @param transition The current transition to execute
   * @param currentTime The current timestamp (shared across all calculations)
   */
  public startTransition(activeEffect: LightEffectState, transition: EffectTransition, currentTime: number): void {
    this.ensureLastEndState(activeEffect);
    
    // Since this is a per-light effect, we work with the single light in the transition
    const light = transition.lights[0];
    
    // First check if there's a saved state in the effect's lastEndState
    let startState: RGBIO | undefined = undefined;
    
    if (activeEffect.lastEndState) {
      // Use the effect's stored state if available - this is crucial for smooth transitions
      startState = activeEffect.lastEndState;
    }
    
    // If no state in the effect, check the layer manager for stored state
    if (!startState) {
      startState = this.layerManager.getLightState(transition.layer, light.id);
    }
    
    // If still no state, check the current light state in the controller
    if (!startState) {
      startState = this.lightTransitionController.getLightState(light.id, transition.layer);
    }
    
    // If all else fails, use a default black state
    if (!startState) {
      startState = { 
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 1.0,
        blendMode: 'replace'
      };
    }

    let color = { ...transition.transform.color };
    if (light.config) {
      if (color.pan === undefined) {
        color.pan = light.config.panHome;
      }
      if (color.tilt === undefined) {
        color.tilt = light.config.tiltHome;
      }
    }

    this.lightTransitionController.setTransition(
      light.id,
      transition.layer,
      startState,
      color,
      transition.transform.duration,
      transition.transform.easing
    );

    activeEffect.state = 'transitioning';
    activeEffect.transitionStartTime = currentTime;
    activeEffect.waitEndTime = currentTime + transition.transform.duration;
  }

  /**
   * Handles the transitioning state and wait conditions. Checks if the transition is done.
   * 
   * @param activeEffect The active effect record
   * @param transition The current transition being processed
   * @param currentTime The current timestamp (shared across all calculations)
   */
  public handleTransitioning(activeEffect: LightEffectState, transition: EffectTransition, currentTime: number): void {
    this.ensureLastEndState(activeEffect);
    
    if (currentTime >= activeEffect.waitEndTime) {
      // Since this is a per-light effect, we just update the lastEndState directly
      activeEffect.lastEndState = transition.transform.color;
      activeEffect.state = 'waitingUntil';
      if (transition.waitUntilCondition === 'none') {
        activeEffect.currentTransitionIndex += 1;
        activeEffect.state = 'idle';
      } else if (transition.waitUntilCondition === 'delay') {
        activeEffect.transitionStartTime = currentTime;
        activeEffect.waitEndTime = currentTime + transition.waitUntilTime;
      } else {
        activeEffect.transitionStartTime = currentTime;
        activeEffect.waitEndTime = currentTime;
      }
    }
  }

  /**
   * Handles the 'waitingUntil' state, checking if we can move to next transition.
   * 
   * @param activeEffect The active effect record
   * @param transition The current transition being processed
   * @param currentTime The current timestamp (shared across all calculations)
   */
  public handleWaitingUntil(activeEffect: LightEffectState, transition: EffectTransition, currentTime: number): void {
    if (transition.waitUntilCondition === 'delay') {
      if (currentTime >= activeEffect.waitEndTime) {
        activeEffect.currentTransitionIndex += 1;
        activeEffect.state = 'idle';
      }
    } else if (transition.waitUntilCondition === 'none') {
      activeEffect.currentTransitionIndex += 1;
      activeEffect.state = 'idle';
    }
  }

  /**
   * Gets the stored final state for a light on a specific layer
   * @param lightId The ID of the light
   * @param layer The layer number
   * @returns The final state of the light on that layer, or undefined if not found
   */
  public getFinalState(lightId: string, layer: number): RGBIO | undefined {
    return this.layerManager.getLightState(layer, lightId);
  }

  /**
   * Clears stored final states for a layer
   * @param layer The layer to clear final states for
   */
  public clearFinalStates(layer: number): void {
    // Delegate to layer manager
    this.layerManager.clearLayerStates(layer);
  }
}
