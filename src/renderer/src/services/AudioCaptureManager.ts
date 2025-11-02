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

import { AudioLightingData } from '../../../photonics-dmx/listeners/Audio/AudioTypes';
import { getDefaultStore } from 'jotai';
import { audioDataAtom } from '../atoms';

const store = getDefaultStore();

export interface AudioConfig {
  deviceId?: string;
  fftSize: number;
  sensitivity: number;
  smoothing: {
    enabled: boolean;
    alpha: number;
  };
  frequencyRanges: {
    bass: [number, number];
    mids: [number, number];
    highs: [number, number];
  };
  beatDetection: {
    threshold: number;
    decayRate: number;
    minInterval: number;
  };
}

const DEFAULT_CONFIG: AudioConfig = {
  fftSize: 2048,
  sensitivity: 1.0,
  smoothing: {
    enabled: true,
    alpha: 0.7
  },
  frequencyRanges: {
    bass: [20, 250],
    mids: [250, 4000],
    highs: [4000, 20000]
  },
  beatDetection: {
    threshold: 0.3,
    decayRate: 0.95,
    minInterval: 100
  }
};

export class AudioCaptureManager {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  private config: AudioConfig;
  private isCapturing = false;
  
  // Smoothing state
  private smoothedBass = 0;
  private smoothedMids = 0;
  private smoothedHighs = 0;
  private smoothedEnergy = 0;
  
  // Beat detection state
  private lastBeatTime = 0;
  private energyHistory: number[] = [];
  private readonly ENERGY_HISTORY_SIZE = 43; // ~1 second at 60fps
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
    this.config = { ...DEFAULT_CONFIG, ...config };
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
    this.smoothedBass = 0;
    this.smoothedMids = 0;
    this.smoothedHighs = 0;
    this.smoothedEnergy = 0;
    this.energyHistory = [];
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
      frequencyRanges: config.frequencyRanges !== undefined ? config.frequencyRanges : 'unchanged',
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
        bass: audioData.frequencyBands.bass.toFixed(3),
        mids: audioData.frequencyBands.mids.toFixed(3),
        highs: audioData.frequencyBands.highs.toFixed(3),
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
    const bassDiff = Math.abs(newData.frequencyBands.bass - this.lastAudioData.frequencyBands.bass);
    const midsDiff = Math.abs(newData.frequencyBands.mids - this.lastAudioData.frequencyBands.mids);
    const highsDiff = Math.abs(newData.frequencyBands.highs - this.lastAudioData.frequencyBands.highs);
    const energyDiff = Math.abs(newData.energy - this.lastAudioData.energy);
    
    // Update if any value changed by more than threshold
    return bassDiff > this.VALUE_CHANGE_THRESHOLD ||
           midsDiff > this.VALUE_CHANGE_THRESHOLD ||
           highsDiff > this.VALUE_CHANGE_THRESHOLD ||
           energyDiff > this.VALUE_CHANGE_THRESHOLD;
  }

  /**
   * Calculate frequency bands from FFT data
   */
  private calculateFrequencyBands(frequencyData: Uint8Array): AudioLightingData {
    if (!this.audioContext || !this.analyser) {
      throw new Error('Audio context not initialized');
    }

    const sampleRate = this.audioContext.sampleRate;
    const fftSize = this.analyser.fftSize;
    const binSize = sampleRate / fftSize;
    
    // Calculate energy in each frequency band
    const bassEnergy = this.getEnergyInRange(
      frequencyData,
      binSize,
      this.config.frequencyRanges.bass[0],
      this.config.frequencyRanges.bass[1]
    );
    
    const midsEnergy = this.getEnergyInRange(
      frequencyData,
      binSize,
      this.config.frequencyRanges.mids[0],
      this.config.frequencyRanges.mids[1]
    );
    
    const highsEnergy = this.getEnergyInRange(
      frequencyData,
      binSize,
      this.config.frequencyRanges.highs[0],
      this.config.frequencyRanges.highs[1]
    );
    
    // Calculate overall energy
    let totalEnergy = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      totalEnergy += frequencyData[i];
    }
    const overallEnergy = Math.min((totalEnergy / frequencyData.length / 255) * 2, 1.0);
    
    // Apply sensitivity
    const scaledBass = Math.min(bassEnergy * this.config.sensitivity, 1.0);
    const scaledMids = Math.min(midsEnergy * this.config.sensitivity, 1.0);
    const scaledHighs = Math.min(highsEnergy * this.config.sensitivity, 1.0);
    const scaledEnergy = Math.min(overallEnergy * this.config.sensitivity, 1.0);
    
    // Apply smoothing if enabled
    let finalBass = scaledBass;
    let finalMids = scaledMids;
    let finalHighs = scaledHighs;
    let finalEnergy = scaledEnergy;
    
    if (this.config.smoothing.enabled) {
      const alpha = this.config.smoothing.alpha;
      this.smoothedBass = alpha * scaledBass + (1 - alpha) * this.smoothedBass;
      this.smoothedMids = alpha * scaledMids + (1 - alpha) * this.smoothedMids;
      this.smoothedHighs = alpha * scaledHighs + (1 - alpha) * this.smoothedHighs;
      this.smoothedEnergy = alpha * scaledEnergy + (1 - alpha) * this.smoothedEnergy;
      
      finalBass = this.smoothedBass;
      finalMids = this.smoothedMids;
      finalHighs = this.smoothedHighs;
      finalEnergy = this.smoothedEnergy;
    }
    
    // Beat detection
    const { beatDetected, bpm } = this.detectBeat(finalEnergy);
    
    // Calculate overall level (RMS of all bands)
    const overallLevel = Math.sqrt((finalBass * finalBass + finalMids * finalMids + finalHighs * finalHighs) / 3);
    
    this.frameIndex++;
    
    // Return processed audio data
    return {
      timestamp: Date.now(),
      overallLevel,
      bpm,
      beatDetected,
      frequencyBands: {
        bass: finalBass,
        mids: finalMids,
        highs: finalHighs
      },
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
   * Detect beats in the audio
   */
  private detectBeat(energy: number): { beatDetected: boolean; bpm: number | null } {
    // Maintain energy history
    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.ENERGY_HISTORY_SIZE) {
      this.energyHistory.shift();
    }
    
    // Calculate average energy
    const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    
    // Detect beat if energy is significantly above average
    const now = Date.now();
    const timeSinceLastBeat = now - this.lastBeatTime;
    const beatThreshold = avgEnergy * (1 + this.config.beatDetection.threshold);
    
    let beatDetected = false;
    
    if (
      energy > beatThreshold &&
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
        // Calculate average interval between consecutive beats
        const intervals: number[] = [];
        for (let i = 1; i < this.beatTimestamps.length; i++) {
          intervals.push(this.beatTimestamps[i] - this.beatTimestamps[i - 1]);
        }
        
        // Average interval in milliseconds
        const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
        
        // Convert to BPM (60000 ms per minute / interval in ms)
        const calculatedBpm = Math.round(60000 / avgInterval);
        
        // Only update if BPM is in a reasonable range (40-200 BPM)
        if (calculatedBpm >= 40 && calculatedBpm <= 200) {
          this.currentBpm = calculatedBpm;
        }
      }
    }
    
    // Apply decay
    if (this.config.smoothing.enabled) {
      this.smoothedEnergy *= this.config.beatDetection.decayRate;
    }
    
    // Return stable BPM value (doesn't flicker on/off)
    return { beatDetected, bpm: this.currentBpm };
  }

  /**
   * Check if audio is currently being captured
   */
  isActive(): boolean {
    return this.isCapturing;
  }
}

