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

import { AudioLightingData, AudioConfig } from '../../../photonics-dmx/listeners/Audio/audioTypes';
import { getDefaultStore } from 'jotai';
import { audioDataAtom } from '../atoms';

const store = getDefaultStore();

// Default frequency ranges (matching DEFAULT_RANGES in AudioColorMapping)
const DEFAULT_RANGES: Array<{
  id: string;
  name: string;
  minHz: number;
  maxHz: number;
  color: string;
  brightness: 'low' | 'medium' | 'high' | 'max';
  sensitivity: number;
}> = [
  { id: 'range1', name: 'Bass', minHz: 20, maxHz: 250, color: 'red', brightness: 'medium', sensitivity: 1.0 },
  { id: 'range2', name: 'Low-Mids', minHz: 250, maxHz: 800, color: 'blue', brightness: 'medium', sensitivity: 1.0 },
  { id: 'range3', name: 'Mids', minHz: 800, maxHz: 4000, color: 'yellow', brightness: 'medium', sensitivity: 1.0 },
  { id: 'range4', name: 'Upper-Mids', minHz: 4000, maxHz: 10000, color: 'green', brightness: 'medium', sensitivity: 1.0 },
  { id: 'range5', name: 'Highs', minHz: 10000, maxHz: 20000, color: 'cyan', brightness: 'medium', sensitivity: 1.0 }
];

const DEFAULT_CONFIG: AudioConfig = {
  fftSize: 2048,
  sensitivity: 1.0,
  smoothing: {
    enabled: true,
    alpha: 0.7
  },
  frequencyBands: {
    bandCount: 3,
    ranges: DEFAULT_RANGES
  },
  beatDetection: {
    threshold: 0.3,
    decayRate: 0.8,
    minInterval: 100
  },
  enabled: false
};

export class AudioCaptureManager {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  private config: AudioConfig;
  private isCapturing = false;
  
  // Smoothing state - store per range
  private smoothedRanges: Map<string, number> = new Map();
  private smoothedEnergy = 0;
  
  // Beat detection state
  private lastBeatTime = 0;
  private energyHistory: number[] = [];
  private readonly ENERGY_HISTORY_SIZE = 43; // ~1 second at 60fps
  private bassEnergyHistory: number[] = [];
  private spectralFluxHistory: number[] = [];
  private readonly SPECTRAL_HISTORY_SIZE = 86; // ~1.5 seconds of history for adaptive thresholding
  private previousSpectrum: Float32Array | null = null;
  private readonly MINIMUM_ENERGY_FOR_BEAT = 0.05;
  private readonly MAX_BEAT_FREQUENCY = 2000; // Focus spectral flux on content under 2kHz
  private recentEnergyHistory: number[] = [];
  private readonly SHORT_ENERGY_HISTORY_SIZE = 12; // ~200ms window
  private frameIndex = 0;
  private beatTimestamps: number[] = []; // Track actual beat times for BPM calculation
  private readonly MAX_BEAT_HISTORY = 8; // Keep last 8 beats for BPM averaging
  private currentBpm: number | null = null; // Stable BPM value
  
  // Debug logging (log status every ~60 frames ≈ 1 second at 60fps)
  private frameCounter = 0;
  private readonly DEBUG_LOG_INTERVAL = 60;
  
  // Throttling for UI updates (update atom every 2 frames = 30fps)
  private readonly UI_UPDATE_THROTTLE = 2;
  private uiUpdateCounter = 0;
  private lastAudioData: AudioLightingData | null = null;
  private readonly VALUE_CHANGE_THRESHOLD = 0.01; // Only update if values changed by >1%

