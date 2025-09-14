/**
 * StageKitDirectProcessor - Direct StageKit light data to DMX mapping
 * 
 * This processor receives StageKit data and maps it directly to DMX lights
 * using setState for direct control.
 * 
 * StageKit has 4 color banks (Blue, Green, Yellow, Red) with 8 positions each.
 * The processor receives already-parsed position arrays and color strings.
 */
import { EventEmitter } from 'events';
import { DmxLightManager } from '../controllers/DmxLightManager';
import { ILightingController } from '../controllers/sequencer/interfaces';
import { StageKitLightMapper } from './StageKitLightMapper';
import { StageKitConfig, DEFAULT_STAGEKIT_CONFIG } from '../listeners/RB3/StageKitTypes';
import { getColor } from '../helpers/dmxHelpers';
import { CueData } from '../cues/cueTypes';
import { RGBIO, TrackedLight } from '../types';

/**
 * StageKit data structure
 */
export interface StageKitData {
  positions: number[];        // LED positions [0,1,2,3,4,5,6,7]
  color: string;             // Color: 'red', 'green', 'blue', 'yellow', 'off'
  brightness: 'low' | 'medium' | 'high';
  strobeEffect?: 'slow' | 'medium' | 'fast' | 'fastest' | 'off';  // Strobe effect type
  timestamp: number;
}

export class Rb3StageKitDirectProcessor extends EventEmitter {
  private lightMapper: StageKitLightMapper;
  private config: StageKitConfig;
  
  // Per-light color state tracking for dynamic blending
  private lightColorState: Map<number, Set<string>> = new Map(); // DMX light index -> Set of persistent colors
  private currentPassColors: Map<number, Set<string>> = new Map(); // DMX light index -> Set of colors active in current pass
  private colorToLights: Map<string, Set<number>> = new Map(); // Color -> Set of DMX light indices
  private pendingUpdates: Map<number, { colors: Set<string>; timeout: NodeJS.Timeout }> = new Map(); // DMX light index -> pending update
  private readonly ACCUMULATION_DELAY_MS = 5; 
  

  
  // Track active strobe effects for cleanup
  private activeStrobeEffects: Map<string, {
    type: 'slow' | 'medium' | 'fast' | 'fastest';
    positions: number[];
    timestamp: number;
    interval?: NodeJS.Timeout;
    targetLights: TrackedLight[];
  }> = new Map();
  
  // Track which lights are currently being strobed (for proper cleanup)
  private strobedLights: Set<number> = new Set();
  
  // Cached DMX light indices for LED positions (computed once on startup)
  private dmxLightIndices: number[] = [];
  
  // Bound event handler for proper cleanup
  private boundHandleStageKitEvent: ((event: StageKitData) => void) | null = null;
  private boundHandleGameStateEvent: ((event: any) => void) | null = null;
  
  // Game state tracking
  private _currentGameState: 'Menus' | 'InGame' = 'Menus';
  
  // Track if we're currently in a song (using direct control)
  private _inSong: boolean = false;
  
  // Menu animation timer
  private menuAnimationTimer: NodeJS.Timeout | null = null;

  constructor(
    private lightManager: DmxLightManager,
    private photonicsSequencer: ILightingController,
    stageKitConfig: Partial<StageKitConfig> = {},
    private cueHandler?: any // Optional cue handler for menu state handling
  ) {
    super();
    console.log('StageKitDirectProcessor: Constructor called with dependencies:', {
      lightManagerType: lightManager.constructor.name,
      photonicsSequencerType: photonicsSequencer.constructor.name,
      stageKitConfig
    }); 
    
    this.lightManager = lightManager;
    this.photonicsSequencer = photonicsSequencer;
    this.config = { ...DEFAULT_STAGEKIT_CONFIG, ...stageKitConfig };
    

    const numLights = this.lightManager.getTotalDmxLightCount();
    
    // StageKitLightMapper only supports 4 or 8 lights, so use fallback-to-minimum 
    // This prevents out-of-bounds errors by never trying to access more lights than exist
    let dmxLightCount: 4 | 8;
    if (numLights < 4) {
      // System doesn't work with less than 4 lights
      throw new Error(`StageKit requires at least 4 DMX lights, but only ${numLights} are configured`);
    } else if (numLights < 8) {
      // 4-7 lights: fall back to 4-light mode
      dmxLightCount = 4;
    } else {
      // 8+ lights: use 8-light mode
      dmxLightCount = 8;
    }
    
    console.log('StageKitDirectProcessor: Using DMX light count:', {
      actualFromConfig: numLights,
      fallbackFromDefault: this.config.dmxLightCount,
      finalCount: dmxLightCount,
      note: numLights < 8 ? 'Falling back to 4-light mode for safety' : 'Using 8-light mode'
    });
    
    this.lightMapper = new StageKitLightMapper(dmxLightCount);
    
    // Cache DMX light indices for all LED positions based on configured light count
    const allPositions = Array.from({ length: dmxLightCount }, (_, i) => i);
    this.dmxLightIndices = this.lightMapper.mapLedPositionsToDmxLights(allPositions);
    
    // Initialize color tracking maps
    this.colorToLights.set('red', new Set());
    this.colorToLights.set('green', new Set());
    this.colorToLights.set('blue', new Set());
    this.colorToLights.set('yellow', new Set());
    
   // //console.log('StageKitDirectProcessor initialized with config:', this.config);
  }

