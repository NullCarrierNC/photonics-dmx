import { ConfigurationManager } from '../../services/configuration/ConfigurationManager';
import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager';
import { Sequencer } from './sequencer/Sequencer';

export class ControllerManager {
  private config: ConfigurationManager;
  private dmxLightManager: DmxLightManager | null = null;
  private sequencer: Sequencer | null = null;

  constructor() {
    this.config = new ConfigurationManager();
    // lazy initialization for other controllers
  }

  /**
   * Initialize all controllers and systems
   */
  public async init(): Promise<void> {
    // Initialize controllers in the right order
    await this.initializeDmxManager();
    await this.initializeLightingSystem();
    await this.initializeListeners();
  }
  
  private async initializeDmxManager(): Promise<void> {
    // Initialize DMX manager
  }
  
  private async initializeLightingSystem(): Promise<void> {
    // Initialize lighting system
  }
  
  private async initializeListeners(): Promise<void> {
    // Initialize network listeners
  }
  
  public async shutdown(): Promise<void> {
    // Shutdown in reverse order
  }

  /**
   * Get the configuration manager
   */
  public getConfig(): ConfigurationManager {
    return this.config;
  }

  /**
   * Get the DMX light manager
   */
  public getDmxLightManager(): DmxLightManager | null {
    return this.dmxLightManager;
  }

  /**
   * Get the sequencer
   */
  public getLightingSequencer(): Sequencer | null {
    return this.sequencer;
  }
}