  constructor(config?: Partial<AudioConfig>) {
    // Merge with defaults, ensuring frequencyBands.ranges exists
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      frequencyBands: config?.frequencyBands?.ranges
        ? { bandCount: config.frequencyBands.bandCount ?? 3, ranges: config.frequencyBands.ranges }
        : DEFAULT_CONFIG.frequencyBands
    };
    console.log('AudioCaptureManager initialized');
  }

  /**
   * Start audio capture from the specified device (or default)
   */
  async start(deviceId?: string): Promise<void> {
    if (this.isCapturing) {
      console.warn('AudioCaptureManager is already capturing');
      return;
    }

    try {
      console.log('Starting audio capture...', deviceId ? `device: ${deviceId}` : 'default device');
      
      // Request microphone access
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true
      };
      
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Microphone access granted');
      
      // Create Web Audio API context
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.config.fftSize;
      this.analyser.smoothingTimeConstant = 0; // No built-in smoothing - use custom smoothing instead
      
      // Connect stream to analyser
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      
      console.log(`Audio context created (sample rate: ${this.audioContext.sampleRate}Hz, FFT size: ${this.analyser.fftSize})`);
      
      this.isCapturing = true;
      this.frameIndex = 0;
      
      // Start analysis loop
      this.analyzeAudio();
      
      console.log('Audio capture started successfully');
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Microphone permission denied. Please allow microphone access in your browser settings.');
        } else if (error.name === 'NotFoundError') {
          // Device may have been disconnected
          if (deviceId) {
            throw new Error(`Audio device not found. The saved device is no longer connected. Please select a different device in Audio Settings.`);
          } else {
            throw new Error('No microphone found. Please connect a microphone and try again.');
          }
        } else if (error.name === 'NotReadableError') {
          throw new Error('Audio device is already in use by another application. Please close other applications using the microphone.');
        } else if (error.name === 'OverconstrainedError') {
          throw new Error(`Audio device constraints cannot be satisfied. The selected device may not support the required settings.`);
        }
        // For other DOMException errors, include the error name and message
        throw new Error(`${error.name}: ${error.message}`);
      }
      
      // For non-DOMException errors, preserve the original error
      throw error;
    }
  }

  /**
   * Stop audio capture and clean up resources
   */
  stop(): void {
    if (!this.isCapturing) {
      console.warn('AudioCaptureManager is not capturing');
      return;
    }

    console.log('Stopping audio capture...');
    
    // Clear audio data atom
    store.set(audioDataAtom, null);
    
    // Cancel animation frame
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Disconnect and stop stream
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
    this.isCapturing = false;
    
    // Reset state
    this.smoothedRanges.clear();
    this.smoothedEnergy = 0;
    this.energyHistory = [];
    this.recentEnergyHistory = [];
    this.bassEnergyHistory = [];
    this.spectralFluxHistory = [];
    this.previousSpectrum = null;
    this.frameIndex = 0;
    this.beatTimestamps = [];
    this.currentBpm = null;
    this.uiUpdateCounter = 0;
    this.lastAudioData = null;
    
    console.log('Audio capture stopped');
  }

  /**
   * Get list of available audio input devices
   */
  async getDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      console.log(`Found ${audioInputs.length} audio input devices`);
      return audioInputs;
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      return [];
    }
  }

  /**
   * Update configuration
   * This is called when config changes while audio is running
   */
  updateConfig(config: Partial<AudioConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };
    
    // Update analyser if active and FFT size changed
    if (this.analyser && config.fftSize && config.fftSize !== oldConfig.fftSize) {
      this.analyser.fftSize = config.fftSize;
      console.log(`Updated FFT size to ${config.fftSize}`);
    }
    
    // Log config update for debugging
    console.log('AudioCaptureManager configuration updated:', {
      sensitivity: config.sensitivity !== undefined ? config.sensitivity : 'unchanged',
      smoothing: config.smoothing !== undefined ? config.smoothing : 'unchanged',
      beatDetection: config.beatDetection !== undefined ? config.beatDetection : 'unchanged',
      frequencyBands: config.frequencyBands !== undefined ? `ranges: ${config.frequencyBands.ranges.length}` : 'unchanged',
      fftSize: config.fftSize !== undefined ? config.fftSize : 'unchanged'
    });
  }

  /**
   * Main analysis loop - runs at ~60fps
   * UI updates are throttled to 30fps to reduce React re-rendering
   */
  private analyzeAudio(): void {
    if (!this.analyser || !this.isCapturing) return;
    
    // Get frequency data from analyser (built-in FFT!)
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    // Calculate frequency bands
    const audioData = this.calculateFrequencyBands(dataArray);
    
    // Always send to main process via IPC (full frame rate)
    window.electron.ipcRenderer.send('audio:data', audioData);
    
    // Throttle UI updates
    this.uiUpdateCounter++;
    const shouldUpdateUI = this.uiUpdateCounter >= this.UI_UPDATE_THROTTLE;
    
    if (shouldUpdateUI) {
      this.uiUpdateCounter = 0;
      
      // Only update atom if values changed significantly to avoid unnecessary re-renders
      if (this.shouldUpdateAtom(audioData)) {
        store.set(audioDataAtom, audioData);
        this.lastAudioData = audioData;
      }
    }
    
    // Debug logging - show status every second
    this.frameCounter++;
    if (this.frameCounter >= this.DEBUG_LOG_INTERVAL) {
      this.frameCounter = 0;
      console.log('Audio Capture Active:', {
        energy: audioData.energy.toFixed(3),
        range1: audioData.frequencyBands.range1.toFixed(3),
        range2: audioData.frequencyBands.range2.toFixed(3),
        range3: audioData.frequencyBands.range3.toFixed(3),
        range4: audioData.frequencyBands.range4.toFixed(3),
        range5: audioData.frequencyBands.range5.toFixed(3),
        beat: audioData.beatDetected ? 'YES' : 'no'
      });
    }
    
    // Continue loop
    this.animationFrameId = requestAnimationFrame(() => this.analyzeAudio());
  }
  
  /**
   * Check if atom should be updated based on value changes
   * Only updates if values changed significantly or beat detection changed
   */
  private shouldUpdateAtom(newData: AudioLightingData): boolean {
    if (!this.lastAudioData) {
      return true; // First update
    }
    
    // Always update if beat detection changed
    if (newData.beatDetected !== this.lastAudioData.beatDetected) {
      return true;
    }
    
    // Always update if BPM changed
    if (newData.bpm !== this.lastAudioData.bpm) {
      return true;
    }
    
    // Check if frequency bands changed significantly
    const range1Diff = Math.abs(newData.frequencyBands.range1 - this.lastAudioData.frequencyBands.range1);
    const range2Diff = Math.abs(newData.frequencyBands.range2 - this.lastAudioData.frequencyBands.range2);
    const range3Diff = Math.abs(newData.frequencyBands.range3 - this.lastAudioData.frequencyBands.range3);
    const range4Diff = Math.abs(newData.frequencyBands.range4 - this.lastAudioData.frequencyBands.range4);
    const range5Diff = Math.abs(newData.frequencyBands.range5 - this.lastAudioData.frequencyBands.range5);
    const energyDiff = Math.abs(newData.energy - this.lastAudioData.energy);
    
    // Update if any value changed by more than threshold
    return range1Diff > this.VALUE_CHANGE_THRESHOLD ||
           range2Diff > this.VALUE_CHANGE_THRESHOLD ||
           range3Diff > this.VALUE_CHANGE_THRESHOLD ||
           range4Diff > this.VALUE_CHANGE_THRESHOLD ||
           range5Diff > this.VALUE_CHANGE_THRESHOLD ||
           energyDiff > this.VALUE_CHANGE_THRESHOLD;
  }

  /**
   * Calculate frequency bands from FFT data
   * Dynamically calculates energy for all configured frequency ranges
   */
  private calculateFrequencyBands(frequencyData: Uint8Array): AudioLightingData {
    if (!this.audioContext || !this.analyser) {
      throw new Error('Audio context not initialized');
    }

    const sampleRate = this.audioContext.sampleRate;
    const fftSize = this.analyser.fftSize;
    const binSize = sampleRate / fftSize;
    
    // Get configured ranges (default to DEFAULT_RANGES if not set)
    const ranges = this.config.frequencyBands?.ranges || DEFAULT_RANGES;
    
    // Calculate energy for each configured range
    const rangeEnergies: Map<string, number> = new Map();
    for (const range of ranges) {
      const energy = this.getEnergyInRange(
        frequencyData,
        binSize,
        range.minHz,
        range.maxHz
      );
      rangeEnergies.set(range.id, energy);
    }
    
    // Calculate overall energy
    let totalEnergy = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      totalEnergy += frequencyData[i];
    }
    const overallEnergy = Math.min((totalEnergy / frequencyData.length / 255) * 2, 1.0);
    
    // Apply global sensitivity first, then per-range sensitivity
    const scaledEnergies: Map<string, number> = new Map();
    for (const range of ranges) {
      const energy = rangeEnergies.get(range.id) || 0;
      // Apply global sensitivity first
      const globallyScaled = energy * this.config.sensitivity;
      // Then apply per-range sensitivity (0-1 multiplier)
      const rangeSensitivity = range.sensitivity ?? 1.0;
      scaledEnergies.set(range.id, Math.min(globallyScaled * rangeSensitivity, 1.0));
    }
    const scaledEnergy = Math.min(overallEnergy * this.config.sensitivity, 1.0);
    
    // Apply smoothing if enabled
    const finalEnergies: Map<string, number> = new Map();
    let finalEnergy = scaledEnergy;
    
    if (this.config.smoothing.enabled) {
      const alpha = this.config.smoothing.alpha;
      for (const [rangeId, scaledEnergy] of scaledEnergies.entries()) {
        const previousSmoothed = this.smoothedRanges.get(rangeId) || 0;
        const smoothed = alpha * scaledEnergy + (1 - alpha) * previousSmoothed;
        this.smoothedRanges.set(rangeId, smoothed);
        finalEnergies.set(rangeId, smoothed);
      }
      this.smoothedEnergy = alpha * scaledEnergy + (1 - alpha) * this.smoothedEnergy;
      finalEnergy = this.smoothedEnergy;
    } else {
      // No smoothing - use scaled values directly
      for (const [rangeId, scaledEnergy] of scaledEnergies.entries()) {
        finalEnergies.set(rangeId, scaledEnergy);
      }
    }
    
    // Beat detection
    const bassEnergy = finalEnergies.get('range1') || 0;
    const { beatDetected, bpm } = this.detectBeat({
      finalEnergy,
      bassEnergy,
      spectrumData: frequencyData,
      binSize
    });
    
    // Calculate overall level (RMS of all ranges)
    const rangeValues = Array.from(finalEnergies.values());
    const sumOfSquares = rangeValues.reduce((sum, val) => sum + val * val, 0);
    const overallLevel = Math.sqrt(sumOfSquares / rangeValues.length);
    
    this.frameIndex++;
    
    // Map final energies to range1-range5 structure
    // Ensure we always have exactly 5 ranges (use 0 if range not configured)
    const frequencyBands = {
      range1: finalEnergies.get('range1') || 0,
      range2: finalEnergies.get('range2') || 0,
      range3: finalEnergies.get('range3') || 0,
      range4: finalEnergies.get('range4') || 0,
      range5: finalEnergies.get('range5') || 0
    };
    
    // Return processed audio data
    return {
      timestamp: Date.now(),
      overallLevel,
      bpm,
      beatDetected,
      frequencyBands,
      energy: finalEnergy
    };
  }

  /**
   * Get energy level in a specific frequency range
   */
  private getEnergyInRange(
    frequencyData: Uint8Array,
    binSize: number,
    startHz: number,
    endHz: number
  ): number {
    const startBin = Math.floor(startHz / binSize);
    const endBin = Math.ceil(endHz / binSize);
    
    let energy = 0;
    let count = 0;
    
    for (let i = startBin; i < Math.min(endBin, frequencyData.length); i++) {
      energy += frequencyData[i] / 255; // Normalize to 0-1
      count++;
    }
    
    return count > 0 ? Math.min(energy / count, 1.0) : 0;
  }

  /**
   * Detect beats in the audio using adaptive energy + spectral flux analysis
   */
  private detectBeat(params: {
    finalEnergy: number;
    bassEnergy: number;
    spectrumData: Uint8Array;
    binSize: number;
  }): { beatDetected: boolean; bpm: number | null } {
    const { finalEnergy, bassEnergy, spectrumData, binSize } = params;
    
    // Maintain energy history (used for adaptive threshold)
    this.energyHistory.push(finalEnergy);
    if (this.energyHistory.length > this.ENERGY_HISTORY_SIZE) {
      this.energyHistory.shift();
    }
    const energyStats = this.computeStats(this.energyHistory);
    
    // Maintain short-term energy window (captures quick punches)
    this.recentEnergyHistory.push(finalEnergy);
    if (this.recentEnergyHistory.length > this.SHORT_ENERGY_HISTORY_SIZE) {
      this.recentEnergyHistory.shift();
    }
    const shortEnergyStats = this.computeStats(this.recentEnergyHistory);
    
    // Track bass history separately so low-frequency punches can trigger beats even when mids/highs dominate
    this.bassEnergyHistory.push(bassEnergy);
    if (this.bassEnergyHistory.length > this.ENERGY_HISTORY_SIZE) {
      this.bassEnergyHistory.shift();
    }
    const avgBass = this.bassEnergyHistory.length > 0
      ? this.bassEnergyHistory.reduce((sum, value) => sum + value, 0) / this.bassEnergyHistory.length
      : 0;
    
    // Compute spectral flux (positive changes in spectrum focused on <2kHz)
    const spectralFlux = this.computeSpectralFlux(spectrumData, binSize);
    const fluxStats = this.computeStats(this.spectralFluxHistory);
    const fluxSensitivity = 0.35 + this.config.beatDetection.threshold * 0.6; // lower threshold => smaller multiplier
    const fluxThreshold = fluxStats.mean + fluxStats.stdDev * fluxSensitivity;
    const hasFluxHistory = fluxStats.count >= 4;
    const fluxGate = hasFluxHistory ? spectralFlux > fluxThreshold : false;
    
    // Update spectral flux history after computing gate
    this.spectralFluxHistory.push(spectralFlux);
    if (this.spectralFluxHistory.length > this.SPECTRAL_HISTORY_SIZE) {
      this.spectralFluxHistory.shift();
    }
    
    // Adaptive thresholds for energy & bass
    const dynamicEnergyMultiplier = 0.35 + this.config.beatDetection.threshold * 0.45;
    const dynamicEnergyThreshold = energyStats.mean + energyStats.stdDev * dynamicEnergyMultiplier;
    const minEnergyGate = Math.max(this.MINIMUM_ENERGY_FOR_BEAT, dynamicEnergyThreshold);
    const energyGate = finalEnergy > minEnergyGate;
    
    const bassMultiplier = 1 + this.config.beatDetection.threshold * 0.75;
    const bassBaseline = avgBass > 0 ? avgBass * bassMultiplier : this.MINIMUM_ENERGY_FOR_BEAT * 0.5;
    const bassGate = bassEnergy > bassBaseline;
    
    // Capture short, sharp increases in energy to avoid missing transient beats
    const shortTermGate = shortEnergyStats.count >= 4
      ? finalEnergy > shortEnergyStats.mean * (1.05 + this.config.beatDetection.threshold * 0.3)
      : false;
    
    const previousEnergy = this.energyHistory.length > 1
      ? this.energyHistory[this.energyHistory.length - 2]
      : finalEnergy;
    const energyDelta = finalEnergy - previousEnergy;
    const derivativeGate = energyDelta > (energyStats.stdDev * (0.3 + this.config.beatDetection.threshold * 0.25) + 0.01);
    
    const combinedEnergyGate = energyGate || shortTermGate || derivativeGate;
    
    // Final detection: spectral onset + (overall energy OR bass punch) + debounce
    let beatDetected = false;
    const now = Date.now();
    const timeSinceLastBeat = now - this.lastBeatTime;
    
    if (
      (
        (fluxGate && (combinedEnergyGate || bassGate)) ||
        ((shortTermGate || derivativeGate) && bassGate)
      ) &&
      timeSinceLastBeat > this.config.beatDetection.minInterval
    ) {
      beatDetected = true;
      this.lastBeatTime = now;
      
      // Track beat timestamp for BPM calculation
      this.beatTimestamps.push(now);
      if (this.beatTimestamps.length > this.MAX_BEAT_HISTORY) {
        this.beatTimestamps.shift();
      }
      
      // Calculate BPM from intervals between beats
      if (this.beatTimestamps.length >= 4) {
        const intervals: number[] = [];
        for (let i = 1; i < this.beatTimestamps.length; i++) {
          intervals.push(this.beatTimestamps[i] - this.beatTimestamps[i - 1]);
        }
        const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
        const calculatedBpm = Math.round(60000 / avgInterval);
        if (calculatedBpm >= 40 && calculatedBpm <= 200) {
          this.currentBpm = calculatedBpm;
        }
      }
    }
    
    if (this.config.smoothing.enabled) {
      this.smoothedEnergy *= this.config.beatDetection.decayRate;
    }
    
    return { beatDetected, bpm: this.currentBpm };
  }
  
  /**
   * Compute spectral flux focused on low-frequency bins
   */
  private computeSpectralFlux(spectrumData: Uint8Array, binSize: number): number {
    const invByteMax = 1 / 255;
    const length = spectrumData.length;
    const hadPrevious = this.previousSpectrum && this.previousSpectrum.length === length;
    
    if (!hadPrevious) {
      this.previousSpectrum = new Float32Array(length);
    }
    
    if (!hadPrevious || !this.previousSpectrum) {
      for (let i = 0; i < length; i++) {
        this.previousSpectrum![i] = spectrumData[i] * invByteMax;
      }
      return 0;
    }
    
    const maxBin = Math.min(length, Math.max(1, Math.floor(this.MAX_BEAT_FREQUENCY / binSize)));
    let flux = 0;
    
    for (let i = 0; i < maxBin; i++) {
      const current = spectrumData[i] * invByteMax;
      const diff = current - this.previousSpectrum[i];
      if (diff > 0) {
        const emphasis = 1 - (i / maxBin) * 0.4; // weight bass slightly higher
        flux += diff * emphasis;
      }
      this.previousSpectrum[i] = current;
    }
    
    // Keep remaining bins in sync to avoid stale data if FFT window changes
    for (let i = maxBin; i < length; i++) {
      this.previousSpectrum[i] = spectrumData[i] * invByteMax;
    }
    
    return flux;
  }
  
  /**
   * Utility to compute mean & std dev for adaptive thresholds
   */
  private computeStats(values: number[]): { mean: number; stdDev: number; count: number } {
    const count = values.length;
    if (count === 0) {
      return { mean: 0, stdDev: 0, count };
    }
    
    const mean = values.reduce((sum, value) => sum + value, 0) / count;
    const variance = values.reduce((sum, value) => {
      const diff = value - mean;
      return sum + diff * diff;
    }, 0) / count;
    
    return { mean, stdDev: Math.sqrt(variance), count };
  }

  /**
   * Check if audio is currently being captured
   */
  isActive(): boolean {
    return this.isCapturing;
  }
}

