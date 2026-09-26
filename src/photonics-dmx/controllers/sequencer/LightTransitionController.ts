import { RGBIO, Transition } from '../../types'
import { blendWithOpacity, opaqueBlack, transparentColor } from './lightBlending'
import { copyAims, drawsColour, dropAims, restoreLayers } from './positionLayers'
import {
  cleanupOrphanedTransitions,
  emergencyStateReset,
  validateAllStates,
} from './transitionHealth'
import { stepTransition } from './transitionStep'
import { LightStateManager } from './LightStateManager'
import type { FrameContext } from './interfaces'
import { createLogger } from '../../../shared/logger'
const log = createLogger('LightTransitionController')

/**
 * Holds data for each layer's transition on a specific light.
 */
export type TransitionData = {
  layer: number
  startState: RGBIO
  endState: RGBIO
  startTime: number
  transition: Transition // transform info, etc.
}

/**
 * The LightTransitionController handles the effect layering and
 * transitions. Each animation cycle it interpolates
 * per-layer colours, merges them, and sets the compiled colour state
 * in the Light State Manager.
 */
export class LightTransitionController {
  private _lightStateManager: LightStateManager

  /**
   * Stores ongoing transitions for each (lightId, layer).
   */
  private _transitionsByLight: Map<string, Map<number, TransitionData>>

  /**
   * Tracks the per-layer interpolated colour for each light.
   */
  private _currentLayerStates: Map<string, Map<number, RGBIO>>
  /**
   * The colour each light showed when a set replaced the look, held until the next frame. The new
   * look's transitions start from it (see {@link getLightState}), and a light the new look has not
   * drawn by the end of that frame goes dark then.
   */
  private _heldLook = new Map<string, RGBIO>()
  /** Whether every published colour is forced dark. See {@link setOcclusionHeld}. */
  private _occlusionHeld: boolean = false

  /**
   * Guards against state mutations while a global clear is running.
   */
  private _clearingTransitions = false
  /**
   * Whether the current fault episode has already been reported.
   *
   * Keyed on nothing, because the catch wraps the whole frame body and has no per-light value in
   * scope, so this is the boolean form Clock's overrun watchdog uses rather than the per-entity
   * sets the publisher keeps.
   */
  private _faultReported = false
  /** How many frames have published. See {@link getPublishedFrameCount}. */
  private _publishedFrames = 0

  // Monitoring fields
  private lastStateValidation: number = 0
  private readonly VALIDATION_INTERVAL = 3000

  constructor(lightStateManager: LightStateManager) {
    this._lightStateManager = lightStateManager
    this._transitionsByLight = new Map()
    this._currentLayerStates = new Map()
    this._clearingTransitions = false
  }

  public advanceFrame(frame: FrameContext): void {
    this.updateTransitions(frame)
  }

