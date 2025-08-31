import { ConfigurationManager } from '../../services/configuration/ConfigurationManager';
import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager';
import { Sequencer } from '../../photonics-dmx/controllers/sequencer/Sequencer';
import { DmxPublisher } from '../../photonics-dmx/controllers/DmxPublisher';
import { SenderManager } from '../../photonics-dmx/controllers/SenderManager';
import { YargNetworkListener } from '../../photonics-dmx/listeners/YARG/YargNetworkListener';
import { Rb3eNetworkListener } from '../../photonics-dmx/listeners/RB3/Rb3eNetworkListener';
import { YargCueHandler } from '../../photonics-dmx/cueHandlers/YargCueHandler';
import { Rb3CueHandler } from '../../photonics-dmx/cueHandlers/Rb3CueHandler';
import { ProcessorManager } from '../../photonics-dmx/processors/ProcessorManager';
import { BrowserWindow } from 'electron';

import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces';
import { SenderError } from '../../photonics-dmx/senders/BaseSender';
import { LightStateManager } from '../../photonics-dmx/controllers/sequencer/LightStateManager';
import { LightTransitionController } from '../../photonics-dmx/controllers/sequencer/LightTransitionController';
import { CueData, StrobeState, getCueTypeFromId } from '../../photonics-dmx/cues/cueTypes';
import { CueRegistry } from '../../photonics-dmx/cues/CueRegistry';
// Import all cue sets to register with registry
import '../../photonics-dmx/cues';

export class ControllerManager {
  private config: ConfigurationManager;
  private dmxLightManager: DmxLightManager | null = null;
  private lightStateManager: LightStateManager | null = null;
  private lightTransitionController: LightTransitionController | null = null;
  private sequencer: Sequencer | null = null;
  private effectsController: ILightingController | null = null;
  private dmxPublisher: DmxPublisher | null = null;
  private senderManager: SenderManager;
  
  private cueHandler: YargCueHandler | Rb3CueHandler | null = null;
  private yargListener: YargNetworkListener | null = null;
  private rb3eListener: Rb3eNetworkListener | null = null;
  private processorManager: ProcessorManager | null = null;
  
  private testEffectInterval: NodeJS.Timeout | null = null;
  private testVenueSize: 'NoVenue' | 'Small' | 'Large' = 'Large';
  private testBpm: number = 120;
  
  private isInitialized = false;
  private isYargEnabled = false;
  private isRb3Enabled = false;
  
  constructor() {
    this.config = new ConfigurationManager();
    this.senderManager = new SenderManager();
  }
  
  /**
   * Initialize all controllers and systems
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    
    await this.initializeDmxManager();
    await this.initializeSequencer();
    await this.initializeCueRegistry();
    await this.initializeListeners();
    
    this.isInitialized = true;
  }
  
  /**
   * Initialize the DMX Light Manager
   */
  private async initializeDmxManager(): Promise<void> {
    // Load configuration and set up DMX light manager
    const layout = this.config.getLightingLayout();
    if (!layout) {
      console.error("Cannot start controllers without a valid configuration.");
      return;
    }
    
    this.dmxLightManager = new DmxLightManager(layout);
  }
  
  /**
   * Initialize the lighting system
   */
  private async initializeSequencer(): Promise<void> {
    if (!this.dmxLightManager) return;
    
    // Create the sequencer components
    this.lightStateManager = new LightStateManager();
    this.lightTransitionController = new LightTransitionController(this.lightStateManager);
    this.sequencer = new Sequencer(this.lightTransitionController);
    this.effectsController = this.sequencer;
    
    // Set up DMX publisher
    this.dmxPublisher = new DmxPublisher(
      this.dmxLightManager,
      this.senderManager,
      this.lightStateManager
    );
    
    // Set up error handling
    this.senderManager.onSendError(this.handleSenderError);
  }
  
