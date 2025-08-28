/**
 * ProcessorManager - Manages event processors for different handling modes
 * 
 * This manager can switch between different event processors (direct mode,
 * traditional cue mode, hybrid mode) and manages their lifecycle.
 */
import { EventEmitter } from 'events';
import { Rb3StageKitDirectProcessor } from './Rb3StageKitDirectProcessor';
import { Rb3CueBasedProcessor } from './Rb3CueBasedProcessor';
import { DmxLightManager } from '../controllers/DmxLightManager';
import { ILightingController } from '../controllers/sequencer/interfaces';
import { AbstractCueHandler } from '../cueHandlers/AbstractCueHandler';
import { StageKitConfig } from '../listeners/RB3/StageKitTypes';
import { CueData } from '../cues/cueTypes';

/**
 * Available processing modes
 * 
 * Note: Only one mode can be active at a time to prevent conflicting DMX light states
 */
export type ProcessingMode = 'direct' | 'cueBased';

/**
 * Configuration for the processor manager
 */
export interface ProcessorManagerConfig {
  mode: ProcessingMode;
  stageKitConfig?: Partial<StageKitConfig>;
  debug?: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_PROCESSOR_CONFIG: ProcessorManagerConfig = {
  mode: 'direct',
  stageKitConfig: {},
  debug: false
};

export class ProcessorManager extends EventEmitter {
  private currentMode: ProcessingMode = 'direct';
  private networkListener: EventEmitter | null = null;
  
  // Processors
  private stageKitDirectProcessor: Rb3StageKitDirectProcessor | null = null;
  private cueProcessor: Rb3CueBasedProcessor | null = null;
  
  // Dependencies
  private lightManager: DmxLightManager;
  private photonicsSequencer: ILightingController;
  private cueHandler: AbstractCueHandler | null = null;
  
  // Configuration
  private config: ProcessorManagerConfig;

  constructor(
    lightManager: DmxLightManager,
    photonicsSequencer: ILightingController,
    config: Partial<ProcessorManagerConfig> = {}
  ) {
    super();
    this.lightManager = lightManager;
    this.photonicsSequencer = photonicsSequencer;
    this.config = { ...DEFAULT_PROCESSOR_CONFIG, ...config };
    
    // Validate that only one mode is specified to prevent conflicts
    if (config.mode && !['direct', 'cueBased'].includes(config.mode)) {
      throw new Error(`Invalid mode: ${config.mode}. Only 'direct' or 'cueBased' modes are supported.`);
    }
    
    console.log('ProcessorManager initialized with config:', this.config);
  }

  /**
   * Set the network listener to process events from
   */
  public setNetworkListener(networkListener: EventEmitter): void {
    console.log('ProcessorManager: setNetworkListener called with:', networkListener.constructor.name);
    console.log('ProcessorManager: Current mode is:', this.currentMode);
    
    // Stop listening to previous listener if any
    if (this.networkListener) {
      console.log('ProcessorManager: Stopping previous processors...');
      this.stopAllProcessors();
    }
    
    this.networkListener = networkListener;
    console.log('ProcessorManager: Network listener set');
    
    // Start processors based on current mode
    console.log('ProcessorManager: Starting processors for mode:', this.currentMode);
    this.startProcessors();
    
    console.log('ProcessorManager: Network listener set and processors started');
  }

  /**
   * Set the cue handler for cue-based mode
   */
  public setCueHandler(cueHandler: AbstractCueHandler): void {
    this.cueHandler = cueHandler;
    
    // Recreate traditional processor if it exists
    if (this.cueProcessor) {
      this.cueProcessor.destroy();
      this.cueProcessor = new Rb3CueBasedProcessor(cueHandler);
      
      // Listen for cue data events from the processor
      this.cueProcessor.on('cueHandled', (cueData: CueData) => {
        this.emitCueData(cueData);
      });
      
      if (this.networkListener && this.currentMode !== 'direct') {
        this.cueProcessor.startListening(this.networkListener);
      }
    }
    
    console.log('ProcessorManager: Cue handler set');
  }

  /**
   * Switch processing mode
   */
  public switchMode(mode: ProcessingMode): void {
    if (mode === this.currentMode) {
      console.log(`ProcessorManager: Already in ${mode} mode`);
      return;
    }

    console.log(`ProcessorManager: Switching from ${this.currentMode} to ${mode} mode`);
    
    // Stop current processors
    this.stopAllProcessors();
    
    // Update mode
    this.currentMode = mode;
    this.config.mode = mode;
    
    // Start new processors
    this.startProcessors();
    
    // Emit mode change event
    this.emit('modeChanged', { mode, timestamp: Date.now() });
    
    console.log(`ProcessorManager: Successfully switched to ${mode} mode`);
  }

  /**
   * Get current processing mode
   */
  public getCurrentMode(): ProcessingMode {
    return this.currentMode;
  }

  /**
   * Update StageKit configuration
   */
  public updateStageKitConfig(stageKitConfig: Partial<StageKitConfig>): void {
    this.config.stageKitConfig = { ...this.config.stageKitConfig, ...stageKitConfig };
    
    // Update StageKit processor if it exists
    if (this.stageKitDirectProcessor) {
      this.stageKitDirectProcessor.updateConfig(stageKitConfig);
    }
    
    console.log('ProcessorManager: StageKit config updated:', this.config.stageKitConfig);
  }

  /**
   * Get current configuration
   */
  public getConfig(): ProcessorManagerConfig {
    return { ...this.config };
  }

  /**
   * Start processors based on current mode
   */
  private startProcessors(): void {
    if (!this.networkListener) {
      console.warn('ProcessorManager: No network listener set, cannot start processors');
      return;
    }

    // Set up event listeners for processors
    this.setupProcessorEventListeners();

    switch (this.currentMode) {
      case 'direct':
        this.startDirectMode();
        break;
      case 'cueBased':
        this.startCueBasedMode();
        break;
      default:
        console.error(`ProcessorManager: Unknown mode: ${this.currentMode}`);
    }
  }

  /**
   * Start direct mode (StageKitDirectProcessor only)
   */
  private startDirectMode(): void {
    console.log('ProcessorManager: Starting direct mode...');
    
    if (!this.stageKitDirectProcessor) {
      console.log('ProcessorManager: Creating new StageKitDirectProcessor...');
      this.stageKitDirectProcessor = new Rb3StageKitDirectProcessor(
        this.lightManager,
        this.photonicsSequencer,
        this.config.stageKitConfig
      );
      console.log('ProcessorManager: StageKitDirectProcessor created successfully');
    } else {
      console.log('ProcessorManager: Using existing StageKitDirectProcessor');
    }
    
    // Listen for cue data events from the processor
    this.stageKitDirectProcessor.on('cueHandled', (cueData: CueData) => {
      this.emitCueData(cueData);
    });
    
    console.log('ProcessorManager: Starting StageKitDirectProcessor listening...');
    this.stageKitDirectProcessor.startListening(this.networkListener!);
    console.log('ProcessorManager: Direct mode started');
  }

  /**
   * Start cue-based mode
   */
  private startCueBasedMode(): void {
    if (!this.cueHandler) {
      console.error('ProcessorManager: Cannot start cue-based mode without cue handler');
      return;
    }
    
    if (!this.cueProcessor) {
      this.cueProcessor = new Rb3CueBasedProcessor(this.cueHandler);
    }
    
    // Listen for cue data events from the processor
    this.cueProcessor.on('cueHandled', (cueData: CueData) => {
      this.emitCueData(cueData);
    });
    
    this.cueProcessor.startListening(this.networkListener!);
    console.log('ProcessorManager: Cue-based mode started');
  }

  /**
   * Stop all processors
   */
  private stopAllProcessors(): void {
    if (this.networkListener) {
      if (this.stageKitDirectProcessor) {
        this.stageKitDirectProcessor.stopListening(this.networkListener);
      }
      if (this.cueProcessor) {
        this.cueProcessor.stopListening(this.networkListener);
      }
    }
    
    console.log('ProcessorManager: All processors stopped');
  }

  /**
   * Get StageKit direct processor (for direct access if needed)
   */
  public getStageKitDirectProcessor(): Rb3StageKitDirectProcessor | null {
    return this.stageKitDirectProcessor;
  }

  /**
   * Get traditional cue processor (for direct access if needed)
   */
  public getCueBasedProcessor(): Rb3CueBasedProcessor | null {
    return this.cueProcessor;
  }

  /**
   * Check if a specific mode is active
   */
  public isModeActive(mode: ProcessingMode): boolean {
    return this.currentMode === mode;
  }

  /**
   * Get processor statistics
   */
  public getProcessorStats(): {
    currentMode: ProcessingMode;
    stageKitProcessorActive: boolean;
    traditionalProcessorActive: boolean;
    networkListenerActive: boolean;
  } {
    return {
      currentMode: this.currentMode,
      stageKitProcessorActive: !!this.stageKitDirectProcessor,
      traditionalProcessorActive: !!this.cueProcessor,
      networkListenerActive: !!this.networkListener
    };
  }

  /**
   * Set up event listeners for processors
   */
  private setupProcessorEventListeners(): void {
    // Set up event listeners for StageKit direct processor
    if (this.stageKitDirectProcessor) {
      this.stageKitDirectProcessor.on('cueHandled', (cueData: CueData) => {
        this.emitCueData(cueData);
      });
    }
    
    // Set up event listeners for cue-based processor
    if (this.cueProcessor) {
      this.cueProcessor.on('cueHandled', (cueData: CueData) => {
        this.emitCueData(cueData);
      });
    }
  }

  /**
   * Emit cue data for network debugging
   * @param cueData The cue data to emit
   */
  private emitCueData(cueData: CueData): void {
    // Emit the cue data for network debugging
    this.emit('cueHandled', cueData);
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    // Stop all processors
    this.stopAllProcessors();
    
    // Destroy processors
    if (this.stageKitDirectProcessor) {
      this.stageKitDirectProcessor.destroy();
      this.stageKitDirectProcessor = null;
    }
    
    if (this.cueProcessor) {
      this.cueProcessor.destroy();
      this.cueProcessor = null;
    }
    
    // Remove all listeners
    this.removeAllListeners();
    
    console.log('ProcessorManager destroyed');
  }
}