  /**
   * Start listening for StageKit events
   * @param networkListener The network listener to listen to
   */
  public startListening(networkListener: EventEmitter): void {
  //  console.log('StageKitDirectProcessor: startListening called with networkListener:', networkListener.constructor.name);
    
    // Use arrow function to preserve 'this' context
    this.boundHandleStageKitEvent = this.handleStageKitEvent.bind(this);
    this.boundHandleGameStateEvent = this.handleGameStateEvent.bind(this);
    
    networkListener.on('stagekit:data', this.boundHandleStageKitEvent);
    networkListener.on('rb3e:gameState', this.boundHandleGameStateEvent);
    
    console.log('StageKitDirectProcessor: Registered listeners for stagekit:data and rb3e:gameState events');
  }

  /**
   * Stop listening for events
   * @param networkListener The network listener to stop listening to
   */
  public stopListening(networkListener: EventEmitter): void {
    if (this.boundHandleStageKitEvent) {
      networkListener.off('stagekit:data', this.boundHandleStageKitEvent);
      this.boundHandleStageKitEvent = null;
    }
    if (this.boundHandleGameStateEvent) {
      networkListener.off('rb3e:gameState', this.boundHandleGameStateEvent);
      this.boundHandleGameStateEvent = null;
    }
    console.log('StageKitDirectProcessor stopped listening for stagekit:data and rb3e:gameState events');
  }

  /**
   * Handle StageKit events
   */
  private handleStageKitEvent(event: StageKitData): void {
    const { positions, color, strobeEffect } = event;
    
    // If we're receiving StageKit events, we're in a song
    if (!this._inSong) {
      console.log('StageKitDirectProcessor: Received StageKit event while not in song, marking as in song');
      this._inSong = true;
    }
    
    // Log the StageKit data for debugging
    //console.log(`StageKit: Received event - positions: [${positions.join(', ')}], color: ${color}, strobe: ${strobeEffect}`);
    
    // Handle strobe effects first
    if (strobeEffect === 'off') {
      // Turn off strobe effects for these positions
      //console.log(`StageKit: Clearing strobe effects for positions [${positions.join(', ')}]`);
      this.clearStrobeEffectsAtPositions(positions);
    } else if (strobeEffect) {
      //console.log(`StageKit: Applying strobe effect ${strobeEffect} to positions [${positions.join(', ')}]`);
      this.applyStrobeEffect(strobeEffect);
    } else if (color !== 'off') {
      // Process normal light data
      //console.log(`StageKit: Processing color ${color} for positions [${positions.join(', ')}]`);
      this.applyLightData(positions, color);
    } else {
      // No color or effect - clear the lights
      //console.log(`StageKit: Clearing lights for positions [${positions.join(', ')}]`);
      this.clearLightsAtPositions(positions);
    }
    
    // Emit processed event for debugging/monitoring
    this.emit('stagekit:processed', {
      positions,
      color,
      strobeEffect,
      timestamp: Date.now()
    });

    // Emit cue data for network debugging
    this.emitCueDataForStageKit(event);
  }