  /**
   * Initialize the CueRegistry with enabled groups from configuration
   */
  private async initializeCueRegistry(): Promise<void> {
    const registry = CueRegistry.getInstance();
    
    // Get enabled groups from configuration
    const enabledGroupIds = this.config.getEnabledCueGroups();
    if (enabledGroupIds) {
      registry.setEnabledGroups(enabledGroupIds);
      console.log('CueRegistry initialized with enabled groups:', enabledGroupIds);
    } else {
      // If no preference is set, enable all available groups
      const allGroups = registry.getAllGroups();
      registry.setEnabledGroups(allGroups);
      console.log('CueRegistry initialized with all groups (no preference set):', allGroups);
    }
    
    // Load cue consistency window from configuration
    const consistencyWindow = this.config.getCueConsistencyWindow();
    registry.setCueConsistencyWindow(consistencyWindow);
    console.log('CueRegistry initialized with consistency window:', consistencyWindow, 'ms');
  }
  
  /**
   * Initialize network listeners
   */
  private async initializeListeners(): Promise<void> {
    if (!this.dmxLightManager || !this.effectsController) return;
    
    const debouncePeriod = this.config.getPreference('effectDebounce');
    
    // Create cue handler (default to YARG)
    this.cueHandler = new YargCueHandler(
      this.dmxLightManager,
      this.effectsController,
      debouncePeriod
    );
  }
  
  /**
   * Handle sender errors
   */
  private handleSenderError = (error: SenderError): void => {
    console.error('Sender error:', error);
    
    // Notify the renderer process
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (mainWindow) {
      mainWindow.webContents.send('sender-error', error.err ? error.err.toString() : 'Unknown sender error');
    }else{
      console.error('handleSenderError: No main window found');
    }
  };
  
  /**
   * Start a test effect
   * @param effectId The effect ID to test
   * @param venueSize The venue size to use for testing
   * @param bpm The BPM to use for testing
   */
  public startTestEffect(effectId: string, venueSize?: 'NoVenue' | 'Small' | 'Large', bpm?: number): void {
    console.log(`ControllerManager.startTestEffect called with effectId: ${effectId}, venueSize: ${venueSize}, BPM: ${bpm}`);
    
    // If an existing test interval is running, clear it
    if (this.testEffectInterval) {
      clearInterval(this.testEffectInterval);
      this.testEffectInterval = null;
    }
    
    // Store the venue size and BPM for use in testCue
    this.testVenueSize = venueSize || 'Large';
    this.testBpm = bpm || 120;
    console.log(`Set testVenueSize to: ${this.testVenueSize}, testBpm to: ${this.testBpm}`);
    
    // If system is not initialized, initialize it first
    if (!this.isInitialized) {
      console.log("Initializing system before testing effect");
      this.init().then(() => {
        this.startTestEffectInternal(effectId);
      }).catch(error => {
        console.error("Error during initialization:", error);
      });
      return;
    }
    
    this.startTestEffectInternal(effectId);
  }
  
  /**
   * Actually starts the test effect
   */
  private startTestEffectInternal(effectId: string): void {
    // Check if we have the necessary components for testing
    if (!this.effectsController || !this.dmxLightManager) {
      console.error("Cannot test effect: lighting system not initialized");
      return;
    }
    
    // If no cue handler is set up, create one for testing purposes
    if (!this.cueHandler) {
      console.log("Creating temporary YARG cue handler for testing");
      const debouncePeriod = this.config.getPreference('effectDebounce');
      this.cueHandler = new YargCueHandler(
        this.dmxLightManager,
        this.effectsController,
        debouncePeriod
      );
    }
    
    // Create a new interval to test the effect
    this.testEffectInterval = setInterval(() => {
      this.testCue(effectId);
    }, 16); // ~60fps
  }
  
  /**
   * Stop the currently running test effect
   */
  public async stopTestEffect(): Promise<void> {
    if (this.testEffectInterval) {
      clearInterval(this.testEffectInterval);
      this.testEffectInterval = null;
    }
    
    if (this.effectsController) {
      await this.effectsController.blackout(0);
    }
  }
  
