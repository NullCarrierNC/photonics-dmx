/**
 * AudioCaptureManager - Captures audio in renderer process using Web Audio API
 *
 * This manager uses the browser's native Web Audio API to:
 * - Capture audio from microphone
 * - Perform FFT analysis via AnalyserNode
 * - Calculate frequency bands (bass/mids/highs)
 * - Update audioDataAtom for preview component
 * - Send processed data to main process via IPC for DMX control
 */

import { AudioLightingData, AudioConfig } from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import { BeatDetector } from '../../../photonics-dmx/listeners/Audio/BeatDetector'
import { extractAll } from '../../../photonics-dmx/listeners/Audio/SpectralFeatureExtractor'
import { MelBandAnalyser } from '../../../photonics-dmx/listeners/Audio/MelBandAnalyser'
import { computeChromagram } from '../../../photonics-dmx/listeners/Audio/ChromaAnalyser'
import { KeyDetector } from '../../../photonics-dmx/listeners/Audio/KeyDetector'
import { getBandEnergy } from '../../../photonics-dmx/listeners/Audio/bandEnergy'
import { getDefaultStore } from 'jotai'
import { audioDataAtom } from '../atoms'
import { sendAudioData } from '../ipcApi'

const store = getDefaultStore()

const DEFAULT_CONFIG: AudioConfig = {
  fftSize: 2048,
  sensitivity: 1.0,
  smoothing: {
    enabled: true,
    alpha: 0.7,
  },
  beatDetection: {
    threshold: 0.3,
    decayRate: 0.8,
    minInterval: 100,
  },
  enabled: false,
}

const BASS_MIN_HZ = 20
const BASS_MAX_HZ = 220

export class AudioCaptureManager {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private animationFrameId: number | null = null
  private config: AudioConfig
  private isCapturing = false

  /** Smoothed energy for display only; not used for beat thresholds */
  private smoothedEnergy = 0

  /** Monotonic time advanced by frame deltas for beat timing (avoids rAF/clock jitter) */
  private internalTime = 0
  private lastFrameTime = 0

  private beatDetector: BeatDetector
  private melBandAnalyser: MelBandAnalyser | null = null
  private keyDetector: KeyDetector
  private frameIndex = 0

  // Debug logging (log status every ~60 frames ≈ 1 second at 60fps)
  private frameCounter = 0
  private readonly DEBUG_LOG_INTERVAL = 60

  // Throttling for UI updates (update atom every 2 frames = 30fps)
  private readonly UI_UPDATE_THROTTLE = 2
  private uiUpdateCounter = 0
  private lastAudioData: AudioLightingData | null = null
  private readonly VALUE_CHANGE_THRESHOLD = 0.01 // Only update if values changed by >1%

  constructor(config?: Partial<AudioConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.beatDetector = new BeatDetector(this.config.beatDetection)
    this.keyDetector = new KeyDetector()
    console.log('AudioCaptureManager initialized')
  }

