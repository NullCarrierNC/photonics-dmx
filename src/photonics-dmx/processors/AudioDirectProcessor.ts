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
import { DmxLightManager } from '../controllers/DmxLightManager';
import { ILightingController } from '../controllers/sequencer/interfaces';
import { AudioLightingData, AudioConfig } from '../listeners/Audio/AudioTypes';
import { getColor, validateColorString } from '../helpers/dmxHelpers';
import { Color, TrackedLight } from '../types';

export class AudioDirectProcessor {
  private config: AudioConfig;
  private isActive = false;
  
  // Track which lights are currently active
  private activeLights: Set<number> = new Set();
  
  // Debug logging
  private processCount = 0;
  private readonly DEBUG_LOG_INTERVAL = 60; // Log every ~60 calls (once per second at 60fps)

  constructor(
    private lightManager: DmxLightManager,
    private photonicsSequencer: ILightingController,
    audioConfig: AudioConfig
  ) {
    console.log('AudioDirectProcessor: Constructor called with dependencies:', {
      lightManagerType: lightManager.constructor.name,
      photonicsSequencerType: photonicsSequencer.constructor.name,
      audioConfig
    });
    
    this.lightManager = lightManager;
    this.photonicsSequencer = photonicsSequencer;
    this.config = audioConfig;
    
    console.log('AudioDirectProcessor initialized');
  }

  /**
   * Start processing audio data
   */
  public start(): void {
    if (this.isActive) {
      console.warn('AudioDirectProcessor: Already active');
      return;
    }
    
    this.isActive = true;
    console.log('AudioDirectProcessor: Started');
  }

  /**
   * Stop processing audio data
   */
  public stop(): void {
    if (!this.isActive) {
      return;
    }
    
    this.isActive = false;
    this.turnOffAllLights();
    
    console.log('AudioDirectProcessor: Stopped');
  }

  /**
   * Update configuration
   */
  public updateConfig(config: AudioConfig): void {
    this.config = config;
    console.log('AudioDirectProcessor: Configuration updated');
  }

  /**
   * Process audio data received from renderer via IPC
   * This is called by ControllerManager when it receives audio:data from renderer
   */
  public processAudioData(data: AudioLightingData): void {
    if (!this.isActive) {
      return;
    }
    
    const { frequencyBands, energy, beatDetected } = data;
    
    // Debug logging - log every ~60 calls (once per second at 60fps)
    this.processCount++;
    if (this.processCount % this.DEBUG_LOG_INTERVAL === 0) {
      const lights = this.lightManager.getLights(['front', 'back'], 'all');
      console.log('💡 Audio Processor Active:', {
        energy: energy.toFixed(3),
        bass: frequencyBands.bass.toFixed(3),
        mids: frequencyBands.mids.toFixed(3),
        highs: frequencyBands.highs.toFixed(3),
        beat: beatDetected ? 'Y' : 'n',
        activeLights: this.activeLights.size,
        totalLights: lights?.length || 0,
        processedFrames: this.processCount
      });
    }
    
    // Map frequency bands to lights
    this.mapFrequencyBandsToLights(frequencyBands, energy, beatDetected);
  }

  /**
   * Check if processor is active
   */
  public isProcessing(): boolean {
    return this.isActive;
  }

