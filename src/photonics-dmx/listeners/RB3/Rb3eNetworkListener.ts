import dgram from 'dgram';
import { EventEmitter } from 'events';
import { Rb3ePacketType, Rb3GameState, Rb3RightChannel } from './rb3eTypes';
import { CueData, CueType, defaultCueData, lightingCueMap, StrobeState } from '../../cues/cueTypes';
import { AbstractCueHandler } from '../../cueHandlers/AbstractCueHandler';


// Use the same port that RB3Enhanced sends to.
const PORT = 21070;

// "RB3E" in ASCII -> 0x52, 0x42, 0x33, 0x45
const PROTOCOL_MAGIC = Buffer.from([0x52, 0x42, 0x33, 0x45]);


export class Rb3eNetworkListener extends EventEmitter {
  private server: dgram.Socket | null = null;
  private listening = false;
  private cueHandler: AbstractCueHandler;
  private lastData: { header: any; payload: Buffer } | null = null;
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

    // Minimum 8 bytes for RB3E header (magic + 4 more).
    if (buffer.length < 8) {
      console.warn(`Received packet is too short: ${buffer.length} bytes`);
      return;
    }

    // Check "RB3E" magic
    const magic = buffer.slice(0, 4);
    if (!magic.equals(PROTOCOL_MAGIC)) {
      console.warn(`Invalid protocol magic: ${magic.toString('hex')}`);
      return;
    }
    offset += 4;

    // Read the main header fields.
    const protocolVersion = buffer.readUInt8(offset++);
    const packetType = buffer.readUInt8(offset++);
    const payloadSize = buffer.readUInt8(offset++);
    const platform = buffer.readUInt8(offset++);

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
        break;
    }

    // De‐duplicate repeated data
    if (this.lastData && this.isDataEqual(this.lastData, { header, payload })) {
      return;
    }
    this.lastData = { header, payload };
  }

  private isDataEqual(data1: any, data2: any): boolean {
    if (data1.header.type !== data2.header.type) return false;
    if (data1.payload.length !== data2.payload.length) return false;
    return data1.payload.equals(data2.payload);
  }

  public destroy() {
    this.stop();
  }

  // Helper Methods for non‐lighting RB3E events
  private handleAlive(payload: Buffer, _cueData: CueData) {
    const txt = this.readNullTerminatedString(payload);
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

  private handleSongName(payload: Buffer, _cueData: CueData) {
    const name = this.readNullTerminatedString(payload);
    console.log(`RB3E_EVENT_SONG_NAME => ${name}`);
   
  }

  private handleSongArtist(payload: Buffer, _cueData: CueData) {
    const artist = this.readNullTerminatedString(payload);
    console.log(`RB3E_EVENT_SONG_ARTIST => ${artist}`);
   
  }

  private handleSongShortName(payload: Buffer, _cueData: CueData) {
    const shortName = this.readNullTerminatedString(payload);
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

  private handleBandInfo(payload: Buffer, _cueData: CueData) {
    // 3 arrays of 4 bytes each: existence, difficulty, trackType
    console.log(`RB3E_EVENT_BAND_INFO => length=${payload.length}`);
  }

  private handleVenueName(payload: Buffer, _cueData: CueData) {
    const venue = this.readNullTerminatedString(payload);
    console.log(`RB3E_EVENT_VENUE_NAME => ${venue}`);
   
  }

  private handleScreenName(payload: Buffer, _cueData: CueData) {
    const screen = this.readNullTerminatedString(payload);
    console.log(`RB3E_EVENT_SCREEN_NAME => ${screen}`);
   
  }

  private handleDxData(payload: Buffer, _cueData: CueData) {
    // Typically 10 bytes identifyValue + up to 240 for string
    console.log(`RB3E_EVENT_DX_DATA => length=${payload.length}`);
  }

  private readNullTerminatedString(buf: Buffer): string {
    const nullIndex = buf.indexOf(0x00);
    if (nullIndex !== -1) {
      return buf.subarray(0, nullIndex).toString('utf8');
    }
    // If no null terminator found, return entire buffer as a string
    return buf.toString('utf8');
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