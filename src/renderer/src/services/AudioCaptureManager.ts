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
import DEFAULT_AUDIO_CONFIG, {
  DEFAULT_AUDIO_BANDS,
} from '../../../photonics-dmx/listeners/Audio/AudioConfig'
import { BeatDetector } from '../../../photonics-dmx/listeners/Audio/BeatDetector'
import {
  extractAll,
  extractBandFeatures,
} from '../../../photonics-dmx/listeners/Audio/SpectralFeatureExtractor'
import { MultibandOnsetDetector } from '../../../photonics-dmx/listeners/Audio/MultibandOnsetDetector'
import { MelBandAnalyser } from '../../../photonics-dmx/listeners/Audio/MelBandAnalyser'
import { computeChromagram } from '../../../photonics-dmx/listeners/Audio/ChromaAnalyser'
import { KeyDetector } from '../../../photonics-dmx/listeners/Audio/KeyDetector'
import { getBandEnergy } from '../../../photonics-dmx/listeners/Audio/bandEnergy'
import { getDefaultStore } from 'jotai'
import { audioDataAtom } from '../atoms'
import { sendAudioData } from '../ipcApi'
import { buildBinToBandMap } from './audioBandMapping'
import { previewFrameChanged } from './audioPreviewFrame'
import { createLogger } from '../../../shared/logger'
const log = createLogger('AudioCaptureManager')

/**
 * Analysis rate. This drives FFT, beat detection and the frames sent to main, so it is the show
 * rate and must not depend on the display: requestAnimationFrame is throttled to about 1Hz when
 * the window is hidden, which is exactly the case where a game is running full-screen in front of
 * it, and it also ties the analysis rate to the monitor's refresh rate.
 */
const ANALYSIS_RATE_HZ = 60
const ANALYSIS_INTERVAL_MS = Math.round(1000 / ANALYSIS_RATE_HZ)

const store = getDefaultStore()

const DEFAULT_CONFIG: AudioConfig = {
  fftSize: 4096,
  sensitivity: DEFAULT_AUDIO_CONFIG.sensitivity,
  noiseFloor: DEFAULT_AUDIO_CONFIG.noiseFloor,
  bands: DEFAULT_AUDIO_BANDS,
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
  strobeEnabled: DEFAULT_AUDIO_CONFIG.strobeEnabled,
  strobeTriggerThreshold: DEFAULT_AUDIO_CONFIG.strobeTriggerThreshold,
  strobeProbability: DEFAULT_AUDIO_CONFIG.strobeProbability,
  idleDetection: { ...DEFAULT_AUDIO_CONFIG.idleDetection },
}

const BASS_MIN_HZ = 20
const BASS_MAX_HZ = 220

export class AudioCaptureManager {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analysisTimer: ReturnType<typeof setInterval> | null = null
  private config: AudioConfig
  private isCapturing = false

  /** Serialises device opens so two starts cannot hold two devices. */
  private startQueue: Promise<void> = Promise.resolve()
  /** True while a device is being opened, which tells an early stop from an idle one. */
  private opening = false
  /** Moved on by every start and every stop, so an opening device knows it is no longer wanted. */
  private startGeneration = 0

  /** Smoothed energy for display only; not used for beat thresholds */
  private smoothedEnergy = 0

  /** Monotonic time advanced by frame deltas for beat timing (avoids rAF/clock jitter) */
  private internalTime = 0
  private lastFrameTime = 0

  private beatDetector: BeatDetector
  private multibandOnset: MultibandOnsetDetector
  private melBandAnalyser: MelBandAnalyser | null = null
  private keyDetector: KeyDetector
  private frameIndex = 0

