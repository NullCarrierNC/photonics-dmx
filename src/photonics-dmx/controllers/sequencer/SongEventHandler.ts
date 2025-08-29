import { performance } from 'perf_hooks';
import { ISongEventHandler, ILayerManager, ITransitionEngine } from './interfaces';

/**
 * @class EventHandler
 * @description Handles beat/measure/keyframe events by transitioning effects that
 * are waiting for the event to occur.
 */
export class SongEventHandler implements ISongEventHandler {
  private layerManager: ILayerManager;
  private transitionEngine: ITransitionEngine;

  /**
   * @constructor
   * @param layerManager The layer manager instance
   * @param transitionEngine The transition engine instance
   */
  constructor(layerManager: ILayerManager, transitionEngine: ITransitionEngine) {
    this.layerManager = layerManager;
    this.transitionEngine = transitionEngine;
  }

  /**
   * Trigger the beat event.
   */
  public onBeat(): void {
    this.handleEvent('beat');
  }

  /**
   * Trigger the measure event.
   */
  public onMeasure(): void {
    this.handleEvent('measure');
  }

  /**
   * Trigger a keyframe event.
   */
  public onKeyframe(): void {
    this.handleEvent('keyframe');
  }

  /**
   * Handles external events ('beat', 'measure', or 'keyframe') to progress effects.
   * 
   * @param eventType The type of event
   */
  public handleEvent(eventType: 'beat' | 'measure' | 'keyframe'): void {
    const currentTime = performance.now();
    
    this.layerManager.getActiveEffects().forEach((layerMap, _layer) => {
      layerMap.forEach((activeEffect, _lightId) => {
        const currentTransition = activeEffect.transitions[activeEffect.currentTransitionIndex];
        if (!currentTransition) return;
        
        // Handle waitForCondition with count-based logic
        if (activeEffect.state === 'waitingFor' && currentTransition.waitForCondition === eventType) {
          // Check if we need to decrement the count
          if (currentTransition.waitForConditionCount !== undefined && currentTransition.waitForConditionCount > 0) {
            currentTransition.waitForConditionCount--;
            
            // If count reaches 0, start the transition
            if (currentTransition.waitForConditionCount === 0) {
              this.transitionEngine.startTransition(activeEffect, currentTransition, currentTime);
            }
          } else {
            // No count specified, start transition immediately
            this.transitionEngine.startTransition(activeEffect, currentTransition, currentTime);
          }
        }
        
        // Handle waitUntilCondition with count-based logic
        if (activeEffect.state === 'waitingUntil' && currentTransition.waitUntilCondition === eventType) {
          // Check if we need to decrement the count
          if (currentTransition.waitUntilConditionCount !== undefined && currentTransition.waitUntilConditionCount > 0) {
            currentTransition.waitUntilConditionCount--;
            
            // If count reaches 0, move to next transition
            if (currentTransition.waitUntilConditionCount === 0) {
              // Move to the next transition and immediately prepare it
              activeEffect.currentTransitionIndex += 1;
              
              // Check if there's another transition and prepare it immediately
              if (activeEffect.currentTransitionIndex < activeEffect.transitions.length) {
                const nextTransition = activeEffect.transitions[activeEffect.currentTransitionIndex];
                activeEffect.state = 'idle';
                this.transitionEngine.prepareTransition(activeEffect, nextTransition, currentTime);
              } else {
                // If no more transitions, just set to idle
                activeEffect.state = 'idle';
              }
            }
          } else {
            // No count specified, move to next transition immediately
            // Move to the next transition and immediately prepare it
            activeEffect.currentTransitionIndex += 1;
            
            // Check if there's another transition and prepare it immediately
            if (activeEffect.currentTransitionIndex < activeEffect.transitions.length) {
              const nextTransition = activeEffect.transitions[activeEffect.currentTransitionIndex];
              activeEffect.state = 'idle';
              this.transitionEngine.prepareTransition(activeEffect, nextTransition, currentTime);
            } else {
              // If no more transitions, just set to idle
              activeEffect.state = 'idle';
            }
          }
        }
      });
    });
  }
}