  /**
   * Sets a transition for a specific light and layer
   * @param lightId The ID of the light
   * @param layer The layer number
   * @param startState The start state of the transition (or undefined to use current state)
   * @param endState The end state of the transition
   * @param duration The duration of the transition in milliseconds
   * @param easing The easing function to use
   * @param initialState Optional override for the start state (useful for continuing from last state)
   */
  public setTransition(
    lightId: string,
    layer: number,
    startState: RGBIO | undefined,
    endState: RGBIO,
    duration: number,
    easing: string,
    initialState?: RGBIO,
  ): void {
    // CRITICAL: Reject new transitions if we're in the middle of clearing
    // This prevents race conditions where events trigger new transitions during cleanup
    if (this._clearingTransitions) {
      log.warn(
        `[LTC] Rejected setTransition for light ${lightId} layer ${layer} - clearing in progress`,
      )
      return
    }

    // Initialize our map for this light if it doesn't exist
    if (!this._transitionsByLight.has(lightId)) {
      this._transitionsByLight.set(lightId, new Map<number, TransitionData>())
    }

    // Get the current light state if startState is undefined
    let effectiveStartState: RGBIO
    if (initialState) {
      // If we have an initial state override, use that
      effectiveStartState = { ...initialState }
    } else if (startState) {
      // If we have a specified start state, use that
      effectiveStartState = { ...startState }
    } else {
      // Otherwise use current state if available, or default to black
      const currentState = this._currentLayerStates.get(lightId)?.get(layer)
      if (currentState) {
        effectiveStartState = { ...currentState }
      } else {
        effectiveStartState = transparentColor()
      }
    }
    // A move to a transparent colour, such as a position change, draws no colour. On a layer with
    // nothing of its own it starts transparent too, keeping only the pan and tilt, so it never
    // paints the look held over a set on top of what the new cue draws below it.
    if (
      endState.opacity === 0 &&
      this._heldLook.has(lightId) &&
      !this._currentLayerStates.get(lightId)?.has(layer)
    ) {
      effectiveStartState.opacity = 0
    }

    // Prepare transition data
    const data: TransitionData = {
      layer,
      startState: effectiveStartState,
      endState: { ...endState },
      startTime: performance.now(),
      transition: {
        transform: {
          color: endState,
          duration,
          easing: easing,
        },
        layer: layer,
      },
    }

    // Set the transition, overwriting any existing one for this light and layer
    this._transitionsByLight.get(lightId)!.set(layer, data)

    // Update current layer state immediately to the start state
    if (!this._currentLayerStates.has(lightId)) {
      this._currentLayerStates.set(lightId, new Map<number, RGBIO>())
    }
    this._currentLayerStates.get(lightId)!.set(layer, { ...effectiveStartState })
  }

  /**
   * Removes all transitions for the specified layer from all lights.
   * This stops any animations on that layer.
   */
  public removeTransitionsByLayer(layer: number): void {
    this._transitionsByLight.forEach((layerMap) => {
      layerMap.delete(layer)
    })
    // Also remove from _currentLayerStates so getLightState
    // won't return stale data
    this._currentLayerStates.forEach((layerMap) => {
      layerMap.delete(layer)
    })
  }

  /**
   * Clears every transition. By default every light goes black and is published at once. With
   * `holdLook`, the lights keep showing the previous look until the next frame, which the look that
   * replaces it draws over, so a cue change never passes through black. A set replaces the look and
   * not the aim, so `holdLook` keeps position-only layers and the moves heading to one.
   */
  public clearAllTransitions(holdLook = false): void {
    // Set the clearing flag to prevent new transitions from being added
    this._clearingTransitions = true

    try {
      // Get all light IDs before clearing (union of all known sources)
      const idSet = new Set<string>()
      // From LightStateManager (externally tracked)
      this._lightStateManager.getTrackedLightIds().forEach((id) => idSet.add(id))
      // From transitions controller internal maps
      this._transitionsByLight.forEach((_v, id) => idSet.add(id))
      this._currentLayerStates.forEach((_v, id) => idSet.add(id))
      const allLightIds = Array.from(idSet)
      const aims = holdLook ? copyAims(this._currentLayerStates, this._transitionsByLight) : null

      // Clear all transitions
      this._transitionsByLight.clear()
      this._currentLayerStates.clear()
      this._heldLook.clear()

      if (aims) {
        restoreLayers(this._currentLayerStates, aims.states)
        restoreLayers(this._transitionsByLight, aims.transitions)
        for (const lightId of allLightIds) {
          const showing = this._lightStateManager.getLightState(lightId)
          if (showing) {
            // Colour only, so a new colour layer never carries the old aim over a position layer.
            const { pan: _pan, tilt: _tilt, ...color } = showing
            this._heldLook.set(lightId, color)
          }
        }
        return
      }

      // Reset all lights to black
      const blackState = opaqueBlack()

      allLightIds.forEach((lightId) => {
        this._lightStateManager.setLightState(lightId, blackState)
      })

      this._currentLayerStates.clear()

      // Publish the black states immediately
      this._lightStateManager.publishLightStates()
    } finally {
      // Released here rather than by the caller, so the callbacks removeAllEffects cancels next
      // can submit the cue that follows.
      this._clearingTransitions = false
    }
  }

