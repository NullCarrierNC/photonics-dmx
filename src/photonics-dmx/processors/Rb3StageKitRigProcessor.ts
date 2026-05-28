/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Owns one rig's worth of RB3 StageKit render state and operations: the cached
 * `StageKitLightMapper` sized to that rig's light count, per-DMX-light colour-bank
 * blending state (`lightColorState`, `currentPassColors`, `colorToLights`,
 * `pendingUpdates`), the rig's active strobe effects + intervals, and every method that
 * issues `setState` / `blackout` against the rig's own `Sequencer`.
 *
 * The coordinator (`Rb3StageKitDirectProcessor`) holds a `Map<rigId, Rb3StageKitRigProcessor>`
 * and fans every gameplay event out to each rig instance, so secondary rigs render the
 * same StageKit data against their own light layout instead of seeing nothing.
 */
import { DmxLightManager } from '../controllers/DmxLightManager'
import { ILightingController } from '../controllers/sequencer/interfaces'
import { StageKitLightMapper } from './StageKitLightMapper'
import { StageKitConfig } from '../listeners/RB3/StageKitTypes'
import { getColor } from '../helpers/dmxHelpers'
import { Color, RGBIO, TrackedLight } from '../types'
import { createLogger } from '../../shared/logger'
const log = createLogger('Rb3StageKitRigProcessor')

type StrobeType = 'slow' | 'medium' | 'fast' | 'fastest'

interface ActiveStrobeEffect {
  type: StrobeType
  positions: number[]
  timestamp: number
  interval?: NodeJS.Timeout
  targetLights: TrackedLight[]
}

interface PendingUpdate {
  colors: Set<string>
  timeout: NodeJS.Timeout | null
}

const ACCUMULATION_DELAY_MS = 5

export class Rb3StageKitRigProcessor {
  public readonly rigId: string

  private readonly lightManager: DmxLightManager
  private readonly sequencer: ILightingController
  private readonly config: StageKitConfig

  private readonly lightMapper: StageKitLightMapper
  /** DMX light indices for every LED position, cached at construction. */
  private readonly dmxLightIndices: number[]

  // Per-light colour blending state. Keys are DMX light indices.
  private lightColorState = new Map<number, Set<string>>()
  private currentPassColors = new Map<number, Set<string>>()
  private colorToLights = new Map<string, Set<number>>()
  private pendingUpdates = new Map<number, PendingUpdate>()

  // Active strobe effects keyed by effect name (`stagekit-strobe-{rigId}-{type}-{ts}`).
  private activeStrobeEffects = new Map<string, ActiveStrobeEffect>()
  private strobedLights = new Set<number>()

  constructor(
    rigId: string,
    lightManager: DmxLightManager,
    sequencer: ILightingController,
    config: StageKitConfig,
  ) {
    this.rigId = rigId
    this.lightManager = lightManager
    this.sequencer = sequencer
    this.config = config

    const numLights = this.lightManager.getTotalDmxLightCount()
    if (numLights < 4) {
      throw new Error(
        `StageKit rig ${rigId} requires at least 4 DMX lights, but only ${numLights} are configured`,
      )
    }
    const dmxLightCount: 4 | 8 = numLights < 8 ? 4 : 8
    log.info(`Rig ${rigId}: ${numLights} lights → StageKit mode ${dmxLightCount}`)

    this.lightMapper = new StageKitLightMapper(dmxLightCount)
    const allPositions = Array.from({ length: dmxLightCount }, (_, i) => i)
    this.dmxLightIndices = this.lightMapper.mapLedPositionsToDmxLights(allPositions)

    for (const c of ['red', 'green', 'blue', 'yellow']) {
      this.colorToLights.set(c, new Set())
    }
  }

  // ── Public render API (called by the coordinator) ────────────────────────────────────

