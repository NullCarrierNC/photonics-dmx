/**
 * AudioDirectProcessor - Maps audio analysis data to DMX lighting
 *
 * This processor receives audio analysis data from the renderer process (via IPC)
 * and maps frequency bands (bass, mids, highs) to DMX lights using configured colors.
 *
 * **Frequency Mapping:**
 * - **Bass frequencies** (20-250Hz): Mapped to lights starting from index 0, displayed in the configured bass color (default: red)
 * - **Mid frequencies** (250-4000Hz): Mapped to subsequent lights, displayed in the configured mids color (default: green)
 * - **High frequencies** (4000-20000Hz): Mapped to remaining lights, displayed in the configured highs color (default: blue)
 *
 * **Energy-Based Behavior:**
 * - **Number of Active Lights**: Proportional to overall energy (0-100%). Higher energy = more lights active.
 * - **Brightness Levels**:
 *   - 0-33% energy: Low brightness
 *   - 33-66% energy: Medium brightness
 *   - 66-90% energy: High brightness
 *   - 90-100% energy: Max brightness
 * - **Intensity Scaling**: Each frequency band's intensity further modulates the brightness of its assigned lights.
 *
 * **Beat Detection:**
 * - When a beat is detected, all lights briefly flash white at high/max brightness
 * - Flash duration is ~16ms
 * - Normal frequency-based colors resume on the next update
 *
 * **Example Visual:**
 * With 8 lights and bass-heavy music at 70% energy:
 * - Lights 1-4: Bright red (bass)
 * - Lights 5-6: Medium green (mids)
 * - Lights 7-8: Dim blue (highs)
 * - On bass kick: All 8 lights flash white briefly
 */
import { DmxLightManager } from '../controllers/DmxLightManager'
import { ILightingController } from '../controllers/sequencer/interfaces'
import { AudioLightingData, AudioConfig } from '../listeners/Audio/AudioTypes'
import { getColor, validateColorString } from '../helpers/dmxHelpers'
import { Color, TrackedLight } from '../types'

/** One colour per frequency band (8 bands). */
const DEFAULT_DIRECT_RANGES = [
  { color: 'red', brightness: 'medium' as const },
  { color: 'orange', brightness: 'medium' as const },
  { color: 'yellow', brightness: 'medium' as const },
  { color: 'green', brightness: 'medium' as const },
  { color: 'chartreuse', brightness: 'medium' as const },
  { color: 'cyan', brightness: 'medium' as const },
  { color: 'blue', brightness: 'medium' as const },
  { color: 'violet', brightness: 'medium' as const },
] as const

export class AudioDirectProcessor {
  private isActive = false

  // Track which lights are currently active
  private activeLights: Set<number> = new Set()

  constructor(
    private lightManager: DmxLightManager,
    private photonicsSequencer: ILightingController,
    _audioConfig: AudioConfig,
  ) {
    console.log('AudioDirectProcessor: Constructor called with dependencies:', {
      lightManagerType: lightManager.constructor.name,
      photonicsSequencerType: photonicsSequencer.constructor.name,
    })

    this.lightManager = lightManager
    this.photonicsSequencer = photonicsSequencer

    console.log('AudioDirectProcessor initialized')
  }

  /**
   * Start processing audio data
   */
  public start(): void {
    if (this.isActive) {
      console.warn('AudioDirectProcessor: Already active')
      return
    }

    this.isActive = true
    console.log('AudioDirectProcessor: Started')
  }

  /**
   * Stop processing audio data
   */
  public stop(): void {
    if (!this.isActive) {
      return
    }

    this.isActive = false
    this.turnOffAllLights()

    console.log('AudioDirectProcessor: Stopped')
  }

  /**
   * Update configuration (no-op; frequency bands are derived from audio data)
   */
  public updateConfig(_config: AudioConfig): void {
    console.log('AudioDirectProcessor: Configuration updated')
  }