  /**
   * Test a specific cue
   * @param cueId The cue ID to test
   */
  private testCue(cueId: string): void {
    if (!this.cueHandler) {
      console.error("No cue handler available. Make sure YARG or RB3 is enabled.");
      return;
    }
    
    const cue = getCueTypeFromId(cueId);
    
    let strobe: StrobeState = 'Strobe_Off' as StrobeState;
    if (cueId.indexOf("Strobe") > -1) {
      strobe = cueId as StrobeState;
    }
    
    const data: CueData = {
      datagramVersion: 0,
      platform: 'Windows',
      currentScene: 'Gameplay',
      pauseState: 'Unpaused',
      venueSize: this.testVenueSize,
      beatsPerMinute: this.testBpm,
      songSection: 'Verse',
      guitarNotes: [],
      bassNotes: [],
      drumNotes: [],
      keysNotes: [],
      vocalNote: 0,
      harmony0Note: 0,
      harmony1Note: 0,
      harmony2Note: 0,
      lightingCue: cueId,
      postProcessing: 'Default',
      fogState: false,
      strobeState: strobe,
      performer: 0,
      autoGenTrack: false,
      beat: 'Off',
      keyframe: 'Off',
      bonusEffect: false,
      ledColor: '',
    };
    
    if (cue !== undefined) {
      try {
        this.cueHandler.handleCue(cue, data);
        
        // Emit cue-handled event for UI preview components
        const mainWindow = BrowserWindow.getFocusedWindow();
        if (mainWindow) {
          mainWindow.webContents.send('cue-handled', data);
        }
      } catch (error) {
        console.error("Error handling cue:", error);
      }
    } else {
      console.error("\n Test Cue Error: no cue for ID ", cueId);
    }
  }
  
  /**
   * Enable YARG listener
   */
  public enableYarg(): void {
    // Check if the system is initialized, initialize if needed
    if (!this.isInitialized) {
      console.log("Initializing system before enabling YARG");
      this.init().then(() => {
        // Continue with YARG initialization after system is ready
        this.enableYargInternal();
      }).catch(error => {
        console.error("Error during initialization:", error);
      });
      return;
    }
    
    this.enableYargInternal();
  }
  
  /**
   * Internal method to enable YARG without initialization checks
   */
  private enableYargInternal(): void {
    if (this.isYargEnabled || !this.effectsController || !this.dmxLightManager) {
      console.log("Cannot enable YARG: already enabled or missing required components");
      return;
    }
    
    // Disable Rb3 if it's enabled
    if (this.isRb3Enabled) {
      this.disableRb3();
    }
    
    // Shutdown existing cue handler to trigger lifecycle methods
    if (this.cueHandler) {
      this.cueHandler.shutdown();
    }
    
    const debouncePeriod = this.config.getPreference('effectDebounce');
    
    // Create YARG listener
    this.cueHandler = new YargCueHandler(
      this.dmxLightManager,
      this.effectsController,
      debouncePeriod
    );
    
    // Shut down existing listener if any
    this.yargListener?.shutdown();
    
    // Create new listener
    this.yargListener = new YargNetworkListener(this.cueHandler);
    
    // Start the listener
    this.yargListener.start();
    
    this.isYargEnabled = true;
    console.log("YARG listener enabled");
  }
  
  /**
   * Disable YARG listener
   */
  public async disableYarg(): Promise<void> {
    if (!this.isYargEnabled) return;
    
    // Clear all running effects before shutting down
    if (this.effectsController) {
      try {
        this.effectsController.removeAllEffects();
        // Use blackout for immediate light shutdown
        await this.effectsController.blackout(0); // Immediate blackout
        console.log('ControllerManager: Cleared all running effects and initiated blackout when disabling YARG');
      } catch (error) {
        console.error('Error clearing effects when disabling YARG:', error);
      }
    }
    
    if (this.yargListener) {
      this.yargListener.shutdown();
      this.yargListener = null;
    }
    
    // Shutdown cue handler to trigger lifecycle methods
    if (this.cueHandler) {
      this.cueHandler.shutdown();
    }
    
    this.isYargEnabled = false;
  }
  
  /**
   * Enable Rb3 listener
   */
  public async enableRb3(): Promise<void> {
    // Check if the system is initialized, initialize if needed
    if (!this.isInitialized) {
      console.log("Initializing system before enabling RB3");
      this.init().then(() => {
        // Continue with RB3 initialization after system is ready
        this.enableRb3Internal();
      }).catch(error => {
        console.error("Error during initialization:", error);
      });
      return;
    }
    
    await this.enableRb3Internal();
  }
  
