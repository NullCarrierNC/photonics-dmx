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

  // Periodic timing correction properties
  private lastCorrectionTime: number = 0;
  private readonly CORRECTION_INTERVAL = 1000;  
  private readonly DRIFT_THRESHOLD = 5; 
  
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
    
    // Initialize timing state
    this.lastCorrectionTime = performance.now();
  }

  /**
   * Performs periodic timing corrections to compensate for accumulated drift
   * @param currentTime The current time for drift calculation
   */
  private performPeriodicTimingCorrection(currentTime: number): void {
    // Check if it's time for a correction
    if (currentTime - this.lastCorrectionTime < this.CORRECTION_INTERVAL) {
      return;
    }

    // Find an active effect with absolute timing to use as reference
    let referenceTiming: { cycleStartTime: number; cycleDuration: number; lightOffset: number } | null = null;
    let referenceEffectName: string | null = null;

    const allActiveEffects = this.layerManager.getActiveEffects();
    for (const [, layerEffects] of allActiveEffects) {
      for (const [, effect] of layerEffects) {
        if (effect.absoluteTiming) {
          referenceTiming = effect.absoluteTiming;
          referenceEffectName = effect.name;
          break;
        }
      }
      if (referenceTiming) break;
    }

    if (!referenceTiming || !referenceEffectName) return; // No active effects with absolute timing

    // Calculate expected vs actual timing
    const { cycleStartTime, cycleDuration, lightOffset } = referenceTiming;
    const timeSinceStart = currentTime - cycleStartTime;
    const expectedCycles = Math.floor(timeSinceStart / cycleDuration);
    const actualCycles = Math.floor((currentTime - cycleStartTime - lightOffset) / cycleDuration);

    // Calculate drift (difference between expected and actual cycles)
    const drift = (actualCycles - expectedCycles) * cycleDuration;

    // Apply correction if drift exceeds threshold
    if (Math.abs(drift) >= this.DRIFT_THRESHOLD) {
      const correctionAmount = drift;

      // Apply correction to all active effects with the same name
      this.layerManager.getActiveEffects().forEach((layerMap) => {
        layerMap.forEach((activeEffect) => {
          if (activeEffect.name === referenceEffectName && activeEffect.absoluteTiming) {
            activeEffect.absoluteTiming.cycleStartTime += correctionAmount;
          }
        });
      });

      // Update timing registry for this effect name
      if (this.effectManager && typeof this.effectManager.correctTimingRegistryByName === 'function') {
        this.effectManager.correctTimingRegistryByName(referenceEffectName, correctionAmount);
      } else if (this.effectManager) {
        // Fallback for older interface (by cycleStartTime)
        this.effectManager.correctTimingRegistry(cycleStartTime, correctionAmount);
      }

      this.lastCorrectionTime = currentTime;
    }
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
   * Updates all active transitions based on elapsed time since last update.
   * This method is called by the Clock system to advance transitions incrementally.
   * 
   * @param deltaTime The time elapsed since last update in milliseconds
   */
  public updateTransitions(_deltaTime: number = 0): void {
    // Skip processing if a global clear is in progress to avoid races
    if (this.lightTransitionController && (this.lightTransitionController as any).isClearing && (this.lightTransitionController as any).isClearing()) {
      return;
    }

    const currentTime = this.getCurrentTime();

    // Perform periodic timing corrections to compensate for accumulated drift
    this.performPeriodicTimingCorrection(currentTime);

    const effectsToRemove: Array<{layer: number, lightId: string}> = [];

    this.layerManager.getActiveEffects().forEach((layerMap, layer) => {
      this.layerManager.setLayerLastUsed(layer, performance.now());
      
      layerMap.forEach((lightEffect, lightId) => {
        if (lightEffect.currentTransitionIndex >= lightEffect.transitions.length) {
          effectsToRemove.push({layer, lightId});
          return;
        }

        const currentTransition = lightEffect.transitions[lightEffect.currentTransitionIndex];
        switch (lightEffect.state) {
          case 'idle':
            this.prepareTransition(lightEffect, currentTransition);
            break;
          case 'waitingFor':
            this.handleWaitingFor(lightEffect, currentTransition);
            break;
          case 'transitioning':
            this.handleTransitioning(lightEffect, currentTransition);
            break;
          case 'waitingUntil':
            this.handleWaitingUntil(lightEffect, currentTransition);
            break;
          default:
            console.warn(`Unknown state "${lightEffect.state}" for effect "${lightEffect.effect.id}".`);
        }
      });
    });

    // Process completed effects by ensuring the next effect is queued before removing transitions
    for (const {layer, lightId} of effectsToRemove) {
      const justFinishedEffect = this.layerManager.getActiveEffect(layer, lightId);
      if (!justFinishedEffect) continue;

      // Remove the effect from active effects
      this.layerManager.removeActiveEffect(layer, lightId);

      // If the effect is persistent, handle re-queuing with absolute timing
      if (justFinishedEffect.isPersistent) {
        // Add to queue with preserved timing metadata
        this.layerManager.addQueuedEffect(layer, lightId, {
          name: justFinishedEffect.name,
          effect: justFinishedEffect.effect,
          lightId: lightId,
          isPersistent: true,
          absoluteTiming: justFinishedEffect.absoluteTiming
        });
        
        // Calculate delay based on absolute timing (if available)
        if (justFinishedEffect.absoluteTiming) {
          const { cycleStartTime, cycleDuration, lightOffset } = justFinishedEffect.absoluteTiming;
          const currentTime = this.getCurrentTime();
          
          // Calculate the next scheduled start time for this light
          // This light starts at: cycleStartTime + (N * cycleDuration) + lightOffset for N = 0, 1, 2, ...
          // We need to find the next scheduled start time that is >= currentTime
          
          const elapsedSinceStart = currentTime - cycleStartTime;
          const timeSinceFirstStart = elapsedSinceStart - lightOffset;
          
          if (timeSinceFirstStart < 0) {
            // Haven't reached first start yet - wait for cycle 0
            // Use integer-based calculation for initial delay
            // Using cycle-aligned scheduling; immediate start handled by scheduleEffectCycleRestart
          } else {
            // The effect just finished. Calculate when this specific light should restart.
            // Use integer-based calculations to avoid floating-point precision drift
            
            // Calculate time since this light's first start (cycleStartTime + lightOffset)
            const timeSinceLightStart = currentTime - (cycleStartTime + lightOffset);
            
            // Find the most recent cycle boundary that we should have started at
            const lastCycleNumber = Math.floor(timeSinceLightStart / cycleDuration);
            const lastCycleStart = cycleStartTime + (lastCycleNumber * cycleDuration) + lightOffset;
            
            // If we've already passed the last cycle start time, start immediately
            // Otherwise, wait for the last cycle start time
            if (currentTime >= lastCycleStart) {
              // Immediate start handled by scheduleEffectCycleRestart
            } else {
              // Deferred start handled by scheduleEffectCycleRestart
            }
          }
        }
        // Schedule a clock-aligned restart for this light at its next offset position
        if (this.effectManager && justFinishedEffect.absoluteTiming) {
          this.effectManager.scheduleEffectCycleRestartForLight(
            justFinishedEffect.name,
            layer,
            lightId,
            justFinishedEffect.absoluteTiming.cycleStartTime,
            justFinishedEffect.absoluteTiming.cycleDuration,
            justFinishedEffect.absoluteTiming.lightOffset
          );
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
    this.layerManager.cleanupUnusedLayers(performance.now());
  }

  /**
   * Prepares the transition by setting it to the 'waitingFor' state.
   * If no wait is needed, the transition starts immediately.
   * 
   * @param activeEffect The active effect record
   * @param transition The current transition to prepare
   */
  public prepareTransition(activeEffect: LightEffectState, transition: EffectTransition): void {
    const currentTime = this.getCurrentTime();
    activeEffect.state = 'waitingFor';
    if (transition.waitForCondition === 'none') {
      this.startTransition(activeEffect, transition);
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
   */
  public handleWaitingFor(activeEffect: LightEffectState, transition: EffectTransition): void {
    const currentTime = this.getCurrentTime();
    if (transition.waitForCondition === 'delay') {
      if (currentTime >= activeEffect.waitEndTime) {
        this.startTransition(activeEffect, transition);
      }
    } else if (transition.waitForCondition === 'none') {
      this.startTransition(activeEffect, transition);
    }
  }

  /**
   * Starts a transition and configures the LightTransitionController
   * 
   * @param activeEffect The active effect record
   * @param transition The current transition to execute
   */
  public startTransition(activeEffect: LightEffectState, transition: EffectTransition): void {
    this.ensureLastEndState(activeEffect);
    /*
    const baseTransitionConfig = {
      transform: {
        ...transition.transform
      },
      layer: transition.layer
    };
*/
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

    const currentTime = this.getCurrentTime();
    activeEffect.state = 'transitioning';
    activeEffect.transitionStartTime = currentTime;
    activeEffect.waitEndTime = currentTime + transition.transform.duration;
  }

  /**
   * Handles the transitioning state and wait conditions. Checks if the transition is done.
   * 
   * @param activeEffect The active effect record
   * @param transition The current transition being processed
   */
  public handleTransitioning(activeEffect: LightEffectState, transition: EffectTransition): void {
    this.ensureLastEndState(activeEffect);
    
    const currentTime = this.getCurrentTime();
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
   */
  public handleWaitingUntil(activeEffect: LightEffectState, transition: EffectTransition): void {
    const currentTime = this.getCurrentTime();
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