  /**
   * Process audio data received from renderer via IPC
   * This is called by ControllerManager when it receives audio:data from renderer
   */
  public processAudioData(data: AudioLightingData): void {
    if (!this.isActive) {
      return
    }

    const { energy, beatDetected } = data
    const bands = this.deriveBandsFromData(data)
    this.mapFrequencyBandsToLights(bands, energy, beatDetected)
  }

  /** Derive per-band intensities from overall energy when raw FFT is not used */
  private deriveBandsFromData(data: AudioLightingData): number[] {
    const e = data.energy
    const factors = [1, 0.92, 0.85, 0.78, 0.7, 0.62, 0.52, 0.42]
    return factors.map((f) => e * f)
  }

  /**
   * Check if processor is active
   */
  public isProcessing(): boolean {
    return this.isActive
  }

  /**
   * Map frequency bands to lights with additive color blending
   *
   * This creates the visual effect by:
   * 1. Determining how many total lights should be active based on overall energy
   * 2. Distributing lights across frequency ranges proportionally to their intensities
   * 3. Allowing overlapping ranges (same light can belong to multiple ranges)
   * 4. Additively blending colors when ranges overlap on the same light
   * 5. Applying configured brightness and intensity modulation per range
   *
   * Visual Result:
   * - Quiet music (low energy): Few lights active, dim
   * - Loud music (high energy): Many/all lights active, bright
   * - Overlapping ranges: Colors blend additively (e.g., red + blue = magenta)
   * - Each range's brightness is respected independently
   */
  private mapFrequencyBandsToLights(
    frequencyBands: readonly number[],
    energy: number,
    beatDetected: boolean,
  ): void {
    const lights = this.lightManager.getLights(['front', 'back'], 'all')
    if (!lights || lights.length === 0) {
      return
    }

    const numLights = lights.length

    const bandValues = [...frequencyBands]

    // Distribute lights based on overall energy
    const activeLightCount = Math.ceil(numLights * energy)

    // Calculate how many lights each range should affect (proportional to band intensity)
    // Each range can overlap with others, so we calculate proportionally
    const totalBandIntensity = bandValues.reduce((sum, val) => sum + val, 0)
    const lightsPerRange: number[] = []

    if (totalBandIntensity > 0) {
      for (let i = 0; i < bandValues.length; i++) {
        // Proportion of total intensity this range represents
        const proportion = bandValues[i] / totalBandIntensity
        // Distribute lights proportionally, but ensure each range gets at least some lights if it has energy
        const lightCount =
          bandValues[i] > 0.05 ? Math.max(1, Math.ceil(activeLightCount * proportion)) : 0
        lightsPerRange.push(Math.min(lightCount, numLights))
      }
    } else {
      // No energy - no lights
      for (let i = 0; i < DEFAULT_DIRECT_RANGES.length; i++) {
        lightsPerRange.push(0)
      }
    }

    const ranges = DEFAULT_DIRECT_RANGES
    const lightAssignments: Map<
      number,
      Array<{
        color: Color
        brightness: 'low' | 'medium' | 'high' | 'max'
        intensity: number
      }>
    > = new Map()

    let currentOffset = 0
    for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex++) {
      const range = ranges[rangeIndex]
      const bandIntensity = bandValues[rangeIndex]
      const lightCount = lightsPerRange[rangeIndex]

      if (bandIntensity > 0.05 && lightCount > 0) {
        // Validate color
        const color = validateColorString(range.color)

        // Use configured brightness for this range
        const brightness = range.brightness || 'medium'

        // Assign lights starting from current offset, wrapping around if needed
        for (let i = 0; i < lightCount; i++) {
          const lightIndex = (currentOffset + i) % numLights

          // Add this range to the light's assignments
          if (!lightAssignments.has(lightIndex)) {
            lightAssignments.set(lightIndex, [])
          }
          lightAssignments.get(lightIndex)!.push({
            color,
            brightness,
            intensity: bandIntensity,
          })
        }

        // Move offset for next range (allows overlapping)
        currentOffset = (currentOffset + Math.floor(lightCount / 2)) % numLights
      }
    }