  /**
   * Handle game state events
   */
  private handleGameStateEvent(event: { gameState: 'Menus' | 'InGame'; platform: string; timestamp: number; cueData: CueData | null }): void {
    try {
      console.log('StageKitDirectProcessor: Received game state event:', event);
    const { gameState, cueData: realCueData } = event;
    
    console.log(`StageKitDirectProcessor: Game state changed from ${this._currentGameState} to ${gameState}`);
      
      // Check if we need to process this transition
      const stateChanged = this._currentGameState !== gameState;
      const returningToMenu = gameState === 'Menus' && this._inSong;
      
      if (!stateChanged && !returningToMenu) {
        console.log('StageKitDirectProcessor: Game state unchanged and not returning from song, skipping processing');
        return;
      }
      
      if (returningToMenu) {
        console.log('StageKitDirectProcessor: Returning to menu from song, processing transition');
      }
    
    const previousState = this._currentGameState;
    this._currentGameState = gameState;
    
    // Emit CueData with empty LED positions to clear frontend display (applies to both states)
    // Use real data when available, fallback to defaults when not
    const clearCueData: CueData = {
      datagramVersion: realCueData?.datagramVersion || 1,
      platform: realCueData?.platform || "RB3E",
      currentScene: gameState === 'InGame' ? "Gameplay" : "Menu",
      pauseState: realCueData?.pauseState || "Unpaused",
      venueSize: gameState === 'InGame' ? (realCueData?.venueSize || "Large") : "NoVenue",
      beatsPerMinute: realCueData?.beatsPerMinute || 0,
      songSection: realCueData?.songSection || "Unknown",
      guitarNotes: realCueData?.guitarNotes || [],
      bassNotes: realCueData?.bassNotes || [],
      drumNotes: realCueData?.drumNotes || [],
      keysNotes: realCueData?.keysNotes || [],
      vocalNote: realCueData?.vocalNote || 0,
      harmony0Note: realCueData?.harmony0Note || 0,
      harmony1Note: realCueData?.harmony1Note || 0,
      harmony2Note: realCueData?.harmony2Note || 0,
      lightingCue: gameState === 'InGame' ? "StageKitDirect" : "Default",
      postProcessing: realCueData?.postProcessing || "Default",
      fogState: realCueData?.fogState || false,
      strobeState: realCueData?.strobeState || "Strobe_Off",
      performer: realCueData?.performer || 0,
      trackMode: realCueData?.trackMode || 'tracked',
      beat: realCueData?.beat || "Unknown",
      keyframe: realCueData?.keyframe || "Unknown",
      bonusEffect: realCueData?.bonusEffect || false,
      ledColor: '',
      ledPositions: [], // Clear LED positions for frontend
      rb3Platform: event.platform,
      rb3BuildTag: realCueData?.rb3BuildTag || "",
      rb3SongName: realCueData?.rb3SongName || "",
      rb3SongArtist: realCueData?.rb3SongArtist || "",
      rb3SongShortName: realCueData?.rb3SongShortName || "",
      rb3VenueName: realCueData?.rb3VenueName || "",
      rb3ScreenName: realCueData?.rb3ScreenName || "",
      rb3BandInfo: realCueData?.rb3BandInfo || { members: [] },
      rb3ModData: realCueData?.rb3ModData || { identifyValue: "", string: "" },
      totalScore: realCueData?.totalScore || 0,
      memberScores: realCueData?.memberScores || [],
      stars: realCueData?.stars || 0,
      sustainDurationMs: realCueData?.sustainDurationMs || 0,
      measureOrBeat: realCueData?.measureOrBeat || 0,
      cueHistory: [],
      executionCount: 1,
      cueStartTime: Date.now(),
      timeSinceLastCue: 0,
    };
    
    // Emit the clear data for frontend
    this.emit('cueHandled', clearCueData);
    
    if (gameState === 'InGame') {
      // Transition to InGame: Clear all current light states completely
      console.log('StageKitDirectProcessor: Transitioning to InGame - clearing all lights and LED positions');
      
      // Mark that we're now in a song
      this._inSong = true;
      
      // Clear menu animation timer
      this.clearMenuAnimationTimer();
      
      // Clear all lights and sequencer effects
      this.turnOffAllLights().catch(error => {
        console.error('StageKitDirectProcessor: Error clearing lights during InGame transition:', error);
      });
      
      // Also call blackout on the sequencer to clear any effects on layers
      this.photonicsSequencer.blackout(0).catch(error => {
        console.error('StageKitDirectProcessor: Error calling sequencer blackout during InGame transition:', error);
      });
    } else if (gameState === 'Menus') {
      // Transition to Menus: Trigger cue handler's handleCueDefault and clear LED positions
      console.log('StageKitDirectProcessor: Transitioning to Menus - triggering cue handler and clearing LED positions');
      
      // Mark that we're no longer in a song
      this._inSong = false;
      
      // Turn off the lights from direct control, but the sequencer isn't handling anything right now.
      this.turnOffAllLights().catch(error => {
        console.error('StageKitDirectProcessor: Error clearing lights during Menus transition:', error);
      });
      
      // Start the menu animation timer (we only trigger this on transition change, so we need to repeat the call 
      // for the cue to continue running.
      this.startMenuAnimationTimer();
    }
    
    // Emit event for monitoring
    this.emit('gameStateChanged', {
      previousState,
      currentState: gameState,
      timestamp: event.timestamp
    });
    } catch (error) {
      console.error('StageKitDirectProcessor: Error handling game state event:', error);
    }
  }

  /**
   * Apply strobe effect to specific LED positions
   * @param strobeType The type of strobe effect to apply
   * @param positions The LED positions to apply the strobe to
   */
  private applyStrobeEffect(strobeType: 'slow' | 'medium' | 'fast' | 'fastest'): void {
    //console.log(`StageKit: applyStrobeEffect called with type: ${strobeType});
    
    // Get strobe lights and all lights to map correctly
    const strobeLights = this.lightManager.getLights(['strobe'], 'all');
    const allLights = this.lightManager.getLights(['front', 'back'], 'all');
    
    if (!strobeLights || strobeLights.length === 0) {
      console.log(`StageKit: No strobe lights returned from lightManager`);
      return;
    }
    
    if (!allLights) {
      console.log(`StageKit: No front/back lights returned from lightManager`);
      return;
    }
    
    // Map strobe lights to their corresponding front/back light indices
    const targetLights: TrackedLight[] = [];
    const dmxLightIndices: number[] = [];
    
  //  console.log(`StageKit: Strobe lights:`, strobeLights.map(l => ({ id: l.id, position: l.position })));
  //  console.log(`StageKit: All lights:`, allLights.map((l, i) => ({ id: l.id, position: l.position, index: i })));
    
    for (const strobeLight of strobeLights) {
      // Find the corresponding light in the allLights array
      const allLightIndex = allLights.findIndex(light => light.id === strobeLight.id);
      if (allLightIndex !== -1) {
        targetLights.push(allLights[allLightIndex]);
        dmxLightIndices.push(allLightIndex);
      } else {
        console.log(`StageKit: Could not find strobe light ${strobeLight.id} in front/back lights`);
      }
    }
    
    if (targetLights.length === 0) {
      console.log(`StageKit: No matching lights found between strobe and front/back lights`);
      return;
    }
    
    const white = getColor('white', 'max');
    
    // Calculate strobe timing based on type
    let strobeInterval: number;
    switch (strobeType) {
      case 'slow':
        strobeInterval = 200
        break;
      case 'medium':
        strobeInterval = 100;
        break;
      case 'fast':
        strobeInterval = 50;
        break;
      case 'fastest':
        strobeInterval = 25;
        break;
      default:
        strobeInterval = 100;
    }
    
    // Store strobe state for this effect
    const effectName = `stagekit-strobe-${strobeType}-${Date.now()}`;
    this.activeStrobeEffects.set(effectName, {
      type: strobeType,
      positions: dmxLightIndices,
      timestamp: Date.now(),
      targetLights: targetLights
    });
    
  //  console.log(`StageKit: Created strobe effect ${effectName} targeting lights:`, dmxLightIndices.map((idx, i) => ({ dmxIndex: idx, lightId: targetLights[i]?.id })));
    
    // Start the strobe effect using setState
    this.startStrobeEffect(effectName, targetLights, white, strobeInterval, dmxLightIndices);
    
 //   console.log(`StageKit: Started ${strobeType} strobe on ${targetLights.length} lights with ${strobeInterval}ms interval`);
  }