  public async applyLightData(positions: number[], color: string): Promise<void> {
    if (positions.length === 0) {
      // Empty positions means "no LEDs lit for this colour bank" — clear this colour
      // from every light it currently lives on.
      if (color !== 'off') {
        await this.clearColorFromAllLights(color)
      }
      return
    }
    const dmxLightIndices = this.lightMapper.mapLedPositionsToDmxLights(positions)
    await this.updateColorBank(color, dmxLightIndices)
  }

  public applyStrobeEffect(strobeType: StrobeType): void {
    const strobeLights = this.lightManager.getLights(['strobe'], 'all')
    const allLights = this.lightManager.getLights(['front', 'back'], 'all')

    if (!strobeLights || strobeLights.length === 0) {
      log.info(`Rig ${this.rigId}: no strobe lights configured`)
      return
    }
    if (!allLights) {
      log.info(`Rig ${this.rigId}: no front/back lights configured`)
      return
    }

    const targetLights: TrackedLight[] = []
    const dmxLightIndices: number[] = []
    for (const strobeLight of strobeLights) {
      const idx = allLights.findIndex((light) => light.id === strobeLight.id)
      if (idx !== -1) {
        targetLights.push(allLights[idx])
        dmxLightIndices.push(idx)
      } else {
        log.info(`Rig ${this.rigId}: strobe light ${strobeLight.id} not found in front/back set`)
      }
    }
    if (targetLights.length === 0) {
      log.info(`Rig ${this.rigId}: no matching front/back lights for strobe`)
      return
    }

    const white = getColor('white', 'max')
    let strobeInterval: number
    switch (strobeType) {
      case 'slow':
        strobeInterval = 200
        break
      case 'medium':
        strobeInterval = 100
        break
      case 'fast':
        strobeInterval = 50
        break
      case 'fastest':
        strobeInterval = 25
        break
      default:
        strobeInterval = 100
    }

    // Effect name carries the rigId so two rigs running the same strobe type at the same
    // time don't collide in the activeStrobeEffects map.
    const effectName = `stagekit-strobe-${this.rigId}-${strobeType}-${Date.now()}`
    this.activeStrobeEffects.set(effectName, {
      type: strobeType,
      positions: dmxLightIndices,
      timestamp: Date.now(),
      targetLights,
    })
    this.startStrobeEffect(effectName, targetLights, white, strobeInterval, dmxLightIndices)
  }

  public clearStrobeEffectsAtPositions(positions: number[]): void {
    const effectsToRemove: string[] = []
    if (positions.length === 0) {
      for (const [effectName] of this.activeStrobeEffects.entries()) {
        effectsToRemove.push(effectName)
      }
    } else {
      const targetDmxIndices = positions.map((pos) => this.dmxLightIndices[pos])
      for (const [effectName, effectData] of this.activeStrobeEffects.entries()) {
        const hasOverlap = effectData.positions.some((pos) => targetDmxIndices.includes(pos))
        if (hasOverlap) {
          log.info(`Rig ${this.rigId}: strobe effect ${effectName} affects target positions`)
          effectsToRemove.push(effectName)
        }
      }
    }
    for (const effectName of effectsToRemove) {
      const effectData = this.activeStrobeEffects.get(effectName)
      if (effectData && effectData.interval) {
        clearInterval(effectData.interval)
        if (effectData.targetLights) {
          const lightIndices = effectData.targetLights.map((_, index) => index)
          this.restoreColorsAfterStrobe(effectData.targetLights, lightIndices)
        }
      }
      this.activeStrobeEffects.delete(effectName)
    }
  }

  public async clearLightsAtPositions(positions: number[]): Promise<void> {
    if (positions.length === 0) return
    const targetDmxIndices = positions.map((pos) => this.dmxLightIndices[pos])
    for (const lightIndex of targetDmxIndices) {
      await this.turnOffLight(lightIndex)
    }
  }