  /**
   * Start audio capture from the specified device (or default)
   */
  async start(deviceId?: string): Promise<void> {
    if (this.isCapturing) {
      console.warn('AudioCaptureManager is already capturing')
      return
    }

    try {
      console.log('Starting audio capture...', deviceId ? `device: ${deviceId}` : 'default device')

      // Request microphone access
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      }

      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      console.log('Microphone access granted')

      // Create Web Audio API context
      this.audioContext = new AudioContext()
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = this.config.fftSize
      this.analyser.smoothingTimeConstant = 0 // No built-in smoothing - use custom smoothing instead

      // Connect stream to analyser
      this.source = this.audioContext.createMediaStreamSource(this.stream)
      this.source.connect(this.analyser)

      console.log(
        `Audio context created (sample rate: ${this.audioContext.sampleRate}Hz, FFT size: ${this.analyser.fftSize})`,
      )

      this.isCapturing = true
      this.frameIndex = 0
      this.beatDetector.reset()
      this.melBandAnalyser = new MelBandAnalyser(
        this.audioContext.sampleRate,
        this.analyser.fftSize,
        24,
      )
      this.keyDetector.reset()

      // Start analysis loop
      this.analyzeAudio()

      console.log('Audio capture started successfully')
    } catch (error) {
      console.error('Failed to start audio capture:', error)

      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          throw new Error(
            'Microphone permission denied. Please allow microphone access in your browser settings.',
          )
        } else if (error.name === 'NotFoundError') {
          // Device may have been disconnected
          if (deviceId) {
            throw new Error(
              `Audio device not found. The saved device is no longer connected. Please select a different device in Audio Settings.`,
            )
          } else {
            throw new Error('No microphone found. Please connect a microphone and try again.')
          }
        } else if (error.name === 'NotReadableError') {
          throw new Error(
            'Audio device is already in use by another application. Please close other applications using the microphone.',
          )
        } else if (error.name === 'OverconstrainedError') {
          throw new Error(
            `Audio device constraints cannot be satisfied. The selected device may not support the required settings.`,
          )
        }
        // For other DOMException errors, include the error name and message
        throw new Error(`${error.name}: ${error.message}`)
      }

      // For non-DOMException errors, preserve the original error
      throw error
    }
  }

  /**
   * Stop audio capture and clean up resources
   */
  stop(): void {
    if (!this.isCapturing) {
      console.warn('AudioCaptureManager is not capturing')
      return
    }

    console.log('Stopping audio capture...')

    // Clear audio data atom
    store.set(audioDataAtom, null)

    // Cancel animation frame
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    // Disconnect and stop stream
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.analyser = null
    this.melBandAnalyser = null
    this.isCapturing = false

    // Reset state
    this.smoothedEnergy = 0
    this.internalTime = 0
    this.lastFrameTime = 0
    this.beatDetector.reset()
    this.frameIndex = 0
    this.uiUpdateCounter = 0
    this.lastAudioData = null

    console.log('Audio capture stopped')
  }

  /**
   * Get list of available audio input devices
   */
  async getDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter((d) => d.kind === 'audioinput')
      console.log(`Found ${audioInputs.length} audio input devices`)
      return audioInputs
    } catch (error) {
      console.error('Failed to enumerate devices:', error)
      return []
    }
  }

  /**
   * Update configuration
   * This is called when config changes while audio is running
   */
  updateConfig(config: Partial<AudioConfig>): void {
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...config }

    // Update analyser if active and FFT size changed
    if (this.analyser && config.fftSize && config.fftSize !== oldConfig.fftSize) {
      this.analyser.fftSize = config.fftSize
      this.melBandAnalyser = new MelBandAnalyser(
        this.audioContext!.sampleRate,
        this.analyser.fftSize,
        24,
      )
      console.log(`Updated FFT size to ${config.fftSize}`)
    }

    if (config.beatDetection) {
      this.beatDetector.updateConfig(config.beatDetection)
    }

    console.log('AudioCaptureManager configuration updated:', {
      sensitivity: config.sensitivity !== undefined ? config.sensitivity : 'unchanged',
      smoothing: config.smoothing !== undefined ? config.smoothing : 'unchanged',
      beatDetection: config.beatDetection !== undefined ? config.beatDetection : 'unchanged',
      fftSize: config.fftSize !== undefined ? config.fftSize : 'unchanged',
    })
  }

  /**
   * Main analysis loop - runs at ~60fps
   * UI updates are throttled to 30fps to reduce React re-rendering
   * Beat timing uses frame-duration-based monotonic time to reduce jitter.
   */
  private analyzeAudio(): void {
    if (!this.analyser || !this.isCapturing) return

    const now = performance.now()
    if (this.lastFrameTime > 0) {
      this.internalTime += now - this.lastFrameTime
    }
    this.lastFrameTime = now

    // Get frequency data from analyser (built-in FFT)
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(dataArray)
    const timeDomainArray = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(timeDomainArray)

    // Calculate frequency bands and include raw FFT data (byte data is linear 0-255, IPC-safe)
    const audioData = this.calculateFrequencyBands(dataArray, timeDomainArray)

    // Always send to main process via IPC (full frame rate)
    sendAudioData(audioData)

    // Throttle UI updates (preview EQ, etc.)
    this.uiUpdateCounter++
    const shouldUpdateUI = this.uiUpdateCounter >= this.UI_UPDATE_THROTTLE

    // Beat is often a single frame; never skip pushing beat edge to the preview atom
    const beatChanged =
      this.lastAudioData != null && audioData.beatDetected !== this.lastAudioData.beatDetected

    if (shouldUpdateUI || beatChanged) {
      if (shouldUpdateUI) {
        this.uiUpdateCounter = 0
      }

      const pushToPreviewAtom = beatChanged || (shouldUpdateUI && this.shouldUpdateAtom(audioData))

      if (pushToPreviewAtom) {
        store.set(audioDataAtom, audioData)
        this.lastAudioData = audioData
      }
    }

    // Debug logging - show status every second
    this.frameCounter++
    if (this.frameCounter >= this.DEBUG_LOG_INTERVAL) {
      this.frameCounter = 0
      console.log('Audio Capture Active:', {
        energy: audioData.energy.toFixed(3),
        overallLevel: audioData.overallLevel.toFixed(3),
        beat: audioData.beatDetected ? 'YES' : 'no',
      })
    }

    // Continue loop
    this.animationFrameId = requestAnimationFrame(() => this.analyzeAudio())
  }

  /**
   * Check if atom should be updated based on value changes
   * Only updates if values changed significantly or beat detection changed
   */
  private shouldUpdateAtom(newData: AudioLightingData): boolean {
    if (!this.lastAudioData) {
      return true // First update
    }

    // Always update if beat detection changed
    if (newData.beatDetected !== this.lastAudioData.beatDetected) {
      return true
    }

    // Always update if BPM or BPM confidence changed
    if (newData.bpm !== this.lastAudioData.bpm) return true
    if ((newData.bpmConfidence ?? 0) !== (this.lastAudioData.bpmConfidence ?? 0)) return true

    // Check overall energy change
    const energyDiff = Math.abs(newData.energy - this.lastAudioData.energy)
    if (energyDiff > this.VALUE_CHANGE_THRESHOLD) return true

    // Check if rawFrequencyData changed (for EQ preview bars)
    // Sample a few bins to detect changes without full array comparison
    const newRaw = newData.rawFrequencyData
    const oldRaw = this.lastAudioData.rawFrequencyData
    if (newRaw && oldRaw && newRaw.length === oldRaw.length) {
      // Sample bins at low, mid, and high frequencies to detect changes
      const sampleIndices = [
        0, // First bin (lowest frequency)
        Math.floor(newRaw.length / 2), // Middle bin
        newRaw.length - 1, // Last bin (highest frequency)
      ]
      for (const idx of sampleIndices) {
        const diff = Math.abs(newRaw[idx] - oldRaw[idx])
        if (diff > 2) {
          // Changed by more than 2 units (out of 255) - significant enough to update
          return true
        }
      }
    } else if (newRaw !== oldRaw) {
      // Array reference changed or length mismatch - update
      return true
    }

    return false
  }

  /**
   * Calculate frequency bands from FFT data
   * Dynamically calculates energy for all configured frequency ranges
   */
  private calculateFrequencyBands(
    frequencyData: Uint8Array,
    timeDomainData: Float32Array,
  ): AudioLightingData {
    if (!this.audioContext || !this.analyser) {
      throw new Error('Audio context not initialized')
    }

    const sampleRate = this.audioContext.sampleRate
    const fftSize = this.analyser.fftSize
    const binSize = sampleRate / fftSize

    // Overall energy (0-1)
    let totalEnergy = 0
    for (let i = 0; i < frequencyData.length; i++) {
      totalEnergy += frequencyData[i]
    }
    const overallEnergy = Math.min((totalEnergy / frequencyData.length / 255) * 2, 1.0)
    const scaledEnergy = Math.min(overallEnergy * this.config.sensitivity, 1.0)

    // Display: optional smoothing for overall level (never modified by beat decay)
    let displayEnergy = scaledEnergy
    if (this.config.smoothing.enabled) {
      const alpha = this.config.smoothing.alpha
      this.smoothedEnergy = alpha * scaledEnergy + (1 - alpha) * this.smoothedEnergy
      displayEnergy = this.smoothedEnergy
    }

    // Bass energy for beat detection (20-220 Hz); same algorithm as EQ preview and trigger nodes
    const bassEnergy = getBandEnergy(
      Array.from(frequencyData),
      sampleRate,
      fftSize,
      BASS_MIN_HZ,
      BASS_MAX_HZ,
    )
    // Beat detection uses unscaled analysis energy; timing from frame-based internal time
    const { beatDetected, bpm, bpmConfidence } = this.beatDetector.processFrame(
      scaledEnergy,
      bassEnergy,
      frequencyData,
      binSize,
      this.internalTime,
    )

    const overallLevel = displayEnergy
    this.frameIndex++

    // Peak frequency: bin with max magnitude -> Hz
    let peakBin = 0
    let maxVal = 0
    for (let i = 0; i < frequencyData.length; i++) {
      if (frequencyData[i] > maxVal) {
        maxVal = frequencyData[i]
        peakBin = i
      }
    }
    const peakFrequency = peakBin * binSize

    // Amplitude: overall normalized level (same as overallLevel for compatibility)
    const amplitude = overallLevel

    // IPC-safe raw FFT data (byte data 0-255) for per-node band computation in main process
    // Apply global sensitivity to rawFrequencyData so audio-trigger nodes respect the global setting
    const rawFrequencyData = Array.from(frequencyData).map((bin) =>
      Math.min(Math.round(bin * this.config.sensitivity), 255),
    )

    const spectral = extractAll(frequencyData, timeDomainData, binSize, sampleRate)

    const melBands = this.melBandAnalyser?.computeMelBands(frequencyData).map((v) => Math.min(1, v))

    const chromagram = computeChromagram(frequencyData, binSize)
    const keyResult = this.keyDetector.detect(chromagram)

    return {
      timestamp: Date.now(),
      overallLevel,
      bpm,
      beatDetected,
      energy: displayEnergy,
      rawFrequencyData,
      sampleRate,
      fftSize,
      bpmConfidence,
      peakFrequency,
      amplitude,
      ...spectral,
      melBands,
      chromagram,
      detectedKey: keyResult.key,
      detectedKeyStrength: keyResult.strength,
    }
  }

  /**
   * Check if audio is currently being captured
   */
  isActive(): boolean {
    return this.isCapturing
  }
}