  // Cached bin-to-band mapping for efficient per-band gain application
  // Maps bin index to band index (0-7) or -1 if no band matches
  private binToBandMap: Int8Array | null = null
  // Cached band gains array (indexed by band index 0-7)
  private bandGains: number[] = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]

  // Debug logging (log status once a second at the analysis rate)
  private frameCounter = 0
  private readonly DEBUG_LOG_INTERVAL = ANALYSIS_RATE_HZ

  // Throttling for UI updates: the preview atom is written at half the analysis rate.
  private readonly UI_UPDATE_THROTTLE = 2
  private uiUpdateCounter = 0
  private lastAudioData: AudioLightingData | null = null
  private frequencyBuffer: Uint8Array | null = null
  private timeDomainBuffer: Float32Array | null = null
  private readonly VALUE_CHANGE_THRESHOLD = 0.01 // Only update if values changed by >1%

  constructor(config?: Partial<AudioConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.beatDetector = new BeatDetector(this.config.beatDetection)
    this.multibandOnset = new MultibandOnsetDetector([])
    this.keyDetector = new KeyDetector()
    log.info('AudioCaptureManager initialized')
  }

  /**
   * Start audio capture from the specified device (or default).
   *
   * Opening a device is awaited, so starts are queued behind each other and a stop that arrives
   * during one is honoured by {@link openDevice} rather than lost.
   */
  async start(deviceId?: string): Promise<void> {
    const requested = ++this.startGeneration
    const open = (): Promise<void> => this.openDevice(deviceId, requested)
    const attempt = this.startQueue.then(open, open)
    this.startQueue = attempt.catch(() => undefined)
    await attempt
  }

  private async openDevice(deviceId: string | undefined, requested: number): Promise<void> {
    if (requested !== this.startGeneration) {
      log.info('Skipping an audio start that was superseded before it opened a device')
      return
    }
    if (this.isCapturing) {
      log.warn('AudioCaptureManager is already capturing')
      return
    }

    this.opening = true
    try {
      log.info('Starting audio capture...', deviceId ? `device: ${deviceId}` : 'default device')

      // Request microphone access
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      }

      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      log.info('Microphone access granted')

      // The device is live from here on. A stop that arrived while it was opening moved the
      // generation on, and this is the first moment we can act on it.
      if (requested !== this.startGeneration) {
        log.info('Audio capture was stopped while the device was opening')
        this.releasePartialStart()
        return
      }

      // Create Web Audio API context
      this.audioContext = new AudioContext()
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = this.config.fftSize
      this.analyser.smoothingTimeConstant = 0 // No built-in smoothing - use custom smoothing instead

      // Connect stream to analyser
      this.source = this.audioContext.createMediaStreamSource(this.stream)
      this.source.connect(this.analyser)

      log.info(
        `Audio context created (sample rate: ${this.audioContext.sampleRate}Hz, FFT size: ${this.analyser.fftSize})`,
      )

      this.isCapturing = true
      this.frameIndex = 0
      this.beatDetector.reset()
      this.multibandOnset.reset()
      this.melBandAnalyser = new MelBandAnalyser(
        this.audioContext.sampleRate,
        this.analyser.fftSize,
        24,
      )
      this.keyDetector.reset()

      // Build bin-to-band mapping now that we have audio context
      this.rebuildBinToBandMap()

      // Start analysis loop
      this.analysisTimer = setInterval(() => this.analyzeAudio(), ANALYSIS_INTERVAL_MS)
      this.analyzeAudio()

      log.info('Audio capture started successfully')
    } catch (error) {
      log.error('Failed to start audio capture:', error)
      // The device is live from getUserMedia onward, but the capturing flag is only set once
      // everything downstream is built, and stop() bails on that flag. Anything failing in
      // between would leave the microphone open with no way left to close it.
      this.releasePartialStart()

      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          throw new Error(
            'Microphone permission denied. Please allow microphone access in your browser settings.',
          )
        } else if (error.name === 'NotFoundError') {
          // Device may have been disconnected
          if (deviceId) {
            throw new Error(
              `Audio device not found. The saved device is no longer connected. Please select a different device in Preferences → Audio.`,
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
    } finally {
      this.opening = false
    }
  }

  /**
   * Stop audio capture and clean up resources
   */
  /** Give back whatever a failed start had already taken. */
  private releasePartialStart(): void {
    try {
      this.source?.disconnect()
      this.stream?.getTracks().forEach((track) => track.stop())
      void this.audioContext?.close()
      if (this.analysisTimer !== null) {
        clearInterval(this.analysisTimer)
      }
    } catch (error) {
      log.error('Failed to release a partly started capture:', error)
    }
    this.source = null
    this.stream = null
    this.audioContext = null
    this.analyser = null
    this.melBandAnalyser = null
    this.analysisTimer = null
    this.isCapturing = false
  }

  stop(): void {
    // Moving the generation on tells a start that is still opening a device to release it.
    this.startGeneration += 1

    if (!this.isCapturing) {
      if (this.opening) {
        log.info('Stopping audio capture before the device has finished opening')
        return
      }
      log.warn('AudioCaptureManager is not capturing')
      return
    }

    log.info('Stopping audio capture...')

    // Clear audio data atom
    store.set(audioDataAtom, null)

    // Stop the analysis loop
    if (this.analysisTimer !== null) {
      clearInterval(this.analysisTimer)
      this.analysisTimer = null
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
      this.audioContext.close().catch((error) => log.error('Failed to close audio context:', error))
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
    this.multibandOnset.reset()
    this.frameIndex = 0
    this.uiUpdateCounter = 0
    this.lastAudioData = null

    log.info('Audio capture stopped')
  }

  /**
   * Get list of available audio input devices
   */
  async getDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter((d) => d.kind === 'audioinput')
      log.info(`Found ${audioInputs.length} audio input devices`)
      return audioInputs
    } catch (error) {
      log.error('Failed to enumerate devices:', error)
      return []
    }
  }

  /** Rebuilds the bin-to-band cache from the live context, clearing it when there is none. */
  private rebuildBinToBandMap(): void {
    if (!this.audioContext || !this.analyser) {
      this.binToBandMap = null
      return
    }
    const mapping = buildBinToBandMap(
      this.audioContext.sampleRate,
      this.analyser.fftSize,
      this.analyser.frequencyBinCount,
      this.config.bands,
    )
    this.binToBandMap = mapping.binToBandMap
    this.bandGains = mapping.bandGains
    this.multibandOnset.reconfigure(mapping.onsetConfigs)
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
      // Rebuild mapping since FFT size changed
      this.rebuildBinToBandMap()
      log.info(`Updated FFT size to ${config.fftSize}`)
    }

    // Rebuild mapping if bands changed
    if (config.bands) {
      this.rebuildBinToBandMap()
    }

    if (config.beatDetection) {
      this.beatDetector.updateConfig(config.beatDetection)
    }

    log.info('AudioCaptureManager configuration updated:', {
      sensitivity: config.sensitivity !== undefined ? config.sensitivity : 'unchanged',
      bands: config.bands !== undefined ? 'updated' : 'unchanged',
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

    // Get frequency data from analyser (built-in FFT). The buffers are reused across frames, so
    // the loop allocates nothing at the analysis rate.
    if (!this.frequencyBuffer || this.frequencyBuffer.length !== this.analyser.frequencyBinCount) {
      this.frequencyBuffer = new Uint8Array(this.analyser.frequencyBinCount)
    }
    if (!this.timeDomainBuffer || this.timeDomainBuffer.length !== this.analyser.fftSize) {
      this.timeDomainBuffer = new Float32Array(this.analyser.fftSize)
    }
    const dataArray = this.frequencyBuffer
    this.analyser.getByteFrequencyData(dataArray)
    const timeDomainArray = this.timeDomainBuffer
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

      const pushToPreviewAtom =
        beatChanged ||
        (shouldUpdateUI &&
          previewFrameChanged(this.lastAudioData, audioData, this.VALUE_CHANGE_THRESHOLD))

      if (pushToPreviewAtom) {
        store.set(audioDataAtom, audioData)
        this.lastAudioData = audioData
      }
    }

    // Debug logging - show status every second
    this.frameCounter++
    if (this.frameCounter >= this.DEBUG_LOG_INTERVAL) {
      this.frameCounter = 0
      log.info('Audio Capture Active:', {
        energy: audioData.energy.toFixed(3),
        overallLevel: audioData.overallLevel.toFixed(3),
        beat: audioData.beatDetected ? 'YES' : 'no',
      })
    }
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

    // Apply noise floor gate: zero out bins below threshold
    const noiseFloor = this.config.noiseFloor ?? DEFAULT_AUDIO_CONFIG.noiseFloor
    let gatedData: Uint8Array
    if (noiseFloor > 0) {
      gatedData = new Uint8Array(frequencyData.length)
      for (let i = 0; i < frequencyData.length; i++) {
        gatedData[i] = frequencyData[i] >= noiseFloor ? frequencyData[i] : 0
      }
    } else {
      gatedData = frequencyData
    }

    // Overall energy (0-1)
    let totalEnergy = 0
    for (let i = 0; i < gatedData.length; i++) {
      totalEnergy += gatedData[i]
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
      Array.from(gatedData),
      sampleRate,
      fftSize,
      BASS_MIN_HZ,
      BASS_MAX_HZ,
    )
    // Beat detection uses unscaled analysis energy; timing from frame-based internal time
    const { beatDetected, bpm, bpmConfidence } = this.beatDetector.processFrame(
      scaledEnergy,
      bassEnergy,
      gatedData,
      binSize,
      this.internalTime,
    )

    const overallLevel = displayEnergy
    this.frameIndex++

    // Peak frequency: bin with max magnitude -> Hz
    let peakBin = 0
    let maxVal = 0
    for (let i = 0; i < gatedData.length; i++) {
      if (gatedData[i] > maxVal) {
        maxVal = gatedData[i]
        peakBin = i
      }
    }
    const peakFrequency = peakBin * binSize

    // Amplitude: overall normalized level (same as overallLevel for compatibility)
    const amplitude = overallLevel

    // IPC-safe raw FFT data (byte data 0-255) for per-node band computation in main process
    // Apply global sensitivity and per-band gain multipliers
    // Gain pipeline: raw bin * globalSensitivity * bandGain
    const rawFrequencyData = new Array<number>(gatedData.length)
    if (this.binToBandMap && this.binToBandMap.length === gatedData.length) {
      // Use cached bin-to-band mapping for efficient lookup
      for (let i = 0; i < gatedData.length; i++) {
        const bin = gatedData[i]
        const bandIndex = this.binToBandMap[i]
        if (bandIndex >= 0 && bandIndex < this.bandGains.length) {
          // Apply global sensitivity * band gain
          rawFrequencyData[i] = Math.min(
            Math.round(bin * this.config.sensitivity * this.bandGains[bandIndex]),
            255,
          )
        } else {
          // No band matches (e.g., sub-20 Hz bins) - apply global sensitivity only
          rawFrequencyData[i] = Math.min(Math.round(bin * this.config.sensitivity), 255)
        }
      }
    } else {
      // Fallback: if mapping not available, apply global sensitivity only
      // This should only happen briefly during initialization
      for (let i = 0; i < gatedData.length; i++) {
        rawFrequencyData[i] = Math.min(Math.round(gatedData[i] * this.config.sensitivity), 255)
      }
    }

    const spectral = extractAll(gatedData, timeDomainData, binSize, sampleRate)

    const bandSpectralFeatures: Record<
      string,
      { flatness: number; crest: number; centroid: number }
    > = {}
    for (const band of this.config.bands) {
      const startBin = Math.floor(band.minHz / binSize)
      const endBin = Math.min(Math.ceil(band.maxHz / binSize), gatedData.length)
      bandSpectralFeatures[band.id] = extractBandFeatures(
        gatedData,
        binSize,
        startBin,
        endBin,
        band.minHz,
        band.maxHz,
      )
    }

    const bandOnsets = this.multibandOnset.processFrame(gatedData)

    const melBands = this.melBandAnalyser?.computeMelBands(gatedData).map((v) => Math.min(1, v))

    const chromagram = computeChromagram(gatedData, binSize)
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
      bandSpectralFeatures,
      bandOnsets,
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