  public async clearColorFromAllLights(color: string): Promise<void> {
    const lightsWithColor = this.colorToLights.get(color) || new Set()
    for (const lightIndex of lightsWithColor) {
      if (this.lightColorState.has(lightIndex)) {
        this.lightColorState.get(lightIndex)!.delete(color)
      }
      if (this.currentPassColors.has(lightIndex)) {
        this.currentPassColors.get(lightIndex)!.delete(color)
      }
      await this.triggerReblend(lightIndex)
    }
    this.colorToLights.set(color, new Set())
  }

  /** Clear every per-light state map, cancel pending updates, stop strobe intervals,
   *  and blackout the rig's sequencer. */
  public async turnOffAllLights(): Promise<void> {
    try {
      this.lightColorState.clear()
      this.currentPassColors.clear()
      for (const colorSet of this.colorToLights.values()) {
        colorSet.clear()
      }
      for (const pendingUpdate of this.pendingUpdates.values()) {
        if (pendingUpdate.timeout) {
          clearTimeout(pendingUpdate.timeout)
        }
      }
      this.pendingUpdates.clear()

      for (const [, effectData] of this.activeStrobeEffects.entries()) {
        if (effectData.interval) {
          clearInterval(effectData.interval)
          if (effectData.targetLights) {
            const lightIndices = effectData.targetLights.map((_, index) => index)
            this.restoreColorsAfterStrobe(effectData.targetLights, lightIndices)
          }
        }
      }
      this.activeStrobeEffects.clear()
      this.strobedLights.clear()
      log.info(`Rig ${this.rigId}: blacking out sequencer`)
      await this.sequencer.blackout(0)
    } catch (error) {
      log.error(`Rig ${this.rigId}: error turning off all lights:`, error)
    }
  }

  public async blackoutSequencer(): Promise<void> {
    await this.sequencer.blackout(0)
  }

  /** Cancel timers and intervals owned by this rig. Use when a rig is removed from the
   *  active set so we don't keep ticking against a torn-down sequencer. */
  public async dispose(): Promise<void> {
    for (const pendingUpdate of this.pendingUpdates.values()) {
      if (pendingUpdate.timeout) clearTimeout(pendingUpdate.timeout)
    }
    this.pendingUpdates.clear()
    for (const effectData of this.activeStrobeEffects.values()) {
      if (effectData.interval) clearInterval(effectData.interval)
    }
    this.activeStrobeEffects.clear()
    this.strobedLights.clear()
    this.lightColorState.clear()
    this.currentPassColors.clear()
    this.colorToLights.clear()
  }

  // ── Diagnostics ──────────────────────────────────────────────────────────────────────

  public getActiveLightSummary(): {
    activeLights: string[]
    activeStrobeEffects: string[]
    strobedLights: number[]
  } {
    const activeLights: string[] = []
    for (const [lightIndex, colors] of this.lightColorState.entries()) {
      if (colors.size > 0) {
        activeLights.push(
          `Rig ${this.rigId} Light ${lightIndex}: [${Array.from(colors).join(', ')}]`,
        )
      }
    }
    const activeStrobeEffects: string[] = []
    for (const [effectName, effectData] of this.activeStrobeEffects.entries()) {
      activeStrobeEffects.push(
        `${effectName}: ${effectData.type} strobe on positions [${effectData.positions.join(', ')}]`,
      )
    }
    return {
      activeLights,
      activeStrobeEffects,
      strobedLights: Array.from(this.strobedLights),
    }
  }

  public getConfig(): StageKitConfig {
    return this.config
  }

  /**
   * Public proxy to the rig's internal `blendColors` helper so the coordinator's
   * `getColorBlendingInfo` diagnostic can compute blends without reaching into private
   * state. The blend itself is rig-independent (a pure function of the colour set), so
   * any rig can compute it; the method lives here for proximity to the colour helpers.
   */
  public blendColorsPublic(colors: string[]): RGBIO {
    return this.blendColors(colors)
  }

  // ── Private helpers (per-light blending machinery) ───────────────────────────────────

