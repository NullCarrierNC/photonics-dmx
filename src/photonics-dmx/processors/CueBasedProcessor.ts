/**
 * CueBasedProcessor
 * 
 * This processor listens for RB3E events and maps them to the cue system
 */
import { EventEmitter } from 'events';
import { AbstractCueHandler } from '../cueHandlers/AbstractCueHandler';
import { CueData, CueType, lightingCueMap } from '../cues/cueTypes';
import { Rb3RightChannel, Rb3Difficulty, Rb3TrackType } from '../listeners/RB3/rb3eTypes';

/**
 * RB3E event data structures
 */
export interface Rb3eStageKitEvent {
  leftChannel: number;
  rightChannel: number;
  brightness: 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface Rb3eGameStateEvent {
  gameState: string;
  platform: string;
  timestamp: number;
}

export interface Rb3eScoreEvent {
  totalScore: number;
  memberScores: number[];
  stars: number;
  timestamp: number;
}

export interface Rb3eSongEvent {
  songName?: string;
  songArtist?: string;
  songShortName?: string;
  timestamp: number;
}

export interface Rb3eBandInfoEvent {
  members: Array<{
    exists: boolean;
    difficulty: Rb3Difficulty;
    trackType: Rb3TrackType;
  }>;
  timestamp: number;
}

export class CueBasedProcessor extends EventEmitter {
  private cueHandler: AbstractCueHandler;
  private currentCueData: CueData;
  private _currentBrightness: 'low' | 'medium' | 'high' = 'medium';

  constructor(cueHandler: AbstractCueHandler) {
    super();
    this.cueHandler = cueHandler;
    
    // Initialize cue data with defaults
    this.currentCueData = {
      datagramVersion: 1,
      platform: "RB3E",
      currentScene: "Unknown",
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
      lightingCue: "NoCue",
      postProcessing: "Default",
      fogState: false,
      strobeState: "Strobe_Off",
      performer: 0,
      beat: "Unknown",
      keyframe: "Unknown",
      bonusEffect: false,
      ledColor: null,
      rb3Platform: "Unknown",
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
      measureOrBeat: 0
    };
    
    console.log('CueBasedProcessor initialized with cue handler');
  }

  /**
   * Start listening for RB3E events
   * @param networkListener The RB3E network listener to listen to
   */
  public startListening(networkListener: EventEmitter): void {
    // Listen for StageKit events
    networkListener.on('rb3e:stagekit', this.handleStageKitEvent.bind(this));
    
    // Listen for game state events
    networkListener.on('rb3e:gameState', this.handleGameStateEvent.bind(this));
    
    // Listen for score events
    networkListener.on('rb3e:score', this.handleScoreEvent.bind(this));
    
    // Listen for song events
    networkListener.on('rb3e:songName', this.handleSongNameEvent.bind(this));
    networkListener.on('rb3e:songArtist', this.handleSongArtistEvent.bind(this));
    networkListener.on('rb3e:songShortName', this.handleSongShortNameEvent.bind(this));
    
    // Listen for band info events
    networkListener.on('rb3e:bandInfo', this.handleBandInfoEvent.bind(this));
    
    console.log('CueBasedProcessor started listening for RB3E events');
  }

  /**
   * Stop listening for events
   * @param networkListener The RB3E network listener to stop listening to
   */
  public stopListening(networkListener: EventEmitter): void {
    networkListener.off('rb3e:stagekit', this.handleStageKitEvent.bind(this));
    networkListener.off('rb3e:gameState', this.handleGameStateEvent.bind(this));
    networkListener.off('rb3e:score', this.handleScoreEvent.bind(this));
    networkListener.off('rb3e:songName', this.handleSongNameEvent.bind(this));
    networkListener.off('rb3e:songArtist', this.handleSongArtistEvent.bind(this));
    networkListener.off('rb3e:songShortName', this.handleSongShortNameEvent.bind(this));
    networkListener.off('rb3e:bandInfo', this.handleBandInfoEvent.bind(this));
    
    console.log('CueBasedProcessor stopped listening for RB3E events');
  }

  /**
   * Handle StageKit events and map to lighting cues
   */
  private handleStageKitEvent(event: Rb3eStageKitEvent): void {
    const { leftChannel, rightChannel, brightness } = event;
    
    // Update brightness
    this._currentBrightness = brightness;
    
    // Handle special left channel values
    if (leftChannel === 255) {
      // White light
      this.currentCueData.ledColor = "white";
      this.callLedColorHandler("white:" + this._currentBrightness);
      return;
    } else if (leftChannel === 64) {
      // Orange light
      this.currentCueData.ledColor = "orange";
      this.callLedColorHandler("orange:" + this._currentBrightness);
      return;
    }

    // Map leftChannel to a lighting cue
    const lightingCue = lightingCueMap[leftChannel] || CueType.Unknown;
    this.currentCueData.lightingCue = lightingCue;
    
    if (lightingCue !== CueType.Unknown) {
      // Call the cue handler
      this.cueHandler.handleCue(lightingCue, this.currentCueData);
      
      // Emit processed event for monitoring
      this.emit('cue:processed', {
        cueType: lightingCue,
        leftChannel,
        rightChannel,
        brightness: this._currentBrightness,
        timestamp: Date.now()
      });
    } else {
      console.log(`CueBasedProcessor: Unknown lighting cue for left channel value: ${leftChannel}`);
    }

    // Process right channel for fog, strobe, and LED colors
    this.processRightChannel(rightChannel);
  }

