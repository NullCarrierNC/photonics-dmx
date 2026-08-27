import { performance } from 'perf_hooks'
import { Effect, EffectTransition } from '../../types'

/**
 * Tracks the lifecycle of a persistent effect that should restart only after
 * all participating lights complete their transitions.
 */
export type PersistentEffectRun = {
  id: string
  name: string
  effect: Effect
  transitionsByLayerAndLight: Map<number, Map<string, EffectTransition[]>>
  totalLights: number
  remainingLights: number
}

/**
 * Active effect-level persistence runs, keyed by run id.
 *
 * A run holds the transitions needed to re-apply the effect once every light it targets has
 * finished, and counts those lights down. Cancelling a run is how a restart is suppressed: the
 * caller drops the id and the countdown that reaches zero finds nothing to restart.
 */
export class PersistentRunRegistry {
  private runs: Map<string, PersistentEffectRun> = new Map()

  /**
   * Stores the transitions required to re-run a persistent effect once every
   * light completes. Returns the run identifier assigned to this effect.
   */
  public register(
    name: string,
    effect: Effect,
    transitionsByLayerAndLight: Map<number, Map<string, EffectTransition[]>>,
  ): string | undefined {
    let totalLights = 0
    const storedMap = new Map<number, Map<string, EffectTransition[]>>()

    transitionsByLayerAndLight.forEach((layerMap, layer) => {
      const clonedLayerMap = new Map<string, EffectTransition[]>()
      layerMap.forEach((transitionList, lightId) => {
        clonedLayerMap.set(lightId, transitionList)
        totalLights += 1
      })
      storedMap.set(layer, clonedLayerMap)
    })

    if (totalLights === 0) {
      return undefined
    }

    const runId = `${name}-${performance.now()}-${Math.floor(Math.random() * 1000000)}`
    this.runs.set(runId, {
      id: runId,
      name,
      effect,
      transitionsByLayerAndLight: storedMap,
      totalLights,
      remainingLights: totalLights,
    })
    return runId
  }

  public get(runId: string): PersistentEffectRun | undefined {
    return this.runs.get(runId)
  }

  public has(runId: string): boolean {
    return this.runs.has(runId)
  }

  /** Cancels the run so it no longer schedules restarts. */
  public cancel(runId?: string): void {
    if (!runId) return
    this.runs.delete(runId)
  }

  public clear(): void {
    this.runs.clear()
  }
}
