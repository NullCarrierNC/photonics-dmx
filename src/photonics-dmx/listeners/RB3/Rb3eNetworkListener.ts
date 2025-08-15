import * as dgram from 'dgram';
import { EventEmitter } from 'events';
import { Rb3ePacketType, Rb3GameState, Rb3RightChannel, Rb3PlatformID, Rb3TrackType, Rb3Difficulty } from './rb3eTypes';
import { CueData, CueType, defaultCueData, lightingCueMap, StrobeState } from '../../cues/cueTypes';
import { AbstractCueHandler } from '../../cueHandlers/AbstractCueHandler';


// Use the same port that RB3Enhanced sends to.
const PORT = 21070;

// "RB3E" in ASCII -> 0x52, 0x42, 0x33, 0x45
const PROTOCOL_MAGIC = Buffer.from([0x52, 0x42, 0x33, 0x45]);

// Platform mapping from RB3Enhanced
const PLATFORM_MAP: Record<number, string> = {
  [Rb3PlatformID.RB3E_PLATFORM_XBOX]: 'Xbox',
  [Rb3PlatformID.RB3E_PLATFORM_XENIA]: 'Xenia',
  [Rb3PlatformID.RB3E_PLATFORM_WII]: 'Wii',
  [Rb3PlatformID.RB3E_PLATFORM_DOLPHIN]: 'Dolphin',
  [Rb3PlatformID.RB3E_PLATFORM_PS3]: 'PS3',
  [Rb3PlatformID.RB3E_PLATFORM_RPCS3]: 'RPCS3',
  [Rb3PlatformID.RB3E_PLATFORM_UNKNOWN]: 'Unknown'
};

// Track type mapping from RB3Enhanced
const TRACK_TYPE_MAP: Record<number, Rb3TrackType> = {
  0: 'Guitar',
  1: 'Bass', 
  2: 'Drums',
  3: 'Vocals',
  4: 'Keys',
  5: 'Harmony',
  255: 'Unknown'
};

// Difficulty mapping from RB3Enhanced
const DIFFICULTY_MAP: Record<number, Rb3Difficulty> = {
  0: 'Easy',
  1: 'Medium',
  2: 'Hard',
  3: 'Expert',
  255: 'Unknown'
};


/**
 * RB3Enhanced Network Listener
 * 
 * This class listens for UDP packets from RB3Enhanced and parses all available data types:
 * - Platform detection (Xbox, Wii, PS3, emulators)
 * - Game state (menus vs in-game)
 * - Song information (name, artist, short name)
 * - Score data (total score, member scores, stars)
 * - StageKit lighting and effects (fog, strobe, LED colors)
 * - Band information (member details, difficulties, track types)
 * - Venue and screen information
 * - Mod data (DX data for custom information)
 * - Build tag information
 * 
 * The listener emits both general 'rb3eData' events with complete data and specific events
 * for individual data types.
 * 
 * @example
 * ```typescript
 * const listener = new Rb3eNetworkListener(cueHandler);
 * 
 * // Listen for all RB3E data
 * listener.on('rb3eData', (data) => {
 *   console.log('Received RB3E data:', data);
 * });
 * 
 * // Listen for specific song information
 * listener.on('rb3eSongName', (songName) => {
 *   console.log('Song changed to:', songName);
 * });
 * 
 * // Listen for platform changes
 * listener.on('rb3ePlatform', (platform) => {
 *   console.log('Platform detected:', platform);
 * });
 * 
 * listener.start();
 * ```
 */
export class Rb3eNetworkListener extends EventEmitter {
  private server: dgram.Socket | null = null;
  private listening = false;
  private cueHandler: AbstractCueHandler;
  private lastData: { header: any; payload: Buffer; cueData: CueData } | null = null;
  // Track the current LED brightness setting
  private _currentBrightness: 'low' | 'medium' | 'high' = 'medium';