  /**
   * Map frequency bands to lights
   * 
   * This creates the visual effect by:
   * 1. Determining how many total lights should be active based on overall energy
   * 2. Distributing those lights across bass/mids/highs zones proportionally
   * 3. Assigning the configured color to each zone
   * 4. Applying brightness and intensity modulation
   * 
   * Visual Result:
   * - Quiet music (low energy): Few lights active, dim
   * - Loud music (high energy): Many/all lights active, bright
   * - Bass-heavy: More lights in the bass (first) zone
   * - Treble-heavy: More lights in the highs (last) zone
   * - Balanced: Even distribution across all zones
   */
  private mapFrequencyBandsToLights(
    frequencyBands: { bass: number; mids: number; highs: number },
    energy: number,
    beatDetected: boolean
  ): void {
    const lights = this.lightManager.getLights(['front', 'back'], 'all');
    if (!lights || lights.length === 0) {
      return;
    }

    const numLights = lights.length;
    
    // Distribute lights based on frequency band intensity
    // Use energy to determine how many lights to activate (0-100% of available lights)
    const activeLightCount = Math.ceil(numLights * energy);
    
    // Determine which frequency band is dominant
    const maxBand = Math.max(frequencyBands.bass, frequencyBands.mids, frequencyBands.highs);
    
    // Calculate how many lights for each band (proportional to band intensity)
    const bassLightCount = Math.ceil(activeLightCount * (frequencyBands.bass / maxBand));
    const midsLightCount = Math.ceil(activeLightCount * (frequencyBands.mids / maxBand));
    const highsLightCount = Math.ceil(activeLightCount * (frequencyBands.highs / maxBand));
    
    // Determine brightness level based on energy
    let brightness: 'low' | 'medium' | 'high' | 'max';
    if (energy < 0.33) {
      brightness = 'low';
    } else if (energy < 0.66) {
      brightness = 'medium';
    } else if (energy < 0.9) {
      brightness = 'high';
    } else {
      brightness = 'max';
    }
    
    // Apply colors from config (validate strings to Color type)
    const bassColor = validateColorString(this.config.colorMapping.bassColor);
    const midsColor = validateColorString(this.config.colorMapping.midsColor);
    const highsColor = validateColorString(this.config.colorMapping.highsColor);
    
    // Turn off all lights first
    this.turnOffAllLights();
    
    // Apply bass lights
    if (frequencyBands.bass > 0.1 && bassLightCount > 0) {
      this.applyColorToLights(lights, 0, bassLightCount, bassColor, brightness, frequencyBands.bass);
    }
    
    // Apply mids lights
    if (frequencyBands.mids > 0.1 && midsLightCount > 0) {
      const startIndex = bassLightCount;
      this.applyColorToLights(lights, startIndex, startIndex + midsLightCount, midsColor, brightness, frequencyBands.mids);
    }
    
    // Apply highs lights
    if (frequencyBands.highs > 0.1 && highsLightCount > 0) {
      const startIndex = bassLightCount + midsLightCount;
      this.applyColorToLights(lights, startIndex, Math.min(startIndex + highsLightCount, numLights), highsColor, brightness, frequencyBands.highs);
    }
    
    // If beat detected, flash all lights briefly
    if (beatDetected) {
      this.handleBeatEffect(lights, energy);
    }
  }

  /**
   * Apply color to a range of lights
   * 
   * Applies the specified color to a contiguous range of lights with:
   * - Base brightness determined by overall energy level
   * - Fine-tuned intensity based on the specific frequency band's strength
   * - Opacity/transparency based on frequency intensity (stronger = more opaque)
   * 
   * Visual Result:
   * - Stronger frequency bands appear brighter and more saturated
   * - Weaker frequency bands appear dimmer and more transparent
   */
  private applyColorToLights(
    lights: TrackedLight[],
    startIndex: number,
    endIndex: number,
    color: Color,
    brightness: 'low' | 'medium' | 'high' | 'max',
    intensityMultiplier: number
  ): void {
    for (let i = startIndex; i < endIndex && i < lights.length; i++) {
      const rgbColor = getColor(color, brightness, 'replace');
      
      // Adjust intensity based on frequency band intensity (0.0-1.0)
      // Stronger frequency = brighter light within its zone
      rgbColor.intensity = Math.floor(rgbColor.intensity * intensityMultiplier);
      
      // Apply opacity based on intensity (0.0-1.0)
      // Stronger frequency = more opaque/saturated color
      rgbColor.opacity = intensityMultiplier;
      
      this.photonicsSequencer.setState([lights[i]], rgbColor, 1);
      this.activeLights.add(i);
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
    const brightness = energy > 0.8 ? 'max' : 'high';
    const whiteColor = getColor('white', brightness, 'replace');
    whiteColor.opacity = energy;
    
    // Flash all lights briefly on beat
    // Note: The next audio data update will restore lights to their frequency-based colors
    for (const light of lights) {
      this.photonicsSequencer.setState([light], whiteColor, 1);
    }
  }


  /**
   * Turn off all lights
   */
  private async turnOffAllLights(): Promise<void> {
    const lights = this.lightManager.getLights(['front', 'back'], 'all');
    if (!lights || lights.length === 0) {
      return;
    }

    const blackColor = getColor('black', 'medium');
    
    for (let i = 0; i < lights.length; i++) {
      this.photonicsSequencer.setState([lights[i]], blackColor, 1);
      this.activeLights.delete(i);
    }
    
    this.activeLights.clear();
  }

  /**
   * Shutdown and cleanup
   */
  public shutdown(): void {
    this.stop();
    console.log('AudioDirectProcessor: Shutdown complete');
  }
}

