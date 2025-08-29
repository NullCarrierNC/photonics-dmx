import * as dgram from 'dgram';
import { EventEmitter } from 'events';
import { Rb3ePacketType, Rb3GameState, Rb3PlatformID, Rb3TrackType, Rb3Difficulty } from './rb3eTypes';
import { CueData } from '../../cues/cueTypes';


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
  private lastData: { header: any; payload: Buffer; cueData: CueData } | null = null;
  // Track the current LED brightness setting
  private _currentBrightness: 'low' | 'medium' | 'high' = 'medium';
  // Packet counter for debugging
  private packetCount = 0;

  constructor() {
    super();
    console.log('Rb3eNetworkListener initialized as event emitter.');
  }

  public start() {
    if (this.listening) {
      console.warn('RB3ENetworkListener is already running.');
      return;
    }
    console.log(`RB3ENetworkListener: Starting UDP server on port ${PORT}...`);
    this.server = dgram.createSocket('udp4');
    this.setupServerEvents();
    this.server.bind(PORT, () => {
      this.listening = true;
      console.log(`RB3ENetworkListener started and listening on port ${PORT}`);
    });
    
    // Add error handling for bind failures
    this.server.on('error', (err) => {
      console.error(`RB3ENetworkListener: Bind error:`, err);
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
    ///  console.log(`RB3ENetworkListener: Received UDP message of ${msg.length} bytes`);
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
      
            this.packetCount++;
      
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
      const payload = buffer.subarray(offset, offset + payloadSize);
      offset += payloadSize;

      const header = {
        magic: 'RB3E',
        protocolVersion,
        type: packetType,
        payloadSize,
        platform,
        timestamp: Date.now()
      };

      const cueData: CueData = {
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
        autoGenTrack: false,
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

      // Store platform information from the packet header
      cueData.rb3Platform = PLATFORM_MAP[platform] || 'Unknown';

      switch (packetType) {
        case Rb3ePacketType.EVENT_ALIVE:
          this.handleAlive(payload, cueData);
          break;

        case Rb3ePacketType.EVENT_STATE:
          this.handleGameState(payload, cueData);
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
    //    console.log(`RB3E: Skipping duplicate data for packet type ${packetType}`);
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
    //  this.logDataSummary(cueData, packetType);

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


  private handleGameState(payload: Buffer, _cueData: CueData) {
    // Single byte: 0 = menus, 1 = in‐game
    if (payload.length < 1) return;
    const stateByte = payload.readUInt8(0);
    const gameState: Rb3GameState = stateByte === 0 ? 'Menus' : 'InGame';

    console.log(`RB3E_EVENT_STATE => ${gameState}`);

    //TODO: Tie in game state to the rest of the system
    this.emit('rb3e:gameState', {
      gameState,
      platform: this.lastData?.cueData?.rb3Platform || 'Unknown',
      timestamp: Date.now()
    });

  }

  private handleSongName(payload: Buffer, cueData: CueData) {
    const name = this.readNullTerminatedString(payload);
    cueData.rb3SongName = name;

    // Emit song name event for event processors to handle
    this.emit('rb3e:songName', {
      songName: name,
      timestamp: Date.now()
    });

    console.log(`RB3E_EVENT_SONG_NAME => ${name}`);
  }

  private handleSongArtist(payload: Buffer, cueData: CueData) {
    const artist = this.readNullTerminatedString(payload);
    cueData.rb3SongArtist = artist;

    // Emit song artist event for event processors to handle
    this.emit('rb3e:songArtist', {
      songArtist: artist,
      timestamp: Date.now()
    });

    console.log(`RB3E_EVENT_SONG_ARTIST => ${artist}`);
  }

  private handleSongShortName(payload: Buffer, cueData: CueData) {
    const shortName = this.readNullTerminatedString(payload);
    cueData.rb3SongShortName = shortName;

    // Emit song short name event for event processors to handle
    this.emit('rb3e:songShortName', {
      songShortName: shortName,
      timestamp: Date.now()
    });

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

    // Emit score event for event processors to handle
    this.emit('rb3e:score', {
      totalScore,
      memberScores,
      stars,
      timestamp: Date.now()
    });

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

    // Parse RB3E bytes into clean StageKit data
    const stageKitData = this.parseStageKitData(leftChannel, rightChannel);

    this.emit('stagekit:data', stageKitData);
  }

  /**
   * Parse RB3E StageKit bytes into local StageKit data structure
   * @param leftChannel The left channel value (LED position bitmask)
   * @param rightChannel The right channel value (color bank or effect control)
   * @returns Clean StageKit data structure
   */
  private parseStageKitData(leftChannel: number, rightChannel: number): {
    positions: number[];
    color: string;
    brightness: 'low' | 'medium' | 'high';
    strobeEffect?: 'slow' | 'medium' | 'fast' | 'fastest' | 'off';
    timestamp: number;
  } {
    // Parse left channel as LED position bitmask
    const positions: number[] = [];
    for (let i = 0; i < 8; i++) {
      const bit = 1 << i;
      if (leftChannel & bit) {
        positions.push(i);
      }
    }

    // Parse right channel for colors and effects
    let color: string;
    let strobeEffect: 'slow' | 'medium' | 'fast' | 'fastest' | 'off' | undefined;
    
    // Check for strobe effects first
    switch (rightChannel) {
      case 3: // StrobeSlow
        strobeEffect = 'slow';
        color = 'off';
        break;
      case 4: // StrobeMedium
        strobeEffect = 'medium';
        color = 'off';
        break;
      case 5: // StrobeFast
        strobeEffect = 'fast';
        color = 'off';
        break;
      case 6: // StrobeFastest
        strobeEffect = 'fastest';
        color = 'off';
        break;
      case 7: // StrobeOff
        strobeEffect = 'off';
        color = 'off';
        break;
      case 32: // Blue LEDs (0x20)
        color = 'blue';
        break;
      case 64: // Green LEDs (0x40)
        color = 'green';
        break;
      case 96: // Yellow LEDs (0x60)
        color = 'yellow';
        break;
      case 128: // Red LEDs (0x80)
        color = 'red';
        break;
      case 0: // No color
        color = 'off';
        break;
      default:
        color = 'off';
        break;
    }

    return {
      positions,
      color,
      brightness: this._currentBrightness,
      strobeEffect,
      timestamp: Date.now()
    };
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

    // Emit band info event for event processors to handle
    this.emit('rb3e:bandInfo', {
      members,
      timestamp: Date.now()
    });

    console.log(`RB3E_EVENT_BAND_INFO => members: ${JSON.stringify(members)}`);
  }

  private handleVenueName(payload: Buffer, cueData: CueData) {
    const venue = this.readNullTerminatedString(payload);
    cueData.rb3VenueName = venue;

    // Emit venue name event for event processors to handle
    this.emit('rb3e:venueName', {
      venueName: venue,
      timestamp: Date.now()
    });

    console.log(`RB3E_EVENT_VENUE_NAME => ${venue}`);
  }

  private handleScreenName(payload: Buffer, cueData: CueData) {
    const screen = this.readNullTerminatedString(payload);
    cueData.rb3ScreenName = screen;

    // Emit screen name event for event processors to handle
    this.emit('rb3e:screenName', {
      screenName: screen,
      timestamp: Date.now()
    });

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

    // Emit DX data event for event processors to handle
    this.emit('rb3e:dxData', {
      identifyValue,
      string,
      timestamp: Date.now()
    });

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

  /* 
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
    if (cueData.lightingCue !== "NoCue") summary.push(`Lighting Cue: ${cueData.lightingCue}`);
    if (cueData.ledColor) summary.push(`LED Color: ${cueData.ledColor}`);
    if (cueData.strobeState) summary.push(`Strobe State: ${cueData.strobeState}`);
    if (cueData.fogState !== undefined) summary.push(`Fog State: ${cueData.fogState ? 'On' : 'Off'}`);

    console.log(`Received RB3E packet type ${packetType} with summary: ${summary.join(', ')}`);
  }
    */
}