  /**
   * Removes a specific layer from the given light.
   * Immediately recalculates and publishes the new color state.
   */
  public removeLightLayer(lightId: string, layer: number): void {
    const layerMap = this._transitionsByLight.get(lightId)
    if (layerMap) {
      layerMap.delete(layer)

      // If this was the last layer for this light, clean up the map entry
      if (layerMap.size === 0) {
        this._transitionsByLight.delete(lightId)
      }
    }

    const currentLayerMap = this._currentLayerStates.get(lightId)
    if (currentLayerMap) {
      currentLayerMap.delete(layer)

      // If no layers remain, clean up the map entry
      if (currentLayerMap.size === 0) {
        this._currentLayerStates.delete(lightId)
      }
    }

    // Force immediate recalculation and publication of the final color
    // This ensures the light updates immediately rather than waiting for the next update cycle
    this.blendAndSetFinalColor(lightId)
    //  this._lightStateManager.publishLightStates();
  }

  /**
   * Strips pan/tilt from every layer state so merged output omits them and DmxPublisher
   * can fall back to fixture panHome/tiltHome. A layer that only aims goes altogether, with any
   * move heading to one. Invoked on the frame after motion cues stop.
   */
  public clearPanTilt(): void {
    dropAims(this._currentLayerStates, this._transitionsByLight)
    for (const [lightId, layerMap] of this._currentLayerStates) {
      for (const [layer, state] of layerMap) {
        const next: RGBIO = { ...state }
        delete next.pan
        delete next.tilt
        layerMap.set(layer, next)
      }
      this.blendAndSetFinalColor(lightId)
    }
  }

  /**
   * Writes pan/tilt (and transparent RGB) for a layer without a transition.
   * Used by {@link MotionPatternEngine} so parametric motion participates in layer blending.
   */
  public setGeneratorLayerState(lightId: string, layer: number, state: RGBIO): void {
    if (this._clearingTransitions) {
      return
    }
    if (!this._currentLayerStates.has(lightId)) {
      this._currentLayerStates.set(lightId, new Map())
    }
    this._currentLayerStates.get(lightId)!.set(layer, { ...state })
  }

  /**
   * Removes generator-driven layer state and republishes merged output.
   */
  public removeGeneratorLayer(lightId: string, layer: number): void {
    const currentLayerMap = this._currentLayerStates.get(lightId)
    if (!currentLayerMap) {
      return
    }
    currentLayerMap.delete(layer)
    if (currentLayerMap.size === 0) {
      this._currentLayerStates.delete(lightId)
    }
    this.blendAndSetFinalColor(lightId)
    this._lightStateManager.publishLightStates()
  }

  /**
   * Returns the last interpolated color for the specified (light, layer). A light with nothing on
   * that layer gives the held look after a set replaced it, until the new look draws a colour on
   * it, and transparent otherwise. With `useHeldLook` false an empty layer is always transparent,
   * for a transition that starts after the held frame has gone.
   */
  public getLightState(lightId: string, layer: number, useHeldLook = true): RGBIO {
    const c = this._currentLayerStates.get(lightId)?.get(layer)
    if (c) {
      return c
    }
    const layers = this._currentLayerStates.get(lightId)
    const held = useHeldLook && !drawsColour(layers) ? this._heldLook.get(lightId) : undefined
    return held ? { ...held } : transparentColor()
  }

  /**
   * Retrieves all unique light IDs that have transitions.
   */
  public getAllLightIds(): string[] {
    return Array.from(this._transitionsByLight.keys())
  }

