import { performance } from 'perf_hooks';
import { EffectTransition, RGBIP } from '../../types';
import { LightTransitionController } from './LightTransitionController';
import { ActiveEffect, ILayerManager, ITransitionEngine } from './interfaces';
import { IEffectManager } from './interfaces';

/**
 * @class TransitionEngine
 * @description Handles moving effect transitions through their states.
 * 
 */
export class TransitionEngine implements ITransitionEngine {
  private lightTransitionController: LightTransitionController;
  private layerManager: ILayerManager;
  private _animationLoopInterval: NodeJS.Timeout | null = null;
  private effectManager!: IEffectManager;

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
   * Helper method to ensure an ActiveEffect has a lastEndStates map
   * @param effect The effect to ensure has lastEndStates
   */
  private ensureLastEndStates(effect: ActiveEffect): void {
    if (!effect.lastEndStates) {
      effect.lastEndStates = new Map<string, RGBIP>();
    }
  }

  /**
   * Starts an internal loop that runs at ~60 fps to update transitions.
   * @returns {void}
   */
  public startAnimationLoop(): void {
    if (this._animationLoopInterval === null) {
      this._animationLoopInterval = setInterval(() => {
        this.updateTransitions();
      }, 1000 / 60);
    }
  }

  /**
   * Stops the internal animation loop.
   */
  public stopAnimationLoop(): void {
    if (this._animationLoopInterval !== null) {
      clearInterval(this._animationLoopInterval);
      this._animationLoopInterval = null;
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
   * Updates all active transitions by checking their states
   * and progressing them accordingly.
   */
  public updateTransitions(): void {
    const currentTime = performance.now();
    const now = performance.now();
    const layersToRemove: number[] = [];

    this.layerManager.getActiveEffects().forEach((activeEffect, layer) => {
      if (activeEffect.currentTransitionIndex >= activeEffect.transitions.length) {
        layersToRemove.push(layer);
        return;
      }
      this.layerManager.setLayerLastUsed(layer, now);

      const currentTransition = activeEffect.transitions[activeEffect.currentTransitionIndex];
      switch (activeEffect.state) {
        case 'idle':
          this.prepareTransition(activeEffect, currentTransition, currentTime);
          break;
        case 'waitingFor':
          this.handleWaitingFor(activeEffect, currentTransition, currentTime);
          break;
        case 'transitioning':
          this.handleTransitioning(activeEffect, currentTransition, currentTime);
          break;
        case 'waitingUntil':
          this.handleWaitingUntil(activeEffect, currentTransition, currentTime);
          break;
        default:
          console.warn(`Unknown state "${activeEffect.state}" for effect "${activeEffect.effect.id}".`);
      }
    });

    // Process completed effects by ensuring the next effect is queued before removing transitions
    for (const layer of layersToRemove) {
      const justFinishedEffect = this.layerManager.getActiveEffect(layer);
      if (!justFinishedEffect) continue;

      // Capture final states using the layer manager
      this.layerManager.captureFinalStates(layer, justFinishedEffect.trackedLights);
      
      // Remove the effect from active effects
      this.layerManager.removeActiveEffect(layer);

      // If the effect is persistent, add it to the queue
      if (justFinishedEffect.isPersistent) {
        this.layerManager.addQueuedEffect(layer, {
          name: justFinishedEffect.name,
          effect: justFinishedEffect.effect,
          isPersistent: true
        });
      }
      
      // Start the next queued effect for this layer immediately
      const nextQueuedEffect = this.layerManager.getQueuedEffect(layer);
      if (nextQueuedEffect) {
        // Start the next effect if we have an effect manager
        if (this.effectManager) {
          this.effectManager.startNextEffectInQueue(layer);
        } else {
          console.warn(`Cannot start next queued effect for layer ${layer} - no effect manager set`);
        }
      } else {
        // Only if there's no next effect, remove transitions for non-base layers
        if (layer > 0) {
          // Only remove transitions if we've confirmed no new effect is queued
          justFinishedEffect.trackedLights.forEach((light) => {
            this.lightTransitionController.removeLightLayer(light.id, layer);
          });
          this.lightTransitionController.removeTransitionsByLayer(layer);
          
          // Only clear final states if there's no next effect and we've removed transitions
          this.layerManager.clearLayerStates(layer);
        }
      }
    }

    // Clean up unused layers
    this.layerManager.cleanupUnusedLayers(now);
  }

  /**
   * Prepares the transition by setting it to the 'waitingFor' state.
   * If no wait is needed, the transition starts immediately.
   * 
   * @param activeEffect The active effect record
   * @param transition The current transition to prepare
   * @param currentTime The current timestamp
   */
  public prepareTransition(activeEffect: ActiveEffect, transition: EffectTransition, currentTime: number): void {
    activeEffect.state = 'waitingFor';
    if (transition.waitFor === 'none') {
      this.startTransition(activeEffect, transition, currentTime);
    } else {
      activeEffect.transitionStartTime = currentTime;
      if (transition.waitFor === 'delay') {
        activeEffect.waitEndTime = currentTime + transition.forTime;
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
   * @param currentTime The current timestamp
   */
  public handleWaitingFor(activeEffect: ActiveEffect, transition: EffectTransition, currentTime: number): void {
    if (transition.waitFor === 'delay') {
      if (currentTime >= activeEffect.waitEndTime) {
        this.startTransition(activeEffect, transition, currentTime);
      }
    } else if (transition.waitFor === 'none') {
      this.startTransition(activeEffect, transition, currentTime);
    }
  }

  /**
   * Starts a transition and configures the LightTransitionController
   * 
   * @param activeEffect The active effect record
   * @param transition The current transition to execute
   * @param currentTime The current timestamp
   */
  public startTransition(activeEffect: ActiveEffect, transition: EffectTransition, currentTime: number): void {
    this.ensureLastEndStates(activeEffect);
    
    const baseTransitionConfig = {
      transform: {
        ...transition.transform
      },
      layer: transition.layer
    };

    transition.lights.forEach(light => {
      // First check if there's a saved state in the effect's lastEndStates
      let startState: RGBIP | undefined = undefined;
      
      if (activeEffect.lastEndStates!.has(light.id)) {
        // Use the effect's stored state if available - this is crucial for smooth transitions
        startState = activeEffect.lastEndStates!.get(light.id);
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
          red: 0, rp: 0, 
          green: 0, gp: 0, 
          blue: 0, bp: 0, 
          intensity: 0, ip: 0 
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

      const localTransitionConfig = {
        transform: {
          ...baseTransitionConfig.transform,
          color,
        },
        layer: baseTransitionConfig.layer,
      };

      this.lightTransitionController.setTransition(
        light.id,
        transition.layer,
        startState,
        localTransitionConfig.transform.color,
        localTransitionConfig.transform.duration,
        localTransitionConfig.transform.easing
      );
    });

    activeEffect.state = 'transitioning';
    activeEffect.transitionStartTime = currentTime;
    activeEffect.waitEndTime = currentTime + transition.transform.duration;
  }

  /**
   * Handles the transitioning state and wait conditions. Checks if the transition is done.
   * 
   * @param activeEffect The active effect record
   * @param transition The current transition being processed
   * @param currentTime The current timestamp
   */
  public handleTransitioning(activeEffect: ActiveEffect, transition: EffectTransition, currentTime: number): void {
    this.ensureLastEndStates(activeEffect);
    
    if (currentTime >= activeEffect.waitEndTime) {
      activeEffect.trackedLights.forEach((light) => {
        activeEffect.lastEndStates!.set(light.id, transition.transform.color);
      });
      activeEffect.state = 'waitingUntil';
      if (transition.waitUntil === 'none') {
        activeEffect.currentTransitionIndex += 1;
        activeEffect.state = 'idle';
      } else if (transition.waitUntil === 'delay') {
        activeEffect.transitionStartTime = currentTime;
        activeEffect.waitEndTime = currentTime + transition.untilTime;
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
   * @param currentTime The current timestamp
   */
  public handleWaitingUntil(activeEffect: ActiveEffect, transition: EffectTransition, currentTime: number): void {
    if (transition.waitUntil === 'delay') {
      if (currentTime >= activeEffect.waitEndTime) {
        activeEffect.currentTransitionIndex += 1;
        activeEffect.state = 'idle';
      }
    } else if (transition.waitUntil === 'none') {
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
  public getFinalState(lightId: string, layer: number): RGBIP | undefined {
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
