import { performance } from 'perf_hooks';
import { ISongEventHandler, ILayerManager, ITransitionEngine } from './interfaces';
import { InstrumentNoteType, DrumNoteType } from '../../cues/cueTypes';

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
   * Handle individual drum note events
   */
  public onDrumNote(noteType: DrumNoteType): void {
    switch (noteType) {
      case DrumNoteType.Kick:
        this.handleEvent('drum-kick');
        break;
      case DrumNoteType.RedDrum:
        this.handleEvent('drum-red');
        break;
      case DrumNoteType.YellowDrum:
        this.handleEvent('drum-yellow');
        break;
      case DrumNoteType.BlueDrum:
        this.handleEvent('drum-blue');
        break;
      case DrumNoteType.GreenDrum:
        this.handleEvent('drum-green');
        break;
      case DrumNoteType.YellowCymbal:
        this.handleEvent('drum-yellow-cymbal');
        break;
      case DrumNoteType.BlueCymbal:
        this.handleEvent('drum-blue-cymbal');
        break;
      case DrumNoteType.GreenCymbal:
        this.handleEvent('drum-green-cymbal');
        break;
    }
  }

  /**
   * Handle individual guitar note events
   */
  public onGuitarNote(noteType: InstrumentNoteType): void {
    switch (noteType) {
      case InstrumentNoteType.Open:
        this.handleEvent('guitar-open');
        break;
      case InstrumentNoteType.Green:
        this.handleEvent('guitar-green');
        break;
      case InstrumentNoteType.Red:
        this.handleEvent('guitar-red');
        break;
      case InstrumentNoteType.Yellow:
        this.handleEvent('guitar-yellow');
        break;
      case InstrumentNoteType.Blue:
        this.handleEvent('guitar-blue');
        break;
      case InstrumentNoteType.Orange:
        this.handleEvent('guitar-orange');
        break;
    }
  }

  /**
   * Handle individual bass note events
   */
  public onBassNote(noteType: InstrumentNoteType): void {
    switch (noteType) {
      case InstrumentNoteType.Open:
        this.handleEvent('bass-open');
        break;
      case InstrumentNoteType.Green:
        this.handleEvent('bass-green');
        break;
      case InstrumentNoteType.Red:
        this.handleEvent('bass-red');
        break;
      case InstrumentNoteType.Yellow:
        this.handleEvent('bass-yellow');
        break;
      case InstrumentNoteType.Blue:
        this.handleEvent('bass-blue');
        break;
      case InstrumentNoteType.Orange:
        this.handleEvent('bass-orange');
        break;
    }
  }

  /**
   * Handle individual keys note events
   */
  public onKeysNote(noteType: InstrumentNoteType): void {
    switch (noteType) {
      case InstrumentNoteType.Open:
        this.handleEvent('keys-open');
        break;
      case InstrumentNoteType.Green:
        this.handleEvent('keys-green');
        break;
      case InstrumentNoteType.Red:
        this.handleEvent('keys-red');
        break;
      case InstrumentNoteType.Yellow:
        this.handleEvent('keys-yellow');
        break;
      case InstrumentNoteType.Blue:
        this.handleEvent('keys-blue');
        break;
      case InstrumentNoteType.Orange:
        this.handleEvent('keys-orange');
        break;
    }
  }



  /**
   * Handles external events to progress effects.
   * 
   * @param eventType The type of event
   */
  public handleEvent(eventType: 'beat' | 'measure' | 'keyframe' | 
    'drum-kick' | 'drum-red' | 'drum-yellow' | 'drum-blue' | 'drum-green' | 'drum-yellow-cymbal' | 'drum-blue-cymbal' | 'drum-green-cymbal' |
    'guitar-open' | 'guitar-green' | 'guitar-red' | 'guitar-yellow' | 'guitar-blue' | 'guitar-orange' |
    'bass-open' | 'bass-green' | 'bass-red' | 'bass-yellow' | 'bass-blue' | 'bass-orange' |
    'keys-open' | 'keys-green' | 'keys-red' | 'keys-yellow' | 'keys-blue' | 'keys-orange'): void {
    const currentTime = performance.now();

    // Guard against processing while transitions are being globally cleared
    const ltc = this.transitionEngine.getLightTransitionController();
    if (ltc && typeof (ltc as any).isClearing === 'function' && (ltc as any).isClearing()) {
      return;
    }
    
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