  constructor(cueHandler: AbstractCueHandler) {
    super();
    this.cueHandler = cueHandler;
    console.log('RB3ENetworkListener initialized.');
  }

  public start() {
    if (this.listening) {
      console.warn('RB3ENetworkListener is already running.');
      return;
    }
    this.server = dgram.createSocket('udp4');
    this.setupServerEvents();
    this.server.bind(PORT, () => {
      this.listening = true;
      console.log(`RB3ENetworkListener started and listening on port ${PORT}`);
    });
  }

  public stop() {
    if (!this.listening) {
      console.warn('RB3ENetworkListener is not running.');
      return;
    }
    if (this.server) {
      this.server.close(() => {
        console.log('RB3ENetworkListener server closed.');
        this.listening = false;
        this.server = null;
      });
    }
  }

  public shutdown() {
    this.stop();
  }


  private setupServerEvents() {
    if (!this.server) return;

    this.server.on('error', (err) => {
      console.error(`Server error:\n${err.stack}`);
      this.server?.close();
      this.listening = false;
    });

    this.server.on('listening', () => {
      const address = this.server?.address();
      if (address) {
        console.log(`Listening for RB3E events on ${address.address}:${address.port}`);
      }
    });

    this.server.on('message', (msg) => {
      try {
        this.deserializePacket(msg);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });
  }

  private deserializePacket(buffer: Buffer) {
    let offset = 0;

    try {
      // Minimum 8 bytes for RB3E header (magic + 4 more).
      if (buffer.length < 8) {
        console.warn(`Received packet is too short: ${buffer.length} bytes`);
        return;
      }

      // Check "RB3E" magic
      const magic = buffer.subarray(0, 4);
      if (!(magic[0] === PROTOCOL_MAGIC[0] && magic[1] === PROTOCOL_MAGIC[1] && 
            magic[2] === PROTOCOL_MAGIC[2] && magic[3] === PROTOCOL_MAGIC[3])) {
        console.warn(`Invalid protocol magic: ${magic.toString('hex')}`);
        return;
      }
      offset += 4;

      // Read the main header fields.
      const protocolVersion = buffer.readUInt8(offset++);
      const packetType = buffer.readUInt8(offset++);
      const payloadSize = buffer.readUInt8(offset++);
      const platform = buffer.readUInt8(offset++);

      // Validate packet type
      if (packetType > 10) {
        console.warn(`Invalid packet type: ${packetType}`);
        return;
      }

      // Validate payload size
      if (payloadSize > 255) {
        console.warn(`Invalid payload size: ${payloadSize}`);
        return;
      }

      if (buffer.length < offset + payloadSize) {
        console.warn(`Packet payload is too short: expected ${payloadSize}, got ${buffer.length - offset}`);
        return;
      }

      // Extract payload
      const payload = buffer.slice(offset, offset + payloadSize);
      offset += payloadSize;

      const header = {
        magic: 'RB3E',
        protocolVersion,
        type: packetType,
        payloadSize,
        platform,
        timestamp: Date.now()
      };

      const cueData: CueData = { ...defaultCueData };
      
      // Store platform information from the packet header
      cueData.rb3Platform = PLATFORM_MAP[platform] || 'Unknown';

      switch (packetType) {
        case Rb3ePacketType.EVENT_ALIVE:
          this.handleAlive(payload, cueData);
          break;

        case Rb3ePacketType.EVENT_STATE:
          this.handleState(payload, cueData);
          break;

        case Rb3ePacketType.EVENT_SONG_NAME:
          this.handleSongName(payload, cueData);
          break;

        case Rb3ePacketType.EVENT_SONG_ARTIST:
          this.handleSongArtist(payload, cueData);
          break;

        case Rb3ePacketType.EVENT_SONG_SHORTNAME:
          this.handleSongShortName(payload, cueData);
          break;

        case Rb3ePacketType.EVENT_SCORE:
          this.handleScore(payload, cueData);
          break;

        case Rb3ePacketType.EVENT_STAGEKIT:
          this.handleStageKit(payload, cueData);
          break;

        case Rb3ePacketType.EVENT_BAND_INFO:
          this.handleBandInfo(payload, cueData);
          break;

        case Rb3ePacketType.EVENT_VENUE_NAME:
          this.handleVenueName(payload, cueData);
          break;

        case Rb3ePacketType.EVENT_SCREEN_NAME:
          this.handleScreenName(payload, cueData);
          break;

        case Rb3ePacketType.EVENT_DX_DATA:
          this.handleDxData(payload, cueData);
          break;

        default:
          console.warn(`Unknown RB3E packet type: ${packetType}`);
          return;
      }

      // De‐duplicate repeated data
      if (this.lastData && this.isDataEqual(this.lastData, { header, payload, cueData })) {
        return;
      }
      this.lastData = { header, payload, cueData };
      
      // Emit the enhanced cue data for external consumers
      this.emit('rb3eData', cueData);
      
      // Emit specific events for different data types
      if (cueData.rb3SongName) this.emit('rb3eSongName', cueData.rb3SongName);
      if (cueData.rb3SongArtist) this.emit('rb3eSongArtist', cueData.rb3SongArtist);
      if (cueData.rb3SongShortName) this.emit('rb3eSongShortName', cueData.rb3SongShortName);
      if (cueData.rb3VenueName) this.emit('rb3eVenueName', cueData.rb3VenueName);
      if (cueData.rb3ScreenName) this.emit('rb3eScreenName', cueData.rb3ScreenName);
      if (cueData.rb3BandInfo) this.emit('rb3eBandInfo', cueData.rb3BandInfo);
      if (cueData.rb3ModData) this.emit('rb3eModData', cueData.rb3ModData);
      if (cueData.rb3Platform) this.emit('rb3ePlatform', cueData.rb3Platform);
      if (cueData.rb3BuildTag) this.emit('rb3eBuildTag', cueData.rb3BuildTag);
      
      // Log summary of the data received
      this.logDataSummary(cueData, packetType);
      
    } catch (error) {
      console.error('Error processing RB3E packet:', error);
      console.error('Packet buffer:', buffer.toString('hex'));
    }
  }

  private isDataEqual(data1: any, data2: any): boolean {
    if (data1.header.type !== data2.header.type) return false;
    if (data1.payload.length !== data2.payload.length) return false;
    return data1.payload.equals(data2.payload);
  }

  public destroy() {
    this.stop();
  }

  /**
   * Get the current enhanced cue data
   * @returns The current CueData with all available RB3E information
   */
  public getCurrentData(): CueData | null {
    return this.lastData ? this.lastData.cueData : null;
  }

  /**
   * Check if we have received basic RB3E information
   * @returns True if we have platform and basic game state information
   */
  public hasBasicInfo(): boolean {
    if (!this.lastData) return false;
    const data = this.lastData.cueData;
    return !!(data.rb3Platform && data.rb3Platform !== 'Unknown');
  }

  /**
   * Check if we have complete song information
   * @returns True if we have song name, artist, and basic metadata
   */
  public hasSongInfo(): boolean {
    if (!this.lastData) return false;
    const data = this.lastData.cueData;
    return !!(data.rb3SongName && data.rb3SongArtist && data.rb3SongShortName);
  }

  /**
   * Check if we have band information
   * @returns True if we have band member details
   */
  public hasBandInfo(): boolean {
    if (!this.lastData) return false;
    const data = this.lastData.cueData;
    return !!(data.rb3BandInfo && data.rb3BandInfo.members.length > 0);
  }

  /**
   * Get the current platform information
   * @returns The current platform or 'Unknown'
   */
  public getCurrentPlatform(): string {
    if (!this.lastData) return 'Unknown';
    return this.lastData.cueData.rb3Platform || 'Unknown';
  }

  /**
   * Get the current build tag
   * @returns The current build tag or empty string
   */
  public getCurrentBuildTag(): string {
    if (!this.lastData) return '';
    return this.lastData.cueData.rb3BuildTag || '';
  }

  /**
   * Get the current song information
   * @returns Object with song name, artist, and short name
   */
  public getCurrentSongInfo(): { name: string; artist: string; shortName: string } | null {
    if (!this.lastData) return null;
    const data = this.lastData.cueData;
    if (!data.rb3SongName || !data.rb3SongArtist || !data.rb3SongShortName) return null;
    
    return {
      name: data.rb3SongName,
      artist: data.rb3SongArtist,
      shortName: data.rb3SongShortName
    };
  }

  /**
   * Get the current score information
   * @returns Object with total score, member scores, and stars
   */
  public getCurrentScoreInfo(): { totalScore: number; memberScores: number[]; stars: number } | null {
    if (!this.lastData) return null;
    const data = this.lastData.cueData;
    if (data.totalScore === undefined || !data.memberScores || data.stars === undefined) return null;
    
    return {
      totalScore: data.totalScore,
      memberScores: data.memberScores,
      stars: data.stars
    };
  }

  /**
   * Get the current venue and screen information
   * @returns Object with venue name and screen name
   */
  public getCurrentVenueInfo(): { venueName: string; screenName: string } | null {
    if (!this.lastData) return null;
    const data = this.lastData.cueData;
    if (!data.rb3VenueName || !data.rb3ScreenName) return null;
    
    return {
      venueName: data.rb3VenueName,
      screenName: data.rb3ScreenName
    };
  }

  /**
   * Check if we have received any RB3E data
   * @returns True if we have received at least one packet
   */
  public hasReceivedData(): boolean {
    return this.lastData !== null;
  }

  /**
   * Get the timestamp of the last received data
   * @returns Timestamp in milliseconds or null if no data received
   */
  public getLastDataTimestamp(): number | null {
    return this.lastData ? this.lastData.header.timestamp : null;
  }

  // Helper Methods for non‐lighting RB3E events
  private handleAlive(payload: Buffer, cueData: CueData) {
    const txt = this.readNullTerminatedString(payload);
    cueData.rb3BuildTag = txt;
    console.log(`RB3E_EVENT_ALIVE => ${txt}`);
  }

  private handleState(payload: Buffer, _cueData: CueData) {
    // Single byte: 0 = menus, 1 = in‐game
    if (payload.length < 1) return;
    const stateByte = payload.readUInt8(0);
    const gameState:Rb3GameState = stateByte === 0 ? 'Menus' : 'InGame';

    console.log(`RB3E_EVENT_STATE => ${gameState}`);

    if (typeof this.cueHandler['handleGameState'] === 'function') {
      this.cueHandler['handleGameState'](gameState);
    }
   
  }

  private handleSongName(payload: Buffer, cueData: CueData) {
    const name = this.readNullTerminatedString(payload);
    cueData.rb3SongName = name;
    console.log(`RB3E_EVENT_SONG_NAME => ${name}`);
  }

  private handleSongArtist(payload: Buffer, cueData: CueData) {
    const artist = this.readNullTerminatedString(payload);
    cueData.rb3SongArtist = artist;
    console.log(`RB3E_EVENT_SONG_ARTIST => ${artist}`);
  }

  private handleSongShortName(payload: Buffer, cueData: CueData) {
    const shortName = this.readNullTerminatedString(payload);
    cueData.rb3SongShortName = shortName;
    console.log(`RB3E_EVENT_SONG_SHORTNAME => ${shortName}`);
  }

  private handleScore(payload: Buffer, _cueData: CueData) {
    // struct is 4 + 4*4 + 1 = 21 bytes total
    if (payload.length < 21) {
      console.warn(`Score payload too short, expected >=21, got ${payload.length}`);
      return;
    }
    const totalScore = payload.readInt32LE(0);
    const memberScores = [
      payload.readInt32LE(4),
      payload.readInt32LE(8),
      payload.readInt32LE(12),
      payload.readInt32LE(16),
    ];
    const stars = payload.readUInt8(20);

    _cueData.totalScore = totalScore;
    _cueData.memberScores = memberScores;
    _cueData.stars = stars;
    console.log(`RB3E_EVENT_SCORE => totalScore=${totalScore}, stars=${stars}, memberScores=${memberScores}`);
  }

  private handleStageKit(payload: Buffer, _cueData: CueData) {
    // StageKit struct has 2 bytes: LeftChannel, RightChannel
    if (payload.length < 2) {
      console.warn(`STAGEKIT payload too short: expected 2 bytes, got ${payload.length}`);
      return;
    }
    const leftChannel = payload.readUInt8(0);
    const rightChannel = payload.readUInt8(1);

    // Process the left channel command (lighting cues)
    this.processLeftChannelCommand(leftChannel, _cueData);
    
    // Process the right channel command (fog, strobe, LEDs)
    this.processRightChannelCommand(rightChannel, _cueData);

  //  console.log(`RB3E_EVENT_STAGEKIT => left=${leftChannel}, right=${rightChannel}, fog=${_cueData.fogState}, strobe=${_cueData.strobeState}`);
  }

  /**
   * Process the left channel command from the StageKit packet
   * @param leftChannel The left channel value from the StageKit packet
   * @param cueData The cue data object to update with the left channel information
   */

  private processLeftChannelCommand(leftChannel: number, cueData: CueData): void {
    // Handle brightness settings first
    if (leftChannel === 34) {
      this._currentBrightness = 'low';
 //     console.log(`Brightness set to: low (from left channel ${leftChannel})`);
      return;
    } else if (leftChannel === 68) {
      this._currentBrightness = 'medium';
 //     console.log(`Brightness set to: medium (from left channel ${leftChannel})`);
      return;
    } else if (leftChannel === 128) {
      this._currentBrightness = 'medium';
//      console.log(`Brightness set to: medium (from left channel ${leftChannel})`);
      return;
    } else if (leftChannel === 136) {
      this._currentBrightness = 'high';
 //     console.log(`Brightness set to: high (from left channel ${leftChannel})`);
      return;
    } else if(leftChannel === 255){ 
      // Note: this value  not appear to be documented in the RB3E protocol, but it looks like it 
      // should set everything white. Works well with Bulls on Parade for example.
      // Using low for more contrast with Stomp, which is very similar.
      const colorName = "white";
   //   this._currentBrightness = 'low';
      if (typeof this.cueHandler['handleLedColor'] === 'function') {
        this.cueHandler['handleLedColor'](colorName + ":" + this._currentBrightness);
      }
     return;
    }else if(leftChannel === 170){ 
     // Note: this value does not appear to be documented in the RB3E protocol. 
    }else if(leftChannel === 64){ 
       // Note: this value does not appear to be documented in the RB3E protocol. 
      // Could be an orange colour?
      const colorName = "orange";
      //this._currentBrightness = 'high'; //Seems to be an accent, used on certain hits
      if (typeof this.cueHandler['handleLedColor'] === 'function') {
        this.cueHandler['handleLedColor'](colorName + ":" + this._currentBrightness);
      }
    }




    // Map leftChannel to a lighting cue 
    const lightingCue = lightingCueMap[leftChannel] || CueType.Unknown;
    cueData.lightingCue = lightingCue;
    
  //  console.log(`Processing left channel command: ${leftChannel} -> ${lightingCue}`);
    
    if (lightingCue !== CueType.Unknown) {
      this.cueHandler.handleCue(lightingCue, cueData);
    } else {
      console.log(`Unknown lighting cue for left channel value: ${leftChannel}`);
    }
  }
 


  /**
   * Process the right channel command from the StageKit packet
   * @param rightChannel The right channel value from the StageKit packet
   * @param cueData The cue data object to update with the right channel information
   */
  private processRightChannelCommand(rightChannel: number, cueData: CueData): void {
    // Special case for disabling all effects
    if (rightChannel === Rb3RightChannel.DisableAll || rightChannel === 255) {
      this.handleDisableAll(cueData);
      return;
    }

    // Handle fog control commands
    if (rightChannel === Rb3RightChannel.FogOn) {
      this.handleFog(true, cueData);
      return;
    } else if (rightChannel === Rb3RightChannel.FogOff) {
      this.handleFog(false, cueData);
      return;
    }

    // Handle strobe control commands
    if (rightChannel >= Rb3RightChannel.StrobeSlow && rightChannel <= Rb3RightChannel.StrobeOff) {
      let strobeState: StrobeState;
      switch (rightChannel) {
        case Rb3RightChannel.StrobeSlow:
          strobeState = "Strobe_Slow" as StrobeState;
          break;
        case Rb3RightChannel.StrobeMedium:
          strobeState = "Strobe_Medium" as StrobeState;
          break;
        case Rb3RightChannel.StrobeFast:
          strobeState = "Strobe_Fast" as StrobeState;
          break;
        case Rb3RightChannel.StrobeFastest:
          strobeState = "Strobe_Fastest" as StrobeState;
          break;
        case Rb3RightChannel.StrobeOff:
        default:
          strobeState = "Strobe_Off" as StrobeState;
          break;
      }
      this.handleStrobe(strobeState, cueData);
      return;
    }

    // Handle LED colour commands - extracting color bits
    const redBit = (rightChannel & 0x80) !== 0;    // 0x80 = 128 (bit 7)
    const greenBit = (rightChannel & 0x40) !== 0;  // 0x40 = 64 (bit 6)
    const blueBit = (rightChannel & 0x20) !== 0;   // 0x20 = 32 (bit 5)
    
    // Only process if at least one color bit is set
    if (redBit || greenBit || blueBit) {
      let colorName: string;
      
      // Determine color based on bits (color mixing)
      if (redBit && greenBit && blueBit) {
        colorName = "white";
      } else if (redBit && greenBit) {
        colorName = "yellow"; // Red + Green = Yellow/Amber
      } else if (redBit && blueBit) {
        colorName = "purple"; // Red + Blue = Purple/Magenta
      } else if (greenBit && blueBit) {
        colorName = "teal";   // Green + Blue = Cyan/Teal
      } else if (redBit) {
        colorName = "red";
      } else if (greenBit) {
        colorName = "green";
      } else if (blueBit) {
        colorName = "blue";
      } else {
        console.log(`Unexpected LED color command: 0x${rightChannel.toString(16)}`);
        return;
      }
      
      // Set the LED color in cueData with brightness info
      cueData.ledColor = colorName;
      
      // If the handler has a specific LED color handling method, call it with the color name
      if (typeof this.cueHandler['handleLedColor'] === 'function') {
        this.cueHandler['handleLedColor'](colorName + ":" + this._currentBrightness);
      }
      
      return;
    }

    console.log(`Unhandled right channel command: 0x${rightChannel.toString(16)}`);
  }

  /**
   * Handle fog state changes from the right channel
   * @param isEnabled Whether fog should be enabled
   * @param cueData The cue data to update
   */
  private handleFog(_isEnabled: boolean, _cueData: CueData): void {
    // We aren't handling fog
  }

  /**
   * Handle strobe state changes from the right channel
   * @param strobeState The strobe state to set
   * @param cueData The cue data to update
   */
  private handleStrobe(strobeState: StrobeState, cueData: CueData): void {
    cueData.strobeState = strobeState;
    console.log(`Strobe state changed to: ${strobeState}`);
   
    this.cueHandler.handleCue(CueType.Strobe, cueData);

    /*
    if (typeof this.cueHandler['handleStrobe'] === 'function') {
      this.cueHandler['handleStrobe'](cueData);
    }
      */
  }

  /**
   * Handle the DisableAll command from the right channel
   * @param cueData The cue data to update
   */
  private handleDisableAll(cueData: CueData): void {
    cueData.fogState = false;
    cueData.strobeState = "Strobe_Off" as StrobeState;
    cueData.ledColor = null;
    this._currentBrightness = 'medium'; // Reset brightness to default
    console.log("Disabled all effects");

    // Special case for RB3.
    if (typeof this.cueHandler['handleDisableAll'] === 'function') {
      this.cueHandler['handleDisableAll']();
    }
    
  }

  private handleBandInfo(payload: Buffer, cueData: CueData) {
    // 3 arrays of 4 bytes each: existence, difficulty, trackType
    if (payload.length < 12) {
      console.warn(`Band info payload too short: expected >=12, got ${payload.length}`);
      return;
    }
    
    const members: Array<{
      exists: boolean;
      difficulty: Rb3Difficulty;
      trackType: Rb3TrackType;
    }> = [];
    
    for (let i = 0; i < 4; i++) {
      const exists = payload.readUInt8(i) !== 0;
      const difficulty = payload.readUInt8(4 + i);
      const trackType = payload.readUInt8(8 + i);
      
      members.push({
        exists,
        difficulty: DIFFICULTY_MAP[difficulty] || 'Unknown',
        trackType: TRACK_TYPE_MAP[trackType] || 'Unknown'
      });
    }
    
    cueData.rb3BandInfo = { members };
    console.log(`RB3E_EVENT_BAND_INFO => members: ${JSON.stringify(members)}`);
  }

  private handleVenueName(payload: Buffer, cueData: CueData) {
    const venue = this.readNullTerminatedString(payload);
    cueData.rb3VenueName = venue;
    console.log(`RB3E_EVENT_VENUE_NAME => ${venue}`);
  }

  private handleScreenName(payload: Buffer, cueData: CueData) {
    const screen = this.readNullTerminatedString(payload);
    cueData.rb3ScreenName = screen;
    console.log(`RB3E_EVENT_SCREEN_NAME => ${screen}`);
  }

  private handleDxData(payload: Buffer, cueData: CueData) {
    // Typically 10 bytes identifyValue + up to 240 for string
    if (payload.length < 10) {
      console.warn(`DX data payload too short: expected >=10, got ${payload.length}`);
      return;
    }
    
    const identifyValue = this.readNullTerminatedString(payload.subarray(0, 10));
    const string = this.readNullTerminatedString(payload.subarray(10));
    
    cueData.rb3ModData = {
      identifyValue,
      string
    };
    
    console.log(`RB3E_EVENT_DX_DATA => identifyValue: ${identifyValue}, string: ${string}`);
  }

  private readNullTerminatedString(buf: Buffer): string {
    const nullIndex = buf.indexOf(0x00);
    if (nullIndex !== -1) {
      return buf.subarray(0, nullIndex).toString('utf8');
    }
    // If no null terminator found, return entire buffer as a string
    return buf.toString('utf8');
  }

  private logDataSummary(cueData: CueData, packetType: number) {
    const summary: string[] = [];
    if (cueData.rb3Platform) summary.push(`Platform: ${cueData.rb3Platform}`);
    if (cueData.rb3SongName) summary.push(`Song: ${cueData.rb3SongName}`);
    if (cueData.rb3SongArtist) summary.push(`Artist: ${cueData.rb3SongArtist}`);
    if (cueData.rb3SongShortName) summary.push(`Short Name: ${cueData.rb3SongShortName}`);
    if (cueData.totalScore !== undefined) summary.push(`Score: ${cueData.totalScore}`);
    if (cueData.stars !== undefined) summary.push(`Stars: ${cueData.stars}`);
    if (cueData.memberScores && cueData.memberScores.length > 0) summary.push(`Member Scores: ${cueData.memberScores.join(', ')}`);
    if (cueData.rb3BandInfo && cueData.rb3BandInfo.members.length > 0) summary.push(`Band Info: ${JSON.stringify(cueData.rb3BandInfo.members)}`);
    if (cueData.rb3VenueName) summary.push(`Venue: ${cueData.rb3VenueName}`);
    if (cueData.rb3ScreenName) summary.push(`Screen: ${cueData.rb3ScreenName}`);
    if (cueData.rb3ModData) summary.push(`Mod Data: ${JSON.stringify(cueData.rb3ModData)}`);
    if (cueData.lightingCue !== CueType.Unknown) summary.push(`Lighting Cue: ${cueData.lightingCue}`);
    if (cueData.ledColor) summary.push(`LED Color: ${cueData.ledColor}`);
    if (cueData.strobeState) summary.push(`Strobe State: ${cueData.strobeState}`);
    if (cueData.fogState !== undefined) summary.push(`Fog State: ${cueData.fogState ? 'On' : 'Off'}`);

    console.log(`Received RB3E packet type ${packetType} with summary: ${summary.join(', ')}`);
  }
}


/* Protocol details:

RB3Enhanced UDP Left Channel Values

Standard Lighting Cues (0-32)



Direct LED Control Values
These values provide direct control over LED hardware, bypassing the predefined cue system:
Basic LED Color Controls
| Value | Hex | Description |
|-------|-----|-------------|
| 32 | 0x20 | Blue LEDs (Base) |
| 64 | 0x40 | Green LEDs (Base) |
| 96 | 0x60 | Yellow LEDs (Base) |
| 128 | 0x80 | Red LEDs (Base) |


LED Modifiers and Combinations
| Value | Hex | Description |
|-------|-----|-------------|
| 33-63 | 0x21-0x3F | Blue LEDs with various intensity/pattern modifiers |
| 65-95 | 0x41-0x5F | Green LEDs with various intensity/pattern modifiers |
| 97-127 | 0x61-0x7F | Yellow LEDs with various intensity/pattern modifiers |
| 129-159 | 0x81-0x9F | Red LEDs with various intensity/pattern modifiers |


Common Specific Values
| Value | Hex | Description |
|-------|-----|-------------|
| 34 | 0x22 | Blue LEDs with intensity modifier (typically brighter) |
| 68 | 0x44 | Green LEDs with intensity modifier (typically brighter) |
| 136 | 0x88 | Red LEDs with intensity modifier (typically brighter) |
| 160 | 0xA0 | Combined LED colors (custom effect) |
| 192 | 0xC0 | Combined LED colors (custom effect) |
| 224 | 0xE0 | Combined LED colors (custom effect) |


Special Control Values
| Value | Hex | Description |
|-------|-----|-------------|
| 255 | 0xFF | DisableAll - Turns off all lighting effects |
| 240-254 | 0xF0-0xFE | Reserved for special control commands |


Bit Structure for Direct LED Control
For values 32 and above, the bit structure typically follows this pattern:
bit
When multiple color bits are set, they blend to create mixed colors:
Red (0x80) + Green (0x40) = Yellow/Amber (0xC0)
Red (0x80) + Blue (0x20) = Purple/Magenta (0xA0)
Green (0x40) + Blue (0x20) = Cyan/Teal (0x60)
Red + Green + Blue = White (0xE0)

Usage Notes
Cue Values (0-32): These trigger predefined lighting patterns with complex behavior and are the preferred way to create coordinated lighting effects.
Direct Control Values (32+): These values bypass the cue system to provide direct hardware control. Use these for:
Custom effects not available in predefined cues
Fine-tuned control over specific LEDs
Specialized hardware situations
Implementation Variation: Different RB3Enhanced implementations may interpret the direct control values slightly differently based on their hardware capabilities.
Mixed Usage: Some implementations might use a combination approach, where left channel values 0-32 trigger cues, while right channel values provide hardware-specific controls.
*/