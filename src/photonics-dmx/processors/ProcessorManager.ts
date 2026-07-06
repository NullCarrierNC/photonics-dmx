/**
 * ProcessorManager - Manages RB3E direct StageKit processing
 *
 * This manager owns the RB3E direct StageKit processor lifecycle.
 */
import { EventEmitter } from 'events'
import { Rb3StageKitDirectProcessor } from './Rb3StageKitDirectProcessor'
import { Rb3StageKitCueProcessor } from './Rb3StageKitCueProcessor'
import { ChainFanout } from '../controllers/ChainFanout'
import { StageKitConfig } from '../listeners/RB3/StageKitTypes'
import { CueData } from '../cues/types/cueTypes'
import { Rb3MenuCueDispatch } from '../cueHandlers/Rb3MenuCueHandler'
import type { YargCueRuntime } from '../listeners/YARG/YargNetworkListener'
import { createLogger } from '../../shared/logger'
const log = createLogger('ProcessorManager')

/**
 * Available processing modes. 'direct' drives the DMX sequencer straight from StageKit packets;
 * 'cue' dispatches an always-active RB3 gameplay cue so node cues react to the LED state.
 */
export type ProcessingMode = 'direct' | 'cue'

/**
 * Configuration for the processor manager
 */
export interface ProcessorManagerConfig {
  mode: ProcessingMode
  stageKitConfig?: Partial<StageKitConfig>
  debug?: boolean
  /** Cue-mode dispatch surface. Defaults to the chain fanout; the coordinator passes the RB3
   *  runtime so cue mode drives the RB3 handler slot, and the laser branch wraps it with its tee. */
  cueRuntime?: YargCueRuntime
}

/**
 * Default configuration
 */
export const DEFAULT_PROCESSOR_CONFIG: ProcessorManagerConfig = {
  mode: 'direct',
  stageKitConfig: {},
  debug: false,
}

export class ProcessorManager extends EventEmitter {
  private networkListener: EventEmitter | null = null

  private stageKitDirectProcessor: Rb3StageKitDirectProcessor | null = null
  private stageKitCueProcessor: Rb3StageKitCueProcessor | null = null

  private readonly chainFanout: ChainFanout
  private cueHandler: Rb3MenuCueDispatch | null = null

  private config: ProcessorManagerConfig

  constructor(chainFanout: ChainFanout, config: Partial<ProcessorManagerConfig> = {}) {
    super()
    this.chainFanout = chainFanout
    this.config = { ...DEFAULT_PROCESSOR_CONFIG, ...config }

    log.info('ProcessorManager initialized with config:', this.config)
  }

  /**
   * Set the network listener to process events from
   */
  public setNetworkListener(networkListener: EventEmitter): void {
    log.info('ProcessorManager: setNetworkListener called with:', networkListener.constructor.name)

    // Stop listening to previous listener if any
    if (this.networkListener) {
      log.info('ProcessorManager: Stopping previous processors...')
      this.stopAllProcessors()
    }

    this.networkListener = networkListener

    log.info('ProcessorManager: Starting processors for mode:', this.config.mode)
    this.startProcessors()
  }

  /**
   * Set the cue handler used for RB3 menu animation.
   */
  public setCueHandler(cueHandler: Rb3MenuCueDispatch): void {
    this.cueHandler = cueHandler
    if (this.stageKitDirectProcessor) {
      this.stageKitDirectProcessor.setCueHandler(cueHandler)
    }

    log.info('ProcessorManager: Cue handler set')
  }

  /**
   * Get current processing mode
   */
  public getCurrentMode(): ProcessingMode {
    return this.config.mode
  }

  /**
   * Update StageKit configuration
   */
  public updateStageKitConfig(stageKitConfig: Partial<StageKitConfig>): void {
    this.config.stageKitConfig = { ...this.config.stageKitConfig, ...stageKitConfig }

    // Update StageKit processor if it exists
    if (this.stageKitDirectProcessor) {
      this.stageKitDirectProcessor.updateConfig(stageKitConfig)
    }

    log.info('ProcessorManager: StageKit config updated:', this.config.stageKitConfig)
  }

  /**
   * Get current configuration
   */
  public getConfig(): ProcessorManagerConfig {
    return { ...this.config }
  }

  /**
   * Start processors based on current mode
   */
  private startProcessors(): void {
    if (!this.networkListener) {
      log.warn('ProcessorManager: No network listener set, cannot start processors')
      return
    }

    // Set up event listeners for processors
    this.setupProcessorEventListeners()

    if (this.config.mode === 'cue') {
      this.startCueMode()
    } else {
      this.startDirectMode()
    }
  }

