/**
 * Layers that aim a moving head and draw no colour, as a set-position move leaves behind. A set
 * that replaces the look keeps them, and the pan/tilt clear after a motion cue drops them.
 */
import type { RGBIO } from '../../types'
import { isPositionOnly } from './lightBlending'
import type { TransitionData } from './LightTransitionController'

type ByLight<T> = Map<string, Map<number, T>>

const aimsWith = (data: TransitionData): boolean => isPositionOnly(data.endState)

function filterLayers<T>(byLight: ByLight<T>, keep: (entry: T) => boolean): ByLight<T> {
  const kept: ByLight<T> = new Map()
  for (const [lightId, layers] of byLight) {
    for (const [layer, entry] of layers) {
      if (!keep(entry)) continue
      if (!kept.has(lightId)) kept.set(lightId, new Map())
      kept.get(lightId)!.set(layer, entry)
    }
  }
  return kept
}

/** The layers that only aim and the moves heading to one, copied out of the controller's maps. */
export function copyAims(
  states: ByLight<RGBIO>,
  transitions: ByLight<TransitionData>,
): { states: ByLight<RGBIO>; transitions: ByLight<TransitionData> } {
  return {
    states: filterLayers(states, isPositionOnly),
    transitions: filterLayers(transitions, aimsWith),
  }
}

/** Whether any of a light's layers draws a colour, rather than only aiming it. */
export function drawsColour(layers: Map<number, RGBIO> | undefined): boolean {
  for (const state of layers?.values() ?? []) {
    if (!isPositionOnly(state)) return true
  }
  return false
}

/** Puts copied layers back into maps that were cleared. */
export function restoreLayers<T>(into: ByLight<T>, from: ByLight<T>): void {
  from.forEach((layers, lightId) => into.set(lightId, layers))
}

/** Deletes the layers that only aim and the moves heading to one, leaving each light's entry. */
export function dropAims(states: ByLight<RGBIO>, transitions: ByLight<TransitionData>): void {
  for (const layers of transitions.values()) {
    for (const [layer, data] of layers) {
      if (aimsWith(data)) layers.delete(layer)
    }
  }
  for (const layers of states.values()) {
    for (const [layer, state] of layers) {
      if (isPositionOnly(state)) layers.delete(layer)
    }
  }
}
