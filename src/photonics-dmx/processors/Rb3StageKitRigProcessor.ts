/**
 * Owns one rig's worth of RB3 StageKit render state and operations: the cached
 * `StageKitLightMapper` sized to that rig's light count, per-DMX-light colour-bank
 * blending state (`lightColorState`, `colorToLights`, `pendingUpdates`), the rig's active strobe
 * effects + intervals, and every method that issues `setState` / `blackout` against the rig's own
 * `Sequencer`.
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
import { monotonicNowMs } from '../../shared/time'
const log = createLogger('Rb3StageKitRigProcessor')

type StrobeType = 'slow' | 'medium' | 'fast' | 'fastest'

interface ActiveStrobeEffect {
  type: StrobeType
  positions: number[]
  /** Cancels the run's timers. */
  stop?: () => void
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

  // Per-light colour blending state. Keys are DMX light indices.
  private lightColorState = new Map<number, Set<string>>()
  private colorToLights = new Map<string, Set<number>>()
  private pendingUpdates = new Map<number, PendingUpdate>()

  // Active strobe effects keyed by effect name (`stagekit-strobe-{rigId}-{type}`).
  private activeStrobeEffects = new Map<string, ActiveStrobeEffect>()
  private strobedLights = new Set<number>()

  /**
   * @param getOutputRateHz The DMX output rate, read at each strobe start. 0 or less when nothing
   *   governs the wire.
   */
  constructor(
    rigId: string,
    lightManager: DmxLightManager,
    sequencer: ILightingController,
    config: StageKitConfig,
    private readonly getOutputRateHz: () => number = () => 0,
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

    for (const c of ['red', 'green', 'blue', 'yellow']) {
      this.colorToLights.set(c, new Set())
    }
  }

  // ── Public render API (called by the coordinator) ────────────────────────────────────

  public applyLightData(positions: number[], color: string): void {
    if (positions.length === 0) {
      // Empty positions means "no LEDs lit for this colour bank" — clear this colour
      // from every light it currently lives on.
      if (color !== 'off') {
        this.clearColorFromAllLights(color)
      }
      return
    }
    const dmxLightIndices = this.lightMapper.mapLedPositionsToDmxLights(positions)
    this.updateColorBank(color, dmxLightIndices)
  }

  /**
   * Strobe the rig's strobe lights. `startedAt` (monotonic ms) is when the strobe began, which sets
   * the flash phase, so a rig that joins a running strobe flashes with the rigs already on it.
   */
  public applyStrobeEffect(strobeType: StrobeType, startedAt = monotonicNowMs()): void {
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
    let nominalInterval: number
    switch (strobeType) {
      case 'slow':
        nominalInterval = 200
        break
      case 'medium':
        nominalInterval = 100
        break
      case 'fast':
        nominalInterval = 50
        break
      case 'fastest':
        nominalInterval = 25
        break
      default:
        nominalInterval = 100
    }

    // Each half of a flash needs a frame to start in and a frame to be shown in, and two wire
    // sends to reach the fixture. Asked to go faster than that, the frames or the sends sample the
    // same half and the lights hold it, so the run slows to what the frame and the wire can show.
    const outputRateHz = this.getOutputRateHz()
    const sendIntervalMs = outputRateHz > 0 ? 1000 / outputRateHz : 0
    const strobeInterval = Math.max(
      nominalInterval,
      this.sequencer.getFrameIntervalMs() * 2,
      sendIntervalMs * 2,
    )
    if (strobeInterval !== nominalInterval) {
      log.info(
        `Rig ${this.rigId}: ${strobeType} strobe runs at ${strobeInterval}ms, the fastest this clock and output rate show`,
      )
    }

    // The name carries the rigId so two rigs running the same strobe type don't collide, and
    // nothing else, so a repeated packet addresses the run already going rather than starting a
    // second one alongside it.
    const effectName = this.strobeEffectName(strobeType)
    if (this.activeStrobeEffects.has(effectName)) {
      return
    }
    // A rig strobes at one rate, so a new type replaces whatever is running.
    for (const running of [...this.activeStrobeEffects.keys()]) {
      this.stopStrobeEffect(running)
    }
    this.activeStrobeEffects.set(effectName, {
      type: strobeType,
      positions: dmxLightIndices,
      targetLights,
    })
    this.startStrobeEffect(
      effectName,
      targetLights,
      white,
      strobeInterval,
      dmxLightIndices,
      startedAt,
    )
  }

  /** The one name a given strobe type runs under on this rig. */
  private strobeEffectName(strobeType: StrobeType): string {
    return `stagekit-strobe-${this.rigId}-${strobeType}`
  }

  /** Cancel one strobe run and hand its lights back to the blender. */
  private stopStrobeEffect(effectName: string): void {
    const effectData = this.activeStrobeEffects.get(effectName)
    this.activeStrobeEffects.delete(effectName)
    if (!effectData?.stop) {
      return
    }
    effectData.stop()
    if (effectData.targetLights) {
      // restoreColorsAfterStrobe keys strobedLights and the reblend by DMX light index, so
      // pass the stored DMX indices (effectData.positions).
      try {
        this.restoreColorsAfterStrobe(effectData.targetLights, effectData.positions)
      } catch (err) {
        log.error(`Rig ${this.rigId}: failed to reblend after a strobe:`, err)
      }
    }
  }

  public clearStrobeEffectsAtPositions(positions: number[]): void {
    const effectsToRemove: string[] = []
    if (positions.length === 0) {
      for (const [effectName] of this.activeStrobeEffects.entries()) {
        effectsToRemove.push(effectName)
      }
    } else {
      const targetDmxIndices = this.lightMapper.mapLedPositionsToDmxLights(positions)
      for (const [effectName, effectData] of this.activeStrobeEffects.entries()) {
        const hasOverlap = effectData.positions.some((pos) => targetDmxIndices.includes(pos))
        if (hasOverlap) {
          log.info(`Rig ${this.rigId}: strobe effect ${effectName} affects target positions`)
          effectsToRemove.push(effectName)
        }
      }
    }
    for (const effectName of effectsToRemove) {
      this.stopStrobeEffect(effectName)
    }
  }

  public clearColorFromAllLights(color: string): void {
    const lightsWithColor = this.colorToLights.get(color) || new Set()
    for (const lightIndex of lightsWithColor) {
      if (this.lightColorState.has(lightIndex)) {
        this.lightColorState.get(lightIndex)!.delete(color)
      }
      this.triggerReblend(lightIndex)
    }
    this.colorToLights.set(color, new Set())
  }

  /** Clear every per-light state map, cancel pending updates, stop strobe intervals,
   *  and blackout the rig's sequencer. */
  public async turnOffAllLights(): Promise<void> {
    try {
      this.lightColorState.clear()
      for (const colorSet of this.colorToLights.values()) {
        colorSet.clear()
      }
      for (const pendingUpdate of this.pendingUpdates.values()) {
        if (pendingUpdate.timeout) {
          clearTimeout(pendingUpdate.timeout)
        }
      }
      this.pendingUpdates.clear()

      for (const effectName of [...this.activeStrobeEffects.keys()]) {
        this.stopStrobeEffect(effectName)
      }
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
  public dispose(): void {
    for (const pendingUpdate of this.pendingUpdates.values()) {
      if (pendingUpdate.timeout) clearTimeout(pendingUpdate.timeout)
    }
    this.pendingUpdates.clear()
    for (const effectData of this.activeStrobeEffects.values()) {
      effectData.stop?.()
    }
    this.activeStrobeEffects.clear()
    this.strobedLights.clear()
    this.lightColorState.clear()
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
    startedAt: number,
  ): void {
    // Each half of a flash starts on a multiple of the interval since the strobe began.
    const elapsed = Math.max(0, monotonicNowMs() - startedAt)
    let isOn = Math.floor(elapsed / interval) % 2 === 1
    for (const lightIndex of dmxLightIndices) {
      this.strobedLights.add(lightIndex)
    }
    if (isOn) {
      this.sequencer.setState(targetLights, color, 0)
    }
    const toggle = (): void => {
      if (isOn) {
        try {
          this.restoreColorsAfterStrobe(targetLights, dmxLightIndices)
        } catch (err) {
          log.error(`Rig ${this.rigId}: failed to reblend after a strobe:`, err)
        }
        isOn = false
      } else {
        this.sequencer.setState(targetLights, color, 0)
        isOn = true
      }
    }
    let repeat: NodeJS.Timeout | null = null
    const first = setTimeout(
      () => {
        toggle()
        repeat = setInterval(toggle, interval)
      },
      interval - (elapsed % interval),
    )
    this.activeStrobeEffects.get(effectName)!.stop = () => {
      clearTimeout(first)
      if (repeat) clearInterval(repeat)
    }
  }

  private restoreColorsAfterStrobe(_targetLights: TrackedLight[], lightIndices: number[]): void {
    for (const lightIndex of lightIndices) {
      this.strobedLights.delete(lightIndex)
      this.triggerReblend(lightIndex)
    }
  }

  private updateColorBank(color: string, newLightIndices: number[]): void {
    const currentLights = this.colorToLights.get(color) || new Set()
    for (const lightIndex of currentLights) {
      this.removeColorFromLight(lightIndex, color)
    }
    this.colorToLights.set(color, new Set())
    for (const lightIndex of newLightIndices) {
      this.addColorToLight(lightIndex, color)
      this.colorToLights.get(color)!.add(lightIndex)
    }
  }

  private addColorToLight(lightIndex: number, color: string): void {
    if (!this.lightColorState.has(lightIndex)) {
      this.lightColorState.set(lightIndex, new Set())
    }
    this.lightColorState.get(lightIndex)!.add(color)

    const existingPending = this.pendingUpdates.get(lightIndex)
    if (existingPending) {
      if (existingPending.timeout) clearTimeout(existingPending.timeout)
      existingPending.colors.add(color)
    } else {
      this.pendingUpdates.set(lightIndex, { colors: new Set([color]), timeout: null })
    }
    const timeout = setTimeout(() => {
      try {
        this.applyAccumulatedColors(lightIndex)
      } catch (err) {
        log.error(`Failed to apply accumulated colors for light ${lightIndex}:`, err)
      } finally {
        this.pendingUpdates.delete(lightIndex)
      }
    }, ACCUMULATION_DELAY_MS)
    this.pendingUpdates.get(lightIndex)!.timeout = timeout
  }

  private removeColorFromLight(lightIndex: number, color: string): void {
    if (!this.lightColorState.has(lightIndex)) return
    this.lightColorState.get(lightIndex)!.delete(color)
    const existingPending = this.pendingUpdates.get(lightIndex)
    if (existingPending) {
      if (existingPending.timeout) clearTimeout(existingPending.timeout)
      existingPending.colors.delete(color)
    } else {
      const remainingColors = new Set(Array.from(this.lightColorState.get(lightIndex)!))
      this.pendingUpdates.set(lightIndex, { colors: remainingColors, timeout: null })
    }
    const timeout = setTimeout(() => {
      try {
        this.applyAccumulatedColors(lightIndex)
      } catch (err) {
        log.error(`Failed to apply accumulated colors for light ${lightIndex}:`, err)
      } finally {
        this.pendingUpdates.delete(lightIndex)
      }
    }, ACCUMULATION_DELAY_MS)
    this.pendingUpdates.get(lightIndex)!.timeout = timeout
  }

  private applyColorToLight(lightIndex: number, color: RGBIO): void {
    const lights = this.lightManager.getLights(['front', 'back'], 'all')
    if (lights && lights[lightIndex]) {
      this.sequencer.setState([lights[lightIndex]], color, 1)
    }
  }

  private turnOffLight(lightIndex: number): void {
    const lights = this.lightManager.getLights(['front', 'back'], 'all')
    if (lights && lights[lightIndex]) {
      const blackColor = getColor('black', 'medium')
      this.sequencer.setState([lights[lightIndex]], blackColor, 1)
    }
  }

  private applyAccumulatedColors(lightIndex: number): void {
    const pendingUpdate = this.pendingUpdates.get(lightIndex)
    if (!pendingUpdate) return
    const colors = this.lightColorState.get(lightIndex) || new Set<string>()
    if (colors.size > 0) {
      this.applyColorToLight(lightIndex, this.blendColors(Array.from(colors)))
    } else {
      this.turnOffLight(lightIndex)
      this.lightColorState.delete(lightIndex)
    }
  }

  private triggerReblend(lightIndex: number): void {
    const existingPending = this.pendingUpdates.get(lightIndex)
    if (existingPending) {
      if (existingPending.timeout) clearTimeout(existingPending.timeout)
      this.pendingUpdates.delete(lightIndex)
    }
    const colors = this.lightColorState.get(lightIndex) || new Set<string>()
    this.applyColorToLight(lightIndex, this.blendColors(Array.from(colors)))
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

  private addColors(colors: RGBIO[]): RGBIO {
    if (colors.length === 0) return getColor('black', 'medium')
    if (colors.length === 1) return colors[0]
    const result = { ...colors[0] }
    for (let i = 1; i < colors.length; i++) {
      const color = colors[i]
      result.red = Math.min(255, result.red + color.red)
      result.green = Math.min(255, result.green + color.green)
      result.blue = Math.min(255, result.blue + color.blue)
      result.intensity = Math.min(255, result.intensity + color.intensity)
    }
    return result
  }
}