  /**
   * Start direct mode (StageKitDirectProcessor only)
   */
  private startDirectMode(): void {
    log.info('ProcessorManager: Starting direct mode...')

    if (!this.stageKitDirectProcessor) {
      log.info('ProcessorManager: Creating new StageKitDirectProcessor...')
      this.stageKitDirectProcessor = new Rb3StageKitDirectProcessor(
        this.chainFanout,
        this.config.stageKitConfig,
        this.cueHandler, // Pass cue handler for menu state handling
      )
      log.info('ProcessorManager: StageKitDirectProcessor created successfully')
    } else {
      log.info('ProcessorManager: Using existing StageKitDirectProcessor')
      // Update cue handler if it has changed
      if (this.cueHandler && this.stageKitDirectProcessor) {
        this.stageKitDirectProcessor.setCueHandler(this.cueHandler)
      }
    }

    // Listen for cue data events from the processor
    this.stageKitDirectProcessor.on('cueHandled', (cueData: CueData) => {
      this.emitCueData(cueData)
    })

    log.info('ProcessorManager: Starting StageKitDirectProcessor listening...')
    this.stageKitDirectProcessor.startListening(this.networkListener!)
    log.info('ProcessorManager: Direct mode started')
  }

  /**
   * Start cue mode: turn the StageKit packet stream into RB3 node-cue dispatches. The processor
   * dispatches through the RB3 cue runtime (the coordinator's RB3 handler fanout, or the chain
   * fanout as a fallback), and the chain fanout dispatches the menu look to each rig.
   */
  private startCueMode(): void {
    log.info('ProcessorManager: Starting cue mode...')

    if (!this.stageKitCueProcessor) {
      this.stageKitCueProcessor = new Rb3StageKitCueProcessor(
        this.config.cueRuntime ?? this.chainFanout,
        { menuDispatch: this.chainFanout },
      )
    }
    this.stageKitCueProcessor.startListening(this.networkListener!)
    log.info('ProcessorManager: Cue mode started')
  }

  /**
   * Stop all processors
   */
  private stopAllProcessors(): void {
    if (this.networkListener) {
      if (this.stageKitDirectProcessor) {
        this.stageKitDirectProcessor.stopListening(this.networkListener)
      }
      if (this.stageKitCueProcessor) {
        this.stageKitCueProcessor.stopListening()
      }
    }

    log.info('ProcessorManager: All processors stopped')
  }

  /**
   * Get StageKit direct processor (for direct access if needed)
   */
  public getStageKitDirectProcessor(): Rb3StageKitDirectProcessor | null {
    return this.stageKitDirectProcessor
  }

  /**
   * Check if a specific mode is active
   */
  public isModeActive(mode: ProcessingMode): boolean {
    return this.config.mode === mode
  }

  /**
   * Get processor statistics. `stageKitProcessorActive` reports whether the active mode's
   * processor has been constructed.
   */
  public getProcessorStats(): {
    currentMode: ProcessingMode
    stageKitProcessorActive: boolean
    networkListenerActive: boolean
  } {
    return {
      currentMode: this.config.mode,
      stageKitProcessorActive:
        this.config.mode === 'cue' ? !!this.stageKitCueProcessor : !!this.stageKitDirectProcessor,
      networkListenerActive: !!this.networkListener,
    }
  }

  /**
   * Set up event listeners for processors
   */
  private setupProcessorEventListeners(): void {
    // Set up event listeners for StageKit direct processor
    if (this.stageKitDirectProcessor) {
      this.stageKitDirectProcessor.on('cueHandled', (cueData: CueData) => {
        this.emitCueData(cueData)
      })
    }
  }

  /**
   * Emit cue data for network debugging
   * @param cueData The cue data to emit
   */
  private emitCueData(cueData: CueData): void {
    // Emit the cue data for network debugging
    this.emit('cueHandled', cueData)
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    // Stop all processors
    this.stopAllProcessors()

    // Destroy processors
    if (this.stageKitDirectProcessor) {
      this.stageKitDirectProcessor.destroy()
      this.stageKitDirectProcessor = null
    }
    if (this.stageKitCueProcessor) {
      this.stageKitCueProcessor.destroy()
      this.stageKitCueProcessor = null
    }

    // Remove all listeners
    this.removeAllListeners()

    log.info('ProcessorManager destroyed')
  }
}
