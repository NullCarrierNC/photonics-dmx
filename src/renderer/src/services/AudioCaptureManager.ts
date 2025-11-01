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
          throw new Error('No microphone found. Please connect a microphone and try again.');
        }
      }
      
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
   */
  updateConfig(config: Partial<AudioConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update analyser if active
    if (this.analyser && config.fftSize && config.fftSize !== this.analyser.fftSize) {
      this.analyser.fftSize = config.fftSize;
      console.log(`Updated FFT size to ${config.fftSize}`);
    }
  }

  /**
   * Main analysis loop - runs at ~60fps
   */
  private analyzeAudio(): void {
    if (!this.analyser || !this.isCapturing) return;
    
    // Get frequency data from analyser (built-in FFT!)
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    // Calculate frequency bands
    const audioData = this.calculateFrequencyBands(dataArray);
    
    // Update atom for preview component (stays in renderer - no IPC overhead!)
    store.set(audioDataAtom, audioData);
    
    // Send to main process via IPC for DMX light control
    window.electron.ipcRenderer.send('audio:data', audioData);
    
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