  /**
   * Process right channel commands (fog, strobe, LED colors)
   */
  private processRightChannel(rightChannel: number): void {
    // Handle fog control
    if (rightChannel === Rb3RightChannel.FogOn) {
      this.currentCueData.fogState = true;
      this.callFogHandler(true);
    } else if (rightChannel === Rb3RightChannel.FogOff) {
      this.currentCueData.fogState = false;
      this.callFogHandler(false);
    }

    // Handle strobe control
    if (rightChannel >= Rb3RightChannel.StrobeSlow && rightChannel <= Rb3RightChannel.StrobeOff) {
      let strobeState: string;
      switch (rightChannel) {
        case Rb3RightChannel.StrobeSlow:
          strobeState = "Strobe_Slow";
          break;
        case Rb3RightChannel.StrobeMedium:
          strobeState = "Strobe_Medium";
          break;
        case Rb3RightChannel.StrobeFast:
          strobeState = "Strobe_Fast";
          break;
        case Rb3RightChannel.StrobeFastest:
          strobeState = "Strobe_Fastest";
          break;
        case Rb3RightChannel.StrobeOff:
        default:
          strobeState = "Strobe_Off";
          break;
      }
      this.currentCueData.strobeState = strobeState as any;
      this.callStrobeHandler(strobeState as any);
    }

    // Handle LED color commands
    const redBit = (rightChannel & 0x80) !== 0;
    const greenBit = (rightChannel & 0x40) !== 0;
    const blueBit = (rightChannel & 0x20) !== 0;
    
    if (redBit || greenBit || blueBit) {
      let colorName = '';
      if (redBit && greenBit && blueBit) {
        colorName = 'white';
      } else if (redBit && greenBit) {
        colorName = 'yellow';
      } else if (redBit && blueBit) {
        colorName = 'purple';
      } else if (greenBit && blueBit) {
        colorName = 'teal';
      } else if (redBit) {
        colorName = 'red';
      } else if (greenBit) {
        colorName = 'green';
      } else if (blueBit) {
        colorName = 'blue';
      }

      this.currentCueData.ledColor = colorName;
      this.callLedColorHandler(colorName + ":" + this._currentBrightness);
    }
  }

  /**
   * Handle game state events
   */
  private handleGameStateEvent(event: Rb3eGameStateEvent): void {
    // Map RB3E game state to currentScene
    if (event.gameState === 'Menus') {
      this.currentCueData.currentScene = 'Menu';
    } else if (event.gameState === 'InGame') {
      this.currentCueData.currentScene = 'Gameplay';
    }
    
    this.currentCueData.rb3Platform = event.platform;
    
    // Call game state handler if available
    this.callGameStateHandler(event.gameState);
    
    // Emit processed event
    this.emit('gameState:processed', event);
  }

  /**
   * Handle score events
   */
  private handleScoreEvent(event: Rb3eScoreEvent): void {
    this.currentCueData.totalScore = event.totalScore;
    this.currentCueData.memberScores = event.memberScores;
    this.currentCueData.stars = event.stars;
    
    // Emit processed event
    this.emit('score:processed', event);
  }

  /**
   * Handle song name events
   */
  private handleSongNameEvent(event: Rb3eSongEvent): void {
    if (event.songName) {
      this.currentCueData.rb3SongName = event.songName;
      this.emit('songName:processed', event);
    }
  }

  /**
   * Handle song artist events
   */
  private handleSongArtistEvent(event: Rb3eSongEvent): void {
    if (event.songArtist) {
      this.currentCueData.rb3SongArtist = event.songArtist;
      this.emit('songArtist:processed', event);
    }
  }

  /**
   * Handle song short name events
   */
  private handleSongShortNameEvent(event: Rb3eSongEvent): void {
    if (event.songShortName) {
      this.currentCueData.rb3SongShortName = event.songShortName;
      this.emit('songShortName:processed', event);
    }
  }

  /**
   * Handle band info events
   */
  private handleBandInfoEvent(event: Rb3eBandInfoEvent): void {
    this.currentCueData.rb3BandInfo = { members: event.members };
    this.emit('bandInfo:processed', event);
  }

  /**
   * Call LED color handler if available
   */
  private callLedColorHandler(colorData: string): void {
    if (typeof this.cueHandler['handleLedColor'] === 'function') {
      this.cueHandler['handleLedColor'](colorData);
    }
  }

  /**
   * Call fog handler if available
   */
  private callFogHandler(isEnabled: boolean): void {
    if (typeof this.cueHandler['handleFog'] === 'function') {
      this.cueHandler['handleFog'](!!isEnabled);
    }
  }

  /**
   * Call strobe handler if available
   */
  private callStrobeHandler(strobeState: string): void {
    if (typeof this.cueHandler['handleStrobe'] === 'function') {
      this.cueHandler['handleStrobe'](strobeState as any);
    }
  }

  /**
   * Call game state handler if available
   */
  private callGameStateHandler(gameState: string): void {
    if (typeof this.cueHandler['handleGameState'] === 'function') {
      this.cueHandler['handleGameState'](gameState);
    }
  }

  /**
   * Get current cue data
   */
  public getCurrentCueData(): CueData {
    return { ...this.currentCueData };
  }

  /**
   * Get current brightness setting
   */
  public getCurrentBrightness(): 'low' | 'medium' | 'high' {
    return this._currentBrightness;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.removeAllListeners();
    console.log('CueBasedProcessor destroyed');
  }
}