    // Turn off all lights first
    this.turnOffAllLights()

    // Apply colors to lights with additive blending
    for (const [lightIndex, assignments] of lightAssignments.entries()) {
      if (assignments.length === 0) continue

      const light = lights[lightIndex]

      if (assignments.length === 1) {
        // Single range - simple application
        const { color, brightness, intensity } = assignments[0]
        const rgbColor = getColor(color, brightness, 'add')
        rgbColor.intensity = Math.floor(rgbColor.intensity * intensity)
        rgbColor.opacity = intensity
        this.photonicsSequencer.setState([light], rgbColor, 1)
      } else {
        // Multiple ranges - additive blending
        // Start with first color
        const first = assignments[0]
        const blendedColor = getColor(first.color, first.brightness, 'add')
        blendedColor.intensity = Math.floor(blendedColor.intensity * first.intensity)
        blendedColor.opacity = first.intensity

        // Add subsequent colors
        for (let i = 1; i < assignments.length; i++) {
          const { color, brightness, intensity } = assignments[i]
          const nextColor = getColor(color, brightness, 'add')
          nextColor.intensity = Math.floor(nextColor.intensity * intensity)
          nextColor.opacity = intensity

          // Additive blend: add RGB values and clamp to 255
          blendedColor.red = Math.min(255, blendedColor.red + nextColor.red)
          blendedColor.green = Math.min(255, blendedColor.green + nextColor.green)
          blendedColor.blue = Math.min(255, blendedColor.blue + nextColor.blue)
          blendedColor.intensity = Math.min(255, blendedColor.intensity + nextColor.intensity)
          // Opacity: use maximum (more opaque)
          blendedColor.opacity = Math.max(blendedColor.opacity, nextColor.opacity)
        }

        this.photonicsSequencer.setState([light], blendedColor, 1)
      }

      this.activeLights.add(lightIndex)
    }

    // If beat detected, flash all lights briefly
    if (beatDetected) {
      this.handleBeatEffect(lights, energy)
    }
  }

  /**
   * Handle beat detection effect
   *
   * Creates a dramatic visual impact on detected beats (bass kicks, snare hits, etc.):
   * - Overrides all frequency-based colors
   * - Flashes ALL lights white simultaneously
   * - Brightness scaled to overall energy (louder beats = brighter flash)
   * - Flash lasts ~16ms (one frame at 60fps refresh rate)
   * - Normal frequency-based colors resume on next audio update
   *
   * Visual Result:
   * - Strong beats: Bright white flash across all lights
   * - Weak beats: Dimmer white flash
   * - Creates rhythmic punctuation matching the music's percussion
   */
  private handleBeatEffect(lights: TrackedLight[], energy: number): void {
    const brightness = energy > 0.8 ? 'max' : 'high'
    const whiteColor = getColor('white', brightness, 'replace')
    whiteColor.opacity = energy

    // Flash all lights briefly on beat
    // Note: The next audio data update will restore lights to their frequency-based colors
    for (const light of lights) {
      this.photonicsSequencer.setState([light], whiteColor, 1)
    }
  }

  /**
   * Turn off all lights
   */
  private async turnOffAllLights(): Promise<void> {
    const lights = this.lightManager.getLights(['front', 'back'], 'all')
    if (!lights || lights.length === 0) {
      return
    }

    const blackColor = getColor('black', 'medium')

    for (let i = 0; i < lights.length; i++) {
      this.photonicsSequencer.setState([lights[i]], blackColor, 1)
      this.activeLights.delete(i)
    }

    this.activeLights.clear()
  }

  /**
   * Shutdown and cleanup
   */
  public shutdown(): void {
    this.stop()
    console.log('AudioDirectProcessor: Shutdown complete')
  }
}
