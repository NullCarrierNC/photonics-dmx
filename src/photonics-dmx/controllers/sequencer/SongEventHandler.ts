import { performance } from 'perf_hooks'
import {
  ISongEventHandler,
  ILayerManager,
  ITransitionEngine,
  SongEventCondition,
} from './interfaces'
import { InstrumentNoteType, DrumNoteType } from '../../cues/types/cueTypes'
import { countHoldEvent, type PrepareTransition } from './waitUntil'

/**
 * @class EventHandler
 * @description Handles beat/measure/keyframe events by transitioning effects that
 * are waiting for the event to occur.
 */
export class SongEventHandler implements ISongEventHandler {
  private layerManager: ILayerManager
  private transitionEngine: ITransitionEngine

  /**
   * @constructor
   * @param layerManager The layer manager instance
   * @param transitionEngine The transition engine instance
   */
  constructor(layerManager: ILayerManager, transitionEngine: ITransitionEngine) {
    this.layerManager = layerManager
    this.transitionEngine = transitionEngine
  }

  /**
   * Trigger the beat event.
   */
  public onBeat(): void {
    this.handleEvent('beat')
  }

  /**
   * Trigger the measure event.
   */
  public onMeasure(): void {
    this.handleEvent('measure')
  }

  /**
   * Trigger a keyframe event.
   */
  public onKeyframe(): void {
    this.handleEvent('keyframe')
  }

  /**
   * Trigger a keyframe-first event (also fires generic keyframe for backward compatibility).
   */
  public onKeyframeFirst(): void {
    this.handleEvent('keyframe')
    this.handleEvent('keyframe-first')
  }

  /**
   * Trigger a keyframe-next event (also fires generic keyframe for backward compatibility).
   */
  public onKeyframeNext(): void {
    this.handleEvent('keyframe')
    this.handleEvent('keyframe-next')
  }

  /**
   * Trigger a keyframe-previous event (also fires generic keyframe for backward compatibility).
   */
  public onKeyframePrevious(): void {
    this.handleEvent('keyframe')
    this.handleEvent('keyframe-previous')
  }

  /**
   * Handle individual drum note events
   */
  public onDrumNote(noteType: DrumNoteType): void {
    switch (noteType) {
      case DrumNoteType.Kick:
        this.handleEvent('drum-kick')
        break
      case DrumNoteType.RedDrum:
        this.handleEvent('drum-red')
        break
      case DrumNoteType.YellowDrum:
        this.handleEvent('drum-yellow')
        break
      case DrumNoteType.BlueDrum:
        this.handleEvent('drum-blue')
        break
      case DrumNoteType.GreenDrum:
        this.handleEvent('drum-green')
        break
      case DrumNoteType.YellowCymbal:
        this.handleEvent('drum-yellow-cymbal')
        break
      case DrumNoteType.BlueCymbal:
        this.handleEvent('drum-blue-cymbal')
        break
      case DrumNoteType.GreenCymbal:
        this.handleEvent('drum-green-cymbal')
        break
    }
  }

  /**
   * Handle individual guitar note events
   */
  public onGuitarNote(noteType: InstrumentNoteType): void {
    switch (noteType) {
      case InstrumentNoteType.Open:
        this.handleEvent('guitar-open')
        break
      case InstrumentNoteType.Green:
        this.handleEvent('guitar-green')
        break
      case InstrumentNoteType.Red:
        this.handleEvent('guitar-red')
        break
      case InstrumentNoteType.Yellow:
        this.handleEvent('guitar-yellow')
        break
      case InstrumentNoteType.Blue:
        this.handleEvent('guitar-blue')
        break
      case InstrumentNoteType.Orange:
        this.handleEvent('guitar-orange')
        break
    }
  }

  /**
   * Handle individual bass note events
   */
  public onBassNote(noteType: InstrumentNoteType): void {
    switch (noteType) {
      case InstrumentNoteType.Open:
        this.handleEvent('bass-open')
        break
      case InstrumentNoteType.Green:
        this.handleEvent('bass-green')
        break
      case InstrumentNoteType.Red:
        this.handleEvent('bass-red')
        break
      case InstrumentNoteType.Yellow:
        this.handleEvent('bass-yellow')
        break
      case InstrumentNoteType.Blue:
        this.handleEvent('bass-blue')
        break
      case InstrumentNoteType.Orange:
        this.handleEvent('bass-orange')
        break
    }
  }

  /**
   * Handle a vocal note edge.
   * @param active true = note-on (singing started), false = note-off (singing stopped)
   */
  public onVocalNote(active: boolean): void {
    this.handleEvent(active ? 'vocal-note' : 'vocal-note-off')
  }

  /**
   * Handle individual keys note events
   */
  public onKeysNote(noteType: InstrumentNoteType): void {
    switch (noteType) {
      case InstrumentNoteType.Open:
        this.handleEvent('keys-open')
        break
      case InstrumentNoteType.Green:
        this.handleEvent('keys-green')
        break
      case InstrumentNoteType.Red:
        this.handleEvent('keys-red')
        break
      case InstrumentNoteType.Yellow:
        this.handleEvent('keys-yellow')
        break
      case InstrumentNoteType.Blue:
        this.handleEvent('keys-blue')
        break
      case InstrumentNoteType.Orange:
        this.handleEvent('keys-orange')
        break
    }
  }

  /**
   * Handles external events to progress effects.
   *
   * @param eventType The type of event
   */
  public handleEvent(eventType: SongEventCondition): void {
    const currentTime = performance.now()

    // Guard against processing while transitions are being globally cleared
    const ltc = this.transitionEngine.getLightTransitionController()
    if ('isClearing' in ltc && typeof ltc.isClearing === 'function' && ltc.isClearing()) {
      return
    }

    // Set when this event takes an effect out of its wait, meaning an uncounted match or a
    // counted match whose count reached zero. A match that only decrements a count leaves every
    // effect where it was. Starting or advancing a transition can run a synchronous chain of
    // zero-duration transitions that carries the effect past its last one, so the reap scan below
    // decides what actually finished rather than each landing site here.
    let released = false

    const publishedFrames = ltc.getPublishedFrameCount()
    const prepare: PrepareTransition = (effect, next, time) =>
      this.transitionEngine.prepareTransition(effect, next, time)

    // One event starts a transition or ends its hold, never both, so a hold on the event it
    // waited for lasts until the next one.
    this.layerManager.getActiveEffects().forEach((layerMap, _layer) => {
      layerMap.forEach((activeEffect, _lightId) => {
        const currentTransition = activeEffect.transitions[activeEffect.currentTransitionIndex]
        if (!currentTransition) return

        if (
          activeEffect.state === 'waitingFor' &&
          currentTransition.waitForCondition === eventType
        ) {
          // A positive count starts the transition on the occurrence that brings it to zero or
          // below, so 2.5 waits three. An uncounted, zero or negative one starts on the first.
          const count = currentTransition.waitForConditionCount
          if (count !== undefined && count > 0) {
            currentTransition.waitForConditionCount = count - 1
            if (count - 1 > 0) return
          }
          this.transitionEngine.startTransition(activeEffect, currentTransition, currentTime)
          released = true
        } else if (
          activeEffect.state === 'waitingUntil' &&
          currentTransition.waitUntilCondition === eventType
        ) {
          if (
            countHoldEvent(activeEffect, currentTransition, currentTime, publishedFrames, prepare)
          ) {
            released = true
          }
        }
      })
    })

    if (released) {
      this.transitionEngine.reapCompletedEffects()
    }
  }
}