  /**
   * Clears all transitions and merges, immediately forcing black states.
   */
  public immediateBlackout(): void {
    this._transitionsByLight.clear()
    this._currentLayerStates.clear()
    this._heldLook.clear()

    // Immediately push black to all known lights
    const allLightIds = this._lightStateManager.getTrackedLightIds()
    allLightIds.forEach((lightId) => {
      // Get the current state to check if it has pan/tilt values
      const currentState = this._lightStateManager.getLightState(lightId)

      // A per-light black, since the pan/tilt below is written onto it.
      const blackState = transparentColor()

      // Check if this fixture has pan/tilt
      if (currentState && (currentState.pan !== undefined || currentState.tilt !== undefined)) {
        // This fixture uses pan/tilt channels - preserve current values
        if (currentState.pan !== undefined) {
          blackState.pan = currentState.pan
        }

        if (currentState.tilt !== undefined) {
          blackState.tilt = currentState.tilt
        }
      }

      this._lightStateManager.setLightState(lightId, blackState)
    })
    this._lightStateManager.publishLightStates()
  }

  /**
   * Indicates whether a global transition clear is currently in progress
   */
  public isClearing(): boolean {
    return this._clearingTransitions
  }

  /**
   * Begin the clearing sequence by setting the clearing lock.
   * This prevents new transitions from being added during the clearing process.
   * Must be paired with endClearingSequence() in a finally block.
   */
  public beginClearingSequence(): void {
    this._clearingTransitions = true
  }

  /**
   * End the clearing sequence by releasing the clearing lock.
   * This allows new transitions to be added again.
   */
  public endClearingSequence(): void {
    this._clearingTransitions = false
  }

  /**
   * Processes a single animation frame using the provided timing context.
   */
  private updateTransitions(frame?: FrameContext): void {
    // Skip processing if a global clear is in progress
    if (this._clearingTransitions) {
      return
    }

    try {
      const now = frame?.frameStartTime ?? performance.now()

      // Periodic state validation and cleanup
      if (now - this.lastStateValidation > this.VALIDATION_INTERVAL) {
        validateAllStates(this._currentLayerStates, this._lightStateManager)
        cleanupOrphanedTransitions(this._transitionsByLight, this._lightStateManager, now)
        this.lastStateValidation = now
      }

      // Phase 1: Calculate interpolated states for ALL lights on ALL layers
      // All calculations use the SAME 'now' timestamp
      const allLayerStates = new Map<string, Map<number, RGBIO>>()
      const layersToRemove: Array<{ lightId: string; layer: number }> = []

      this._transitionsByLight.forEach((layerTransitions, lightId) => {
        const layerStates = new Map<number, RGBIO>()
        const layersToRemoveForLight = new Set<number>()

        layerTransitions.forEach((transitionData, layer) => {
          const { state, complete } = stepTransition(transitionData, now)
          layerStates.set(layer, state)
          if (complete) {
            layersToRemoveForLight.add(layer)
          }
        })

        // Store the interpolated layer states for this light
        if (layerStates.size > 0) {
          allLayerStates.set(lightId, layerStates)
        }

        // Collect layers to remove
        for (const layer of layersToRemoveForLight) {
          layersToRemove.push({ lightId, layer })
        }
      })

      // Phase 2: Update internal state structures
      allLayerStates.forEach((layerStates, lightId) => {
        if (!this._currentLayerStates.has(lightId)) {
          this._currentLayerStates.set(lightId, new Map<number, RGBIO>())
        }
        const currentStates = this._currentLayerStates.get(lightId)!
        layerStates.forEach((state, layer) => {
          currentStates.set(layer, state)
        })
      })

      // Phase 3: Blend ALL layers for ALL lights that have ANY layer state
      // Use _currentLayerStates instead of allLayerStates to include waiting transitions
      this._currentLayerStates.forEach((layerStates, lightId) => {
        this.blendAndSetFinalColor(lightId, layerStates)
      })
      for (const lightId of this._heldLook.keys()) {
        if (!this._currentLayerStates.has(lightId)) {
          this._lightStateManager.setLightState(lightId, opaqueBlack())
        }
      }
      this._heldLook.clear()

      // Phase 4: Clean up completed transitions
      layersToRemove.forEach(({ lightId, layer }) => {
        const layerTransitions = this._transitionsByLight.get(lightId)
        if (layerTransitions) {
          layerTransitions.delete(layer)
          if (layerTransitions.size === 0) {
            this._transitionsByLight.delete(lightId)
          }
        }
      })
      // A frame that got all the way through means the fault is over, so the next one reports.
      this._faultReported = false
    } catch (error) {
      // Once per fault episode. The catch runs every frame, and the file log has a daily byte cap
      // to spend, so a sustained fault gets one line rather than a hundred a second. Clock latches
      // a faulting tick callback the same way.
      if (!this._faultReported) {
        this._faultReported = true
        log.error('Critical error in transition processing:', error)
      }
      emergencyStateReset(
        this._lightStateManager,
        this._transitionsByLight,
        this._currentLayerStates,
      )
    }

    // Phase 5: Publish all buffered light state updates atomically
    this._lightStateManager.publishLightStates()
    this._publishedFrames += 1
  }

