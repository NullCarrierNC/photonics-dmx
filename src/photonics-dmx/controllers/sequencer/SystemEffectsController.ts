import { RGBIO, Transition } from '../../types';
import { LightTransitionController } from './LightTransitionController';
import { ILayerManager, ISystemEffectsController } from './interfaces';

/**
 * @class SystemEffectsController
 * @description Handles system-level effects like blackout .
 */
export class SystemEffectsController implements ISystemEffectsController {
  private lightTransitionController: LightTransitionController;
  private layerManager: ILayerManager;
  private isBlackingOut: boolean = false;
  private _blackoutLayersUnder: number = 200;
  
  // Callback for blackout completion events (both immediate and timed)
  private onBlackoutCompleteCallback: (() => void) | null = null;

  /**
   * @constructor
   * @param lightTransitionController The underlying transition controller
   * @param layerManager The layer manager instance
   * @param timeoutManager The timeout manager
   */
  constructor(
    lightTransitionController: LightTransitionController,
    layerManager: ILayerManager,
  ) {
    this.lightTransitionController = lightTransitionController;
    this.layerManager = layerManager;
  }

  /**
   * Registers a callback to be called when a blackout completes (either immediate or timed)
   */
  public setOnBlackoutCompleteCallback(callback: () => void): void {
    this.onBlackoutCompleteCallback = callback;
  }

  /**
   * Checks if a blackout is currently active
   * @returns Whether blackout is active
   */
  public isBlackoutActive(): boolean {
    return this.isBlackingOut;
  }

  /**
   * Initiates a blackout effect that visually fades out all lights. 
   * If called, we set isBlackingOut and schedule a transition on layer 200,
   * then clear all active effects after the fade completes.
   * As it's on layer 200 with a high priority, it will override all other effects below.
   * Effects over 200, such as strobes, will continue to operate as normal.
   * 
   * @param duration The duration of the blackout fade in milliseconds.
   * @returns A promise that resolves when the blackout is complete.
   */
  public async blackout(duration: number): Promise<void> {
    if (this.isBlackingOut) {
      console.warn(`Blackout is already in progress. Ignoring the new blackout request.`);
      return;
    }
    
    if (duration === 0) {
      // Clear all active effects and queues for all layers
      const allLayers = this.layerManager.getAllLayers();
      for (const layer of allLayers) {
        this.layerManager.removeActiveEffect(layer, 'all');
        this.layerManager.removeQueuedEffect(layer, 'all');
      }
      this.lightTransitionController.immediateBlackout();
      
      // Trigger the immediate blackout callback if registered
      if (this.onBlackoutCompleteCallback) {
        this.onBlackoutCompleteCallback();
      }
      
      return;
    }

    this.isBlackingOut = true;
   
    console.log(`Initiating blackout for ${duration}ms.`);
    
    try {
      const allLightIds = this.lightTransitionController.getAllLightIds();
      if (allLightIds.length > 0) {
        // Use maximum layer to override everything
        const blackoutLayer = 200;
        
        // Set transitions for all lights
        const transitionPromises = allLightIds.map(lightId => {
          return new Promise<void>(resolve => {
            // Get current light state to check for existing pan/tilt values
            const currentLightState = this.lightTransitionController.getFinalLightState(lightId);

            // Create a base blackout color without pan/tilt
            const blackoutColor: RGBIO = {
              red: 0,
              green: 0,
              blue: 0,
              intensity: 0,
              opacity: 1.0,
              blendMode: 'replace'
            };
            
            // Only preserve pan/tilt for fixtures that already have them
            if (currentLightState && currentLightState.pan !== undefined) {
              blackoutColor.pan = currentLightState.pan;
            }
            
            if (currentLightState && currentLightState.tilt !== undefined) {
              blackoutColor.tilt = currentLightState.tilt;
            }

            // Create a blackout transition that only preserves existing pan/tilt values
            const blackoutTransition: Transition = {
              transform: {
                color: blackoutColor,
                easing: 'linear',
                duration: duration,
              },
              layer: blackoutLayer,
            };

            this.lightTransitionController.setTransition(
              lightId,
              blackoutLayer,
              this.lightTransitionController.getLightState(lightId, 0),
              blackoutTransition.transform.color,
              blackoutTransition.transform.duration,
              blackoutTransition.transform.easing
            );
            // Ensure we resolve after the transition duration
            setTimeout(resolve, duration + 16); // Add one frame time to ensure completion
          });
        });

        // Wait for all transitions to complete
        await Promise.all(transitionPromises);

        // Clear all effects and force black state
        const allLayers = this.layerManager.getAllLayers();
        for (const layer of allLayers) {
          this.layerManager.removeActiveEffect(layer, 'all');
          this.layerManager.removeQueuedEffect(layer, 'all');
        }
        
        // Force immediate black state for all lights while preserving pan/tilt
        allLightIds.forEach(lightId => {
          // Get current state to check for existing pan/tilt values
          const currentLightState = this.lightTransitionController.getFinalLightState(lightId);
          
          // Create a base black state
          const blackState: RGBIO = {
            red: 0,
            green: 0,
            blue: 0,
            intensity: 0,
            opacity: 1.0,
            blendMode: 'replace'
          };
          
          // Only preserve pan/tilt for fixtures that already have them
          if (currentLightState && currentLightState.pan !== undefined) {
            blackState.pan = currentLightState.pan;
          }
          
          if (currentLightState && currentLightState.tilt !== undefined) {
            blackState.tilt = currentLightState.tilt;
          }
          
          this.lightTransitionController.setTransition(
            lightId,
            0, // Use base layer
            undefined, // No start state needed for immediate effect
            blackState,
            0, // Instant
            'linear'
          );
        });

        // Trigger the callback after timed blackout completes as well
        if (this.onBlackoutCompleteCallback) {
          this.onBlackoutCompleteCallback();
        }
      }
    } catch (error) {
      console.error('An error occurred during blackout:', error);
    } finally {
      this.isBlackingOut = false;
    }
  }

 
  /**
   * Cancels a blackout mid-fade. 
   * We remove transitions from layer 200 so new effects can override.
   */
  public cancelBlackout(): void {
    if (this.isBlackingOut) {
      console.warn("Cancelling in-progress blackout.");
      this.isBlackingOut = false;
      this.lightTransitionController.removeTransitionsByLayer(200);
    }
  }

  /**
   * Gets the layer threshold used for blackout operations
   * @returns The layer number below which effects are blocked during blackout
   */
  public getBlackoutLayersUnder(): number {
    return this._blackoutLayersUnder;
  }
}