  private startStrobeEffect(
    effectName: string,
    targetLights: TrackedLight[],
    color: RGBIO,
    interval: number,
    dmxLightIndices: number[],
  ): void {
    let isOn = false
    for (const lightIndex of dmxLightIndices) {
      this.strobedLights.add(lightIndex)
    }
    const strobeInterval = setInterval(() => {
      if (isOn) {
        this.restoreColorsAfterStrobe(targetLights, dmxLightIndices)
        isOn = false
      } else {
        this.sequencer.setState(targetLights, color, 0)
        isOn = true
      }
    }, interval)
    this.activeStrobeEffects.get(effectName)!.interval = strobeInterval
  }

  private async restoreColorsAfterStrobe(
    _targetLights: TrackedLight[],
    lightIndices: number[],
  ): Promise<void> {
    for (const lightIndex of lightIndices) {
      this.strobedLights.delete(lightIndex)
      await this.triggerReblend(lightIndex)
    }
  }

  private async updateColorBank(color: string, newLightIndices: number[]): Promise<void> {
    const currentLights = this.colorToLights.get(color) || new Set()
    for (const lightIndex of currentLights) {
      await this.removeColorFromLight(lightIndex, color)
    }
    this.colorToLights.set(color, new Set())
    for (const lightIndex of newLightIndices) {
      if (!this.currentPassColors.has(lightIndex)) {
        this.currentPassColors.set(lightIndex, new Set())
      }
    }
    for (const lightIndex of newLightIndices) {
      await this.addColorToLight(lightIndex, color)
      this.colorToLights.get(color)!.add(lightIndex)
    }
  }

  private async addColorToLight(lightIndex: number, color: string): Promise<void> {
    if (!this.lightColorState.has(lightIndex)) {
      this.lightColorState.set(lightIndex, new Set())
    }
    if (!this.currentPassColors.has(lightIndex)) {
      this.currentPassColors.set(lightIndex, new Set())
    }
    this.lightColorState.get(lightIndex)!.add(color)
    this.currentPassColors.get(lightIndex)!.add(color)

    const existingPending = this.pendingUpdates.get(lightIndex)
    if (existingPending) {
      if (existingPending.timeout) clearTimeout(existingPending.timeout)
      existingPending.colors.add(color)
    } else {
      this.pendingUpdates.set(lightIndex, { colors: new Set([color]), timeout: null })
    }
    const timeout = setTimeout(async () => {
      await this.applyAccumulatedColors(lightIndex)
      this.pendingUpdates.delete(lightIndex)
    }, ACCUMULATION_DELAY_MS)
    this.pendingUpdates.get(lightIndex)!.timeout = timeout
  }

  private async removeColorFromLight(lightIndex: number, color: string): Promise<void> {
    if (!this.lightColorState.has(lightIndex)) return
    this.lightColorState.get(lightIndex)!.delete(color)
    if (this.currentPassColors.has(lightIndex)) {
      this.currentPassColors.get(lightIndex)!.delete(color)
    }
    const existingPending = this.pendingUpdates.get(lightIndex)
    if (existingPending) {
      if (existingPending.timeout) clearTimeout(existingPending.timeout)
      existingPending.colors.delete(color)
    } else {
      const remainingColors = new Set(Array.from(this.lightColorState.get(lightIndex)!))
      this.pendingUpdates.set(lightIndex, { colors: remainingColors, timeout: null })
    }
    const timeout = setTimeout(async () => {
      await this.applyAccumulatedColors(lightIndex)
      this.pendingUpdates.delete(lightIndex)
    }, ACCUMULATION_DELAY_MS)
    this.pendingUpdates.get(lightIndex)!.timeout = timeout
  }

  private async applyColorToLight(lightIndex: number, color: any): Promise<void> {
    const lights = this.lightManager.getLights(['front', 'back'], 'all')
    if (lights && lights[lightIndex]) {
      await this.sequencer.setState([lights[lightIndex]], color, 1)
    }
  }