  /**
   * Internal method to enable RB3 without initialization checks
   */
  private async enableRb3Internal(): Promise<void> {
    if (this.isRb3Enabled || !this.effectsController || !this.dmxLightManager) {
      console.log("Cannot enable RB3: already enabled or missing required components");
      return;
    }
    
    // Disable YARG if it's enabled
    if (this.isYargEnabled) {
      await this.disableYarg();
    }
    
    // Shutdown existing cue handler to trigger lifecycle methods
    if (this.cueHandler) {
      this.cueHandler.shutdown();
    }
    
    const debouncePeriod = this.config.getPreference('effectDebounce');
    
    // Create processor manager
    console.log('ControllerManager: Creating ProcessorManager with mode: direct');
    this.processorManager = new ProcessorManager(
      this.dmxLightManager,
      this.effectsController,
      { mode: 'direct' }
    );
    console.log('ControllerManager: ProcessorManager created successfully');
    
    // Create traditional cue handler
    this.cueHandler = new Rb3CueHandler(
      this.dmxLightManager,
      this.effectsController,
      debouncePeriod
    );
    
    // Set the cue handler in the processor manager
    this.processorManager.setCueHandler(this.cueHandler);
    
    // Create network listener (no cue handler dependency)
    this.rb3eListener = new Rb3eNetworkListener();
    
    // Connect network listener to processor manager
    this.processorManager.setNetworkListener(this.rb3eListener);
    
    // Start listening
    this.rb3eListener.start();
    
    this.isRb3Enabled = true;
    console.log("RB3 listener enabled in cue-based mode using event-driven architecture");
  }
  
  /**
   * Disable Rb3 listener
   */
  public async disableRb3(): Promise<void> {
    if (!this.isRb3Enabled) return;
    
    // Clear all running effects before shutting down
    if (this.effectsController) {
      try {
        this.effectsController.removeAllEffects();
        // Use blackout for immediate light shutdown
        await this.effectsController.blackout(0); // Immediate blackout
        console.log('ControllerManager: Cleared all running effects and initiated blackout when disabling RB3');
      } catch (error) {
        console.error('Error clearing effects when disabling RB3:', error);
      }
    }
    
    if (this.rb3eListener) {
      this.rb3eListener.shutdown();
      this.rb3eListener = null;
    }
    
    // Shutdown processor manager to clean up event processors
    if (this.processorManager) {
      this.processorManager.destroy();
      this.processorManager = null;
    }
    
    // Shutdown cue handler to trigger lifecycle methods
    if (this.cueHandler) {
      this.cueHandler.shutdown();
    }
    
    this.isRb3Enabled = false;
  }

  /**
   * Switch RB3 processing mode between direct and cue-based
   * @param mode The new processing mode ('direct' or 'cueBased')
   */
  public async switchRb3Mode(mode: 'direct' | 'cueBased'): Promise<void> {
    if (!this.isRb3Enabled || !this.processorManager) {
      console.log("Cannot switch RB3 mode: RB3 not enabled or processor manager not available");
      return;
    }

    console.log(`Switching RB3 mode from ${this.processorManager.getCurrentMode()} to ${mode}`);
    this.processorManager.switchMode(mode);
    console.log(`RB3 mode switched to: ${this.processorManager.getCurrentMode()}`);
  }

  /**
   * Get current RB3 processing mode
   */
  public getRb3Mode(): 'direct' | 'cueBased' | 'none' {
    if (!this.isRb3Enabled || !this.processorManager) {
      return 'none';
    }
    return this.processorManager.getCurrentMode();
  }

  /**
   * Get RB3 processor statistics
   */
  public getRb3ProcessorStats() {
    if (!this.isRb3Enabled || !this.processorManager) {
      return null;
    }
    return this.processorManager.getProcessorStats();
  }
  