  /**
   * How many frames have published. A transition held until a beat or measure records this, so
   * one arriving in the frame the transition began in leaves the hold in place.
   */
  public getPublishedFrameCount(): number {
    return this._publishedFrames
  }

  /**
   * Blends a light's layers lowest first and sets the merged colour on the light state manager. A
   * light with no layers goes hard black.
   *
   * @param lightId The ID of the light
   * @param layerStates The light's layer states, defaulting to the ones held for it.
   */
  private blendAndSetFinalColor(lightId: string, layerStates?: Map<number, RGBIO>): void {
    const states = layerStates ?? this._currentLayerStates.get(lightId)
    if (!states || states.size === 0) {
      this._lightStateManager.setLightState(lightId, opaqueBlack())
      return
    }

    let finalColor: RGBIO = transparentColor()

    // Convert Map to array, sort by layer number, then blend
    const sortedLayers = Array.from(states.entries()).sort(([layerA], [layerB]) => layerA - layerB)

    for (const [_, layerColor] of sortedLayers) {
      finalColor = blendWithOpacity(finalColor, layerColor)
    }

    // Update the light state manager (will be batched).
    this._lightStateManager.setLightState(lightId, this.applyOcclusion(finalColor))
  }

  /**
   * Shuts down the LTC, stopping intervals and clearing data.
   */
  public shutdown(): void {
    this._transitionsByLight.clear()
    this._currentLayerStates.clear()
    this._heldLook.clear()
    log.info('LightTransitionController has been shut down.')
  }

  /** The light's colour with every layer blended, or null for a light the manager does not track. */
  public getFinalLightState(lightId: string): RGBIO | null {
    return this._lightStateManager.getLightState(lightId)
  }

  /** Every light id the LightStateManager holds a colour for. */
  public getLightStateManagerTrackedLights(): string[] {
    return this._lightStateManager.getTrackedLightIds()
  }

  /**
   * Force a blended colour dark while an occlusion is held, keeping pan/tilt so moving heads hold
   * their aim behind it.
   *
   * Applied here, at the one point every published colour passes through, rather than as a
   * top-layer transition: `clearAllTransitions` (which `setEffect` reaches through
   * `removeAllEffects`) and the blackout paths empty the transition map wholesale, so an overlay
   * expressed as a transition would be dropped by the next cue that submits.
   */
  private applyOcclusion(color: RGBIO): RGBIO {
    if (!this._occlusionHeld) {
      return color
    }
    const occluded: RGBIO = { ...color, red: 0, green: 0, blue: 0, intensity: 0, opacity: 1.0 }
    return occluded
  }

  /**
   * Hold or release the occlusion, recomputing every tracked light so it takes effect now rather
   * than whenever each light next happens to be recalculated.
   */
  public setOcclusionHeld(on: boolean): void {
    if (this._occlusionHeld === on) {
      return
    }
    this._occlusionHeld = on
    for (const lightId of this._lightStateManager.getTrackedLightIds()) {
      this.blendAndSetFinalColor(lightId)
    }
    this._lightStateManager.publishLightStates()
  }

  /** Whether the occlusion is currently held. */
  public isOcclusionHeld(): boolean {
    return this._occlusionHeld
  }
}