  private async turnOffLight(lightIndex: number): Promise<void> {
    const lights = this.lightManager.getLights(['front', 'back'], 'all')
    if (lights && lights[lightIndex]) {
      const blackColor = getColor('black', 'medium')
      await this.sequencer.setState([lights[lightIndex]], blackColor, 1)
    }
  }

  private async applyAccumulatedColors(lightIndex: number): Promise<void> {
    const pendingUpdate = this.pendingUpdates.get(lightIndex)
    if (!pendingUpdate) return
    const persistentColors = this.lightColorState.get(lightIndex) || new Set<string>()
    const currentPassColors = this.currentPassColors.get(lightIndex) || new Set<string>()
    if (currentPassColors.size > 0) {
      const colorsToBlend = Array.from(currentPassColors)
      const blendedColor = this.blendColors(colorsToBlend)
      await this.applyColorToLight(lightIndex, blendedColor)
    } else if (persistentColors.size > 0) {
      const colorsToBlend = Array.from(persistentColors)
      const blendedColor = this.blendColors(colorsToBlend)
      await this.applyColorToLight(lightIndex, blendedColor)
    } else {
      await this.turnOffLight(lightIndex)
      this.lightColorState.delete(lightIndex)
      this.currentPassColors.delete(lightIndex)
    }
  }

  private async triggerReblend(lightIndex: number): Promise<void> {
    const existingPending = this.pendingUpdates.get(lightIndex)
    if (existingPending) {
      if (existingPending.timeout) clearTimeout(existingPending.timeout)
      this.pendingUpdates.delete(lightIndex)
    }
    const persistentColors = this.lightColorState.get(lightIndex) || new Set<string>()
    const currentPassColors = this.currentPassColors.get(lightIndex) || new Set<string>()
    const colorsToBlend = Array.from(persistentColors).concat(Array.from(currentPassColors))
    const blendedColor = this.blendColors(colorsToBlend)
    await this.applyColorToLight(lightIndex, blendedColor)
  }

  private blendColors(colors: string[]): RGBIO {
    if (colors.length === 0 || colors.includes('off')) {
      return getColor('black', 'medium')
    }
    if (colors.length === 1) {
      return getColor(this.mapStageKitColor(colors[0]), 'medium')
    }
    const colorValues = colors.map((color) => getColor(this.mapStageKitColor(color), 'medium'))
    return this.addColors(colorValues)
  }

  private mapStageKitColor(color: string): Color {
    const normalized = color.toLowerCase()
    const colorMap: Record<string, Color> = {
      red: 'red',
      blue: 'blue',
      yellow: 'yellow',
      green: 'green',
      cyan: 'cyan',
      orange: 'orange',
      purple: 'purple',
      chartreuse: 'chartreuse',
      teal: 'teal',
      violet: 'violet',
      magenta: 'magenta',
      vermilion: 'vermilion',
      amber: 'amber',
      white: 'white',
      black: 'black',
    }
    return colorMap[normalized] ?? 'black'
  }

  private addColors(colors: any[]): any {
    if (colors.length === 0) return getColor('black', 'medium')
    if (colors.length === 1) return colors[0]
    const result = { ...colors[0] }
    for (let i = 1; i < colors.length; i++) {
      const color = colors[i]
      if (result.red !== undefined && color.red !== undefined) {
        result.red = Math.min(255, result.red + color.red)
      }
      if (result.green !== undefined && color.green !== undefined) {
        result.green = Math.min(255, result.green + color.green)
      }
      if (result.blue !== undefined && color.blue !== undefined) {
        result.blue = Math.min(255, result.blue + color.blue)
      }
      if (result.intensity !== undefined && color.intensity !== undefined) {
        result.intensity = Math.min(255, result.intensity + color.intensity)
      }
      result.rp = Math.min(result.rp || 255, color.rp || 255)
      result.gp = Math.min(result.gp || 255, color.gp || 255)
      result.bp = Math.min(result.bp || 255, color.bp || 255)
      result.ip = Math.min(result.ip || 255, color.ip || 255)
    }
    return result
  }
}