  /**
   * Shutdown all controllers and systems
   */
  public async shutdown(): Promise<void> {
    console.log("ControllerManager shutdown: starting");
    
    try {

      // Shutdown in reverse order of initialization
      try {
        await this.disableYarg();
        console.log("ControllerManager shutdown: YARG disabled");
      } catch (err) {
        console.error("Error disabling YARG:", err);
      }
      
      try {
        await this.disableRb3();
        console.log("ControllerManager shutdown: RB3 disabled");
      } catch (err) {
        console.error("Error disabling RB3:", err);
      }
      
      // Ensure cue handler is shut down if it still exists
      if (this.cueHandler) {
        try {
          this.cueHandler.shutdown();
          this.cueHandler = null;
          console.log("ControllerManager shutdown: cue handler stopped");
        } catch (err) {
          console.error("Error shutting down cue handler:", err);
        }
      }
      
      if (this.effectsController) {
        try {
          await this.effectsController.shutdown();
          console.log("ControllerManager shutdown: effects controller stopped");
        } catch (err) {
          console.error("Error shutting down effects controller:", err);
        }
      }
      
      if (this.dmxPublisher) {
        try {
          await this.dmxPublisher.shutdown();
          console.log("ControllerManager shutdown: DMX publisher stopped");
        } catch (err) {
          console.error("Error shutting down DMX publisher:", err);
        }
      }
      
      if (this.senderManager) {
        try {
          await this.senderManager.shutdown();
          console.log("ControllerManager shutdown: sender manager stopped");
        } catch (err) {
          console.error("Error shutting down sender manager:", err);
        }
      }
      
      this.isInitialized = false;
      console.log("ControllerManager shutdown: completed");
    } catch (err) {
      console.error("Error during controller manager shutdown:", err);
      throw err;
    }
  }
  
  // Getters for controllers
  public getConfig(): ConfigurationManager {
    return this.config;
  }
  
  public getDmxLightManager(): DmxLightManager | null {
    return this.dmxLightManager;
  }
  
  public getLightingController(): ILightingController | null {
    return this.effectsController;
  }
  
  public getSenderManager(): SenderManager {
    return this.senderManager;
  }
  
  public getCueHandler(): YargCueHandler | Rb3CueHandler | null {
    return this.cueHandler;
  }

  public getProcessorManager(): any | null {
    return this.processorManager;
  }

  public getDmxPublisher(): DmxPublisher | null {
    return this.dmxPublisher;
  }
  
  public getIsInitialized(): boolean {
    return this.isInitialized;
  }
  
  public getIsYargEnabled(): boolean {
    return this.isYargEnabled;
  }
  
  public getIsRb3Enabled(): boolean {
    return this.isRb3Enabled;
  }

  /**
   * Restart controllers to pick up configuration changes
   * This shuts down existing controllers and reinitializes them
   */
  public async restartControllers(): Promise<void> {
    console.log("Restarting controllers to apply configuration changes");
    
    // Remember current state to restore after restart
    const wasYargEnabled = this.isYargEnabled;
    const wasRb3Enabled = this.isRb3Enabled;
    
    // Shutdown all components first
    try {
      // First disable any active listeners
      if (this.isYargEnabled) {
        await this.disableYarg();
      }
      
      if (this.isRb3Enabled) {
        await this.disableRb3();
      }
      
      // Then shutdown other components
      if (this.effectsController) {
        await this.effectsController.shutdown();
      }
      
      if (this.dmxPublisher) {
        await this.dmxPublisher.shutdown();
      }
      
      // Ensure cue handler lifecycle is handled
      if (this.cueHandler) {
        this.cueHandler.shutdown();
      }
      
      // Reset component references
      this.dmxLightManager = null;
      this.lightStateManager = null;
      this.lightTransitionController = null;
      this.sequencer = null;
      this.effectsController = null;
      this.dmxPublisher = null;
      this.cueHandler = null;
      
      // Mark as not initialized
      this.isInitialized = false;
      
      console.log("Controllers shutdown completed, reinitializing");
    } catch (error) {
      console.error("Error shutting down controllers:", error);
    }
    
    // Reinitialize
    try {
      await this.init();
      
      // Restore previously active listeners
      if (wasYargEnabled) {
        this.enableYarg();
      } else if (wasRb3Enabled) {
        this.enableRb3();
      }
      
      console.log("Controllers restarted successfully");
    } catch (error) {
      console.error("Error reinitializing controllers:", error);
      throw error;
    }
  }
} 