  /**
   * Start a strobe effect using setState
   * @param effectName Unique name for the strobe effect
   * @param targetLights Array of lights to strobe
   * @param color Color to use for the strobe
   * @param interval Interval between strobe flashes in milliseconds
   * @param dmxLightIndices Array of DMX light indices corresponding to targetLights
   */
  private startStrobeEffect(effectName: string, targetLights: TrackedLight[], color: RGBIO, interval: number, dmxLightIndices: number[]): void {
    let isOn = false;
    
    // Track which lights are being strobed for proper cleanup (use actual DMX indices)
    for (const lightIndex of dmxLightIndices) {
      this.strobedLights.add(lightIndex);
    }
    
    const strobeInterval = setInterval(() => {
      if (isOn) {
        // Turn off strobe - restore previous colors
      //  console.log(`StageKit: Turning OFF strobe for lights at DMX indices [${dmxLightIndices.join(', ')}]`);
        this.restoreColorsAfterStrobe(targetLights, dmxLightIndices);
        isOn = false;
      } else {
        // Turn on strobe
     //   console.log(`StageKit: Turning ON strobe for lights at DMX indices [${dmxLightIndices.join(', ')}]`);
       
        this.photonicsSequencer.setState(targetLights, color, 0);
        isOn = true;
      }
    }, interval);
    
    // Store the interval for cleanup
    this.activeStrobeEffects.get(effectName)!.interval = strobeInterval;
  }

  /**
   * Restore colors after strobe effect ends
   * This ensures lights return to their previous color state instead of staying transparent
   */
  private async restoreColorsAfterStrobe(_targetLights: TrackedLight[], lightIndices: number[]): Promise<void> {
    for (const lightIndex of lightIndices) {
      
      // Check if this light has any colors to restore
  /*    const persistentColors = this.lightColorState.get(lightIndex) || new Set();
      const currentPassColors = this.currentPassColors.get(lightIndex) || new Set();
      console.log(`StageKit: Light ${lightIndex} has persistent colors: [${Array.from(persistentColors).join(', ')}], current pass: [${Array.from(currentPassColors).join(', ')}]`);
    */

      // Remove from strobed lights tracking
      this.strobedLights.delete(lightIndex);
      
      // Trigger color restoration for this light
      await this.triggerReblend(lightIndex);
    }
  }

  /**
   * Clear lights at specific LED positions
   * @param positions The LED positions to clear
   */
  private async clearLightsAtPositions(positions: number[]): Promise<void> {
    if (positions.length === 0) return;
    
    // Filter cached DMX light indices to only the requested positions
    const targetDmxIndices = positions.map(pos => this.dmxLightIndices[pos]);
    
    // Turn off the lights at these positions
    for (const lightIndex of targetDmxIndices) {
      await this.turnOffLight(lightIndex);
    }
  }

  /**
   * Clear strobe effects at specific LED positions
   * @param positions The LED positions to clear strobe effects from
   */
  private clearStrobeEffectsAtPositions(positions: number[]): void {
    // Find and remove strobe effects that affect these positions
    const effectsToRemove: string[] = [];
    
    if (positions.length === 0) {
      // Empty positions means clear all global strobe effects
      for (const [effectName, _effectData] of this.activeStrobeEffects.entries()) {
        effectsToRemove.push(effectName);
      }
    } else {
          // Filter cached DMX light indices to only the requested positions
    const targetDmxIndices = positions.map(pos => this.dmxLightIndices[pos]);
  //    console.log(`StageKit: Mapped positions [${positions.join(', ')}] to DMX indices [${dmxLightIndices.join(', ')}]`);
      
      for (const [effectName, effectData] of this.activeStrobeEffects.entries()) {
        // Check if this effect affects any of the target positions
        const hasOverlap = effectData.positions.some(pos => targetDmxIndices.includes(pos));
        if (hasOverlap) {
          console.log(`StageKit: Effect ${effectName} affects target positions`);
          effectsToRemove.push(effectName);
        }
      }
    }
    
    // Remove the effects and clean up intervals
    for (const effectName of effectsToRemove) {
      const effectData = this.activeStrobeEffects.get(effectName);
      if (effectData && effectData.interval) {
     //   console.log(`StageKit: Clearing strobe effect ${effectName} with interval ${effectData.interval}`);
        clearInterval(effectData.interval);
        // Restore colors for strobed lights when clearing strobe
        if (effectData.targetLights) {
          const lightIndices = effectData.targetLights.map((_, index) => index);
          this.restoreColorsAfterStrobe(effectData.targetLights, lightIndices);
        }
      }
      this.activeStrobeEffects.delete(effectName);
    }
   
  }

  /**
   * Apply light data directly to DMX lights using setState
   * Each color bank operates independently - only affects its own lights
   * Colors are blended in real-time based on what's currently active on each light
   */
  private async applyLightData(positions: number[], color: string): Promise<void> {
    // Special handling for "No LEDs" state (positions is empty)
    if (positions.length === 0) {
      // positions=[] means "no LEDs lit for this color bank" - clear this color from all lights
      if (color !== 'off') {
   //     //console.log(`DEBUG: Clearing color ${color} from all lights`);
        await this.clearColorFromAllLights(color);
      }
      return;
    }
    
    // Map to DMX lights
    const dmxLightIndices = this.lightMapper.mapLedPositionsToDmxLights(positions);
   // console.log(`DEBUG: Position mapping - received positions: [${positions.join(', ')}] -> generated DMX indices: [${dmxLightIndices.join(', ')}]`);
    
    // Update the color state for this color bank
    await this.updateColorBank(color, dmxLightIndices);
  }
  
  /**
   * Update a specific color bank - clear old positions and set new ones
   */
  private async updateColorBank(color: string, newLightIndices: number[]): Promise<void> {
    //console.log(`DEBUG: Updating color bank ${color} to lights [${newLightIndices.join(', ')}]`);
    
    // Get the lights that currently have this color
    const currentLights = this.colorToLights.get(color) || new Set();
    
    // Clear this color from all lights that currently have it
    for (const lightIndex of currentLights) {
      await this.removeColorFromLight(lightIndex, color);
    }
    
    // Clear the color tracking
    this.colorToLights.set(color, new Set());
    
    
    // Let colors accumulate naturally in current pass colors for proper blending
    for (const lightIndex of newLightIndices) {
      if (!this.currentPassColors.has(lightIndex)) {
        this.currentPassColors.set(lightIndex, new Set());
      }
      
      //console.log(`DEBUG: Light ${lightIndex} - current pass colors before adding ${color}`);
    }
    
    // Apply this color to the new light positions
    for (const lightIndex of newLightIndices) {
      await this.addColorToLight(lightIndex, color);
      this.colorToLights.get(color)!.add(lightIndex);
    }
  }
  
  /**
   * Add a color to a specific light and re-blend
   */
  private async addColorToLight(lightIndex: number, color: string): Promise<void> {
    // Initialize light color state if needed
    if (!this.lightColorState.has(lightIndex)) {
      this.lightColorState.set(lightIndex, new Set());
    }
    if (!this.currentPassColors.has(lightIndex)) {
      this.currentPassColors.set(lightIndex, new Set());
    }
    
    // Add the color to this light's persistent state
    this.lightColorState.get(lightIndex)!.add(color);
    // Add the color to this light's current pass state (accumulate, don't replace)
    this.currentPassColors.get(lightIndex)!.add(color);
    
    //console.log(`DEBUG: Light ${lightIndex} current pass colors after adding ${color}: [${Array.from(this.currentPassColors.get(lightIndex)!).join(', ')}]`);
    
    // Check if there's already a pending update for this light
    const existingPending = this.pendingUpdates.get(lightIndex);
    if (existingPending) {
      // Clear existing timeout
      clearTimeout(existingPending.timeout);
      // Add new color to pending set
      existingPending.colors.add(color);
    } else {
      // Create new pending update
      const pendingColors = new Set([color]);
      this.pendingUpdates.set(lightIndex, { colors: pendingColors, timeout: null as any });
    }
    
    // Set timeout to apply accumulated colors after delay
    const timeout = setTimeout(async () => {
      await this.applyAccumulatedColors(lightIndex);
      this.pendingUpdates.delete(lightIndex);
    }, this.ACCUMULATION_DELAY_MS);
    
    // Update the timeout reference
    this.pendingUpdates.get(lightIndex)!.timeout = timeout;
  }
  
  /**
   * Remove a color from a specific light and re-blend
   * This is only called when explicitly clearing a color (e.g., leftChannel=0)
   */
  private async removeColorFromLight(lightIndex: number, color: string): Promise<void> {
    if (!this.lightColorState.has(lightIndex)) {
      return; // Light doesn't exist
    }
    
    // Remove the color from this light's persistent state
    this.lightColorState.get(lightIndex)!.delete(color);
    // Remove the color from this light's current pass state
    if (this.currentPassColors.has(lightIndex)) {
      this.currentPassColors.get(lightIndex)!.delete(color);
    }
    
    // Check if there's already a pending update for this light
    const existingPending = this.pendingUpdates.get(lightIndex);
    if (existingPending) {
      // Clear existing timeout
      clearTimeout(existingPending.timeout);
      // Remove color from pending set
      existingPending.colors.delete(color);
    } else {
      // Create new pending update with remaining colors
      const remainingColors = new Set(Array.from(this.lightColorState.get(lightIndex)!));
      this.pendingUpdates.set(lightIndex, { colors: remainingColors, timeout: null as any });
    }
    
    // Set timeout to apply accumulated colors after delay
    const timeout = setTimeout(async () => {
      await this.applyAccumulatedColors(lightIndex);
      this.pendingUpdates.delete(lightIndex);
    }, this.ACCUMULATION_DELAY_MS);
    
    // Update the timeout reference
    this.pendingUpdates.get(lightIndex)!.timeout = timeout;
  }
  
  /**
   * Clear a specific color from all lights
   */
  private async clearColorFromAllLights(color: string): Promise<void> {
    const lightsWithColor = this.colorToLights.get(color) || new Set();
    
    for (const lightIndex of lightsWithColor) {
      // Remove from both persistent and current pass states
      if (this.lightColorState.has(lightIndex)) {
        this.lightColorState.get(lightIndex)!.delete(color);
      }
      if (this.currentPassColors.has(lightIndex)) {
        this.currentPassColors.get(lightIndex)!.delete(color);
      }
      
      // Trigger a re-blend to update the light
      await this.triggerReblend(lightIndex);
    }
    
    // Clear the color tracking
    this.colorToLights.set(color, new Set());
  }
  
  /**
   * Apply a blended color to a specific light
   */
  private async applyColorToLight(lightIndex: number, color: any): Promise<void> {
    const lights = this.lightManager.getLights(['front', 'back'], 'all');
    if (lights && lights[lightIndex]) {
  //    //console.log(`DEBUG: Applying color ${JSON.stringify(color)} to light ${lightIndex}`);
      await this.photonicsSequencer.setState([lights[lightIndex]], color, 1);
    }
  }
  
  /**
   * Turn off a specific light
   */
  private async turnOffLight(lightIndex: number): Promise<void> {
    const lights = this.lightManager.getLights(['front', 'back'], 'all');
    if (lights && lights[lightIndex]) {
  //    //console.log(`DEBUG: Turning off light ${lightIndex}`);
      const blackColor = getColor('black', 'medium');
      await this.photonicsSequencer.setState([lights[lightIndex]], blackColor, 1);
    }
  }

  /**
   * Turn off all DMX lights (for cleanup and reset)
   */
  private async turnOffAllLights(): Promise<void> {
    try {
  //    //console.log('StageKitDirectProcessor: Turning off all DMX lights using setState black');
      
      const lights = this.lightManager.getLights(['front', 'back'], 'all');
      if (lights) {
        const blackColor = getColor('black', 'medium');
        for (const light of lights) {
          await this.photonicsSequencer.setState([light], blackColor, 1);
        }
      }
      
      // Clear all color state
      this.lightColorState.clear();
      this.currentPassColors.clear();
      for (const colorSet of this.colorToLights.values()) {
        colorSet.clear();
      }
      
      // Clear all pending updates
      for (const pendingUpdate of this.pendingUpdates.values()) {
        clearTimeout(pendingUpdate.timeout);
      }
      this.pendingUpdates.clear();
      
      // Clear all strobe effects and intervals
      for (const [_effectName, effectData] of this.activeStrobeEffects.entries()) {
        if (effectData.interval) {
          clearInterval(effectData.interval);
          // Restore colors for strobed lights when clearing strobe
          if (effectData.targetLights) {
            const lightIndices = effectData.targetLights.map((_, index) => index);
            this.restoreColorsAfterStrobe(effectData.targetLights, lightIndices);
          }
        }
      }
      this.activeStrobeEffects.clear();
      this.strobedLights.clear();
      
    } catch (error) {
      console.error('StageKitDirectProcessor: Error turning off all DMX lights:', error);
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<StageKitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Recreate distributor if light count changed
    if (newConfig.dmxLightCount && newConfig.dmxLightCount !== this.config.dmxLightCount) {
      this.lightMapper = new StageKitLightMapper(newConfig.dmxLightCount);
    }
    
//    //console.log('StageKitDirectProcessor config updated:', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): StageKitConfig {
    return { ...this.config };
  }

  /**
   * Get current brightness setting
   */
  public getCurrentBrightness(): 'low' | 'medium' | 'high' {
    return 'medium'; 
  }


  /**
   * Blend multiple colors into a single color value
   * This handles cases where multiple StageKit color banks are active simultaneously
   */
  private blendColors(colors: string[]): any {
    if (colors.length === 0 || colors.includes('off')) {
      return getColor('black', 'medium');
    }
    
    if (colors.length === 1) {
      // Single color - no blending needed
      return getColor(colors[0] as any, 'medium');
    }
    
    // Multiple colors - blend them together
 //   //console.log(`StageKit: Blending colors: ${colors.join(' + ')}`);
    
    // Get individual color values and log them
    const colorValues = colors.map(color => {
      const colorValue = getColor(color as any, 'medium');
//      //console.log(`StageKit: Color ${color} = ${JSON.stringify(colorValue)}`);
      return colorValue;
    });
    
    // Simple additive blending (can be enhanced with more sophisticated algorithms)
    const blendedColor = this.addColors(colorValues);
    
 //   //console.log(`StageKit: Blended result: ${JSON.stringify(blendedColor)}`);
    return blendedColor;
  }

  /**
   * Add multiple RGBIP colors together
   * This is an averaged blending approach
   */
  private addColors(colors: any[]): any {
    if (colors.length === 0) {
      return getColor('black', 'medium');
    }
    
    if (colors.length === 1) {
      return colors[0];
    }
    
    // Start with the first color
    let result = { ...colors[0] };
    
    // Add subsequent colors
    for (let i = 1; i < colors.length; i++) {
      const color = colors[i];
      
      // Add RGB values (clamp to maximum values)
      if (result.red !== undefined && color.red !== undefined) {
        result.red = Math.min(255, result.red + color.red);
      }
      if (result.green !== undefined && color.green !== undefined) {
        result.green = Math.min(255, result.green + color.green);
      }
      if (result.blue !== undefined && color.blue !== undefined) {
        result.blue = Math.min(255, result.blue + color.blue);
      }
      
      // Handle other color properties if they exist
      if (result.intensity !== undefined && color.intensity !== undefined) {
        result.intensity = Math.min(255, result.intensity + color.intensity);
      }
      
      // For blended colors, use lower priority values to allow for better mixing
      // This prevents one color from completely dominating the others
      result.rp = Math.min(result.rp || 255, color.rp || 255);
      result.gp = Math.min(result.gp || 255, color.gp || 255);
      result.bp = Math.min(result.bp || 255, color.bp || 255);
      result.ip = Math.min(result.ip || 255, color.ip || 255);
    }
    /*
    // Apply averaged blending by dividing by the number of colors
    if (colors.length > 1) {
      if (result.red !== undefined) {
        result.red = Math.round(result.red / colors.length);
      }
      if (result.green !== undefined) {
        result.green = Math.round(result.green / colors.length);
      }
      if (result.blue !== undefined) {
        result.blue = Math.round(result.blue / colors.length);
      }
      if (result.intensity !== undefined) {
        result.intensity = Math.round(result.intensity / colors.length);
      }
    }
    */
    return result;
  }

  /**
   * Apply accumulated colors for a specific light
   */
  private async applyAccumulatedColors(lightIndex: number): Promise<void> {
    const pendingUpdate = this.pendingUpdates.get(lightIndex);
    if (!pendingUpdate) return;
    
    // Get both persistent and current pass colors for this light
    const persistentColors = this.lightColorState.get(lightIndex) || new Set();
    const currentPassColors = this.currentPassColors.get(lightIndex) || new Set();
    
  //  console.log(`DEBUG: Light ${lightIndex} - persistent: [${Array.from(persistentColors).join(', ')}], current pass: [${Array.from(currentPassColors).join(', ')}]`);
    
    if (currentPassColors.size > 0) {
      // Current pass colors take precedence - use ONLY these for blending
      const colorsToBlend = Array.from(currentPassColors);
   //   console.log(`DEBUG: Light ${lightIndex} using current pass colors: [${colorsToBlend.join(', ')}]`);
      const blendedColor = this.blendColors(colorsToBlend);
  //    console.log(`DEBUG: Light ${lightIndex} blended result: ${JSON.stringify(blendedColor)}`);
      await this.applyColorToLight(lightIndex, blendedColor);
    } else if (persistentColors.size > 0) {
      // No current pass colors - fall back to persistent colors
      const colorsToBlend = Array.from(persistentColors);
 //     console.log(`DEBUG: Light ${lightIndex} restoring persistent colors: [${colorsToBlend.join(', ')}]`);
      const blendedColor = this.blendColors(colorsToBlend);
 //     console.log(`DEBUG: Light ${lightIndex} blended result: ${JSON.stringify(blendedColor)}`);
      await this.applyColorToLight(lightIndex, blendedColor);
    } else {
      // No colors left - turn off the light
 //     console.log(`DEBUG: Light ${lightIndex} - no colors left, turning off`);
      await this.turnOffLight(lightIndex);
      this.lightColorState.delete(lightIndex);
      this.currentPassColors.delete(lightIndex);
    }
  }

  /**
   * Trigger a re-blend for a specific light to apply its current state.
   * This is useful when colors are added or removed directly.
   */
  private async triggerReblend(lightIndex: number): Promise<void> {
    // Clear any pending updates for this light
    const existingPending = this.pendingUpdates.get(lightIndex);
    if (existingPending) {
      clearTimeout(existingPending.timeout);
      this.pendingUpdates.delete(lightIndex);
    }

    // Apply the current state of persistent and current pass colors
    const persistentColors = this.lightColorState.get(lightIndex) || new Set();
    const currentPassColors = this.currentPassColors.get(lightIndex) || new Set();

    const colorsToBlend = Array.from(persistentColors).concat(Array.from(currentPassColors));
    //console.log(`DEBUG: Light ${lightIndex} triggering re-blend with colors: [${colorsToBlend.join(', ')}]`);
    const blendedColor = this.blendColors(colorsToBlend);
    await this.applyColorToLight(lightIndex, blendedColor);
  }


  /**
   * Get comprehensive processor status
   */
  public getStatus(): {
    currentActiveLights: string[];
    hasActiveLights: boolean;
    activeLightCount: number;
    activeStrobeEffects: string[];
    hasActiveStrobeEffects: boolean;
    strobedLights: number[];
  } {
    const activeLights: string[] = [];
    for (const [lightIndex, colors] of this.lightColorState.entries()) {
      if (colors.size > 0) {
        activeLights.push(`Light ${lightIndex}: [${Array.from(colors).join(', ')}]`);
      }
    }
    
    const activeStrobeEffects: string[] = [];
    for (const [effectName, effectData] of this.activeStrobeEffects.entries()) {
      activeStrobeEffects.push(`${effectName}: ${effectData.type} strobe on positions [${effectData.positions.join(', ')}]`);
    }
    
    return {
      currentActiveLights: activeLights,
      hasActiveLights: activeLights.length > 0,
      activeLightCount: activeLights.length,
      activeStrobeEffects,
      hasActiveStrobeEffects: activeStrobeEffects.length > 0,
      strobedLights: Array.from(this.strobedLights)
    };
  }

  /**
   * Get color blending information for a specific color
   */
  public getColorBlendingInfo(color: string): {
    color: string;
    blendedColor: any;
    description: string;
  } {
    const activeColors = [color];
    const blendedColor = this.blendColors(activeColors);
    
    let description = '';
    if (color === 'off') {
      description = 'No colors active';
    } else {
      description = `Single color: ${color}`;
    }
    
    return {
      color,
      blendedColor,
      description
    };
  }

  /**
   * Public method to manually clear all lights (for testing and debugging)
   */
  public async clearAllLightsManually(): Promise<void> {
    await this.turnOffAllLights();
  }


  /**
   * Create and emit CueData for network debugging
   * @param event The StageKit event data
   */
  private emitCueDataForStageKit(event: StageKitData): void {
    const { positions, color, strobeEffect } = event;
    
    // Create cue data from StageKit event
    const cueData: CueData = {
      datagramVersion: 1,
      platform: "RB3E",
      currentScene: "Gameplay",
      pauseState: "Unpaused",
      venueSize: "Large",
      beatsPerMinute: 120,
      songSection: "Verse",
      guitarNotes: [],
      bassNotes: [],
      drumNotes: [],
      keysNotes: [],
      vocalNote: 0,
      harmony0Note: 0,
      harmony1Note: 0,
      harmony2Note: 0,
      lightingCue: "StageKitDirect",
      postProcessing: "Default",
      fogState: false,
      strobeState: strobeEffect === 'off' ? "Strobe_Off" : 
                   strobeEffect === 'slow' ? "Strobe_Slow" :
                   strobeEffect === 'medium' ? "Strobe_Medium" :
                   strobeEffect === 'fast' ? "Strobe_Fast" :
                   strobeEffect === 'fastest' ? "Strobe_Fastest" : "Strobe_Off",
      performer: 0,
      trackMode: 'tracked',
      beat: "Strong",
      keyframe: "Off",
      bonusEffect: false,
      ledColor: color === 'off' ? '' : color,
      ledPositions: positions,
      rb3Platform: "RB3E",
      rb3BuildTag: "",
      rb3SongName: "",
      rb3SongArtist: "",
      rb3SongShortName: "",
      rb3VenueName: "",
      rb3ScreenName: "",
      rb3BandInfo: { members: [] },
      rb3ModData: { identifyValue: "", string: "" },
      totalScore: 0,
      memberScores: [],
      stars: 0,
      sustainDurationMs: 0,
      measureOrBeat: 0,
      cueHistory: [],
      executionCount: 1,
      cueStartTime: Date.now(),
      timeSinceLastCue: 0,
    };

    // Emit the cue data for network debugging
    this.emit('cueHandled', cueData);
  }

  /**
   * Set the cue handler for menu state handling
   * @param cueHandler The cue handler instance
   */
  public setCueHandler(cueHandler: any): void {
    this.cueHandler = cueHandler;
    console.log('StageKitDirectProcessor: Cue handler updated');
  }

  /**
   * Start the menu animation timer to call default cue every 1000ms
   */
  private startMenuAnimationTimer(): void {
    console.log('StageKitDirectProcessor: startMenuAnimationTimer called');
    // Clear any existing timer first
    this.clearMenuAnimationTimer();
    
    if (!this.cueHandler || typeof this.cueHandler.handleCueDefault !== 'function') {
      console.warn('StageKitDirectProcessor: Cannot start menu animation - no cue handler available');
      return;
    }
    
    console.log('StageKitDirectProcessor: Starting menu animation timer (1000ms interval)');
    
    this.menuAnimationTimer = setInterval(() => {
     // console.log(`StageKitDirectProcessor: Menu animation timer tick - current state: ${this._currentGameState}, cueHandler available: ${!!this.cueHandler}`);
      if (this._currentGameState === 'Menus' && this.cueHandler) {
        // Create a basic CueData object for the cue handler
        const cueData: CueData = {
          datagramVersion: 1,
          platform: "RB3E",
          currentScene: "Menu",
          pauseState: "Unpaused",
          venueSize: "NoVenue",
          beatsPerMinute: 0,
          songSection: "Unknown",
          guitarNotes: [],
          bassNotes: [],
          drumNotes: [],
          keysNotes: [],
          vocalNote: 0,
          harmony0Note: 0,
          harmony1Note: 0,
          harmony2Note: 0,
          lightingCue: "Default",
          postProcessing: "Default",
          fogState: false,
          strobeState: "Strobe_Off",
          performer: 0,
          trackMode: 'tracked',
          beat: "Unknown",
          keyframe: "Unknown",
          bonusEffect: false,
          ledColor: '',
          ledPositions: [],
          rb3Platform: "RB3E",
          rb3BuildTag: "",
          rb3SongName: "",
          rb3SongArtist: "",
          rb3SongShortName: "",
          rb3VenueName: "",
          rb3ScreenName: "",
          rb3BandInfo: { members: [] },
          rb3ModData: { identifyValue: "", string: "" },
          totalScore: 0,
          memberScores: [],
          stars: 0,
          sustainDurationMs: 0,
          measureOrBeat: 0,
          cueHistory: [],
      executionCount: 1,
      cueStartTime: Date.now(),
      timeSinceLastCue: 0,
        };
        
        this.cueHandler.handleCueDefault(cueData).catch(error => {
          console.error('StageKitDirectProcessor: Error calling cue handler handleCueDefault in timer:', error);
        });
      }
    }, 1000);
  }

  /**
   * Clear the menu animation timer
   */
  private clearMenuAnimationTimer(): void {
    console.log('StageKitDirectProcessor: clearMenuAnimationTimer called');
    if (this.menuAnimationTimer) {
      console.log('StageKitDirectProcessor: Clearing menu animation timer');
      clearInterval(this.menuAnimationTimer);
      this.menuAnimationTimer = null;
    } else {
      console.log('StageKitDirectProcessor: No menu animation timer to clear');
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    // Clear any active lights before destroying
    this.turnOffAllLights().catch(error => {
      console.error('StageKitDirectProcessor: Error clearing lights during destroy:', error);
    });
    
    // Clear menu animation timer
    this.clearMenuAnimationTimer();
    
    // Clear all strobe effects and intervals
    for (const [_effectName, effectData] of this.activeStrobeEffects.entries()) {
      if (effectData.interval) {
        clearInterval(effectData.interval);
      }
    }
    this.activeStrobeEffects.clear();
    this.strobedLights.clear();
    
    this.removeAllListeners();
    //console.log('StageKitDirectProcessor destroyed');
  }


}
