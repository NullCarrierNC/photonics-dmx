import dgram from 'dgram';
import { EventEmitter } from 'events';

import {
  CueData,
  SongSection,
  PostProcessing,
  Beat,
  StrobeState,
  CueType,
  lightingCueMap,
  InstrumentNoteType,
  DrumNoteType
} from '../../cues/cueTypes';


import { BaseCueHandler } from '../../cueHandlers/BaseCueHandler';

enum PlatformByte {
  Unknown = 0,
  Windows = 1,
  Linux = 2,
  Mac = 3,
}

enum VenueSizeByte {
  NoVenue = 0,
  Small = 1,
  Large = 2,
}

enum SceneIndexByte {
  Unknown = 0,
  Menu = 1,
  Gameplay = 2,
  Score = 3,
  Calibration = 4,
}

enum PauseStateByte {
  AtMenu = 0,
  Unpaused = 1,
  Paused = 2,
}

enum SongSectionByte {
  None = 0,
  Chorus = 2,
  Verse = 5,
}

enum GuitarBassKeyboardNotesByte {
  None = 0,
  Open = 1 << 0,
  Green = 1 << 1,
  Red = 1 << 2,
  Yellow = 1 << 3,
  Blue = 1 << 4,
  Orange = 1 << 5,
}

enum DrumNotesByte {
  None = 0,
  Kick = 1 << 0,
  RedDrum = 1 << 1,
  YellowDrum = 1 << 2,
  BlueDrum = 1 << 3,
  GreenDrum = 1 << 4,
  YellowCymbal = 1 << 5,
  BlueCymbal = 1 << 6,
  GreenCymbal = 1 << 7,
}

enum PostProcessingByte {
  Default = 0,
  Bloom = 1,
  Bright = 2,
  Saturation = 3,
  Contrast = 4,
  Sharpness = 5,
  Vignette = 6,
  ChromaticAberration = 7,
  MotionBlur = 8,
  DepthOfField = 9,
  AmbientOcclusion = 10,
}

enum KeyFrameByte {
  Off = 0,
  KeyframeFirst = 27,
  KeyframeNext = 28,
  KeyframePrevious = 29,
}

enum BeatByte {
  Measure = 0,
  Strong = 1,
  Weak = 2,
  Off = 3,
}

const PORT = 36107;
const PACKET_HEADER = 0x59415247; // 'YARG' in hex


export class YargNetworkListener extends EventEmitter {
  private server: dgram.Socket | null = null;
  private cueHandler: BaseCueHandler;

  //private logFilePath = path.join(app.getPath('documents'), 'yargLog.json');
  private listening = false;

  // Batch logging
//  private logBuffer: Record<string, any>[] = [];
//  private flushThreshold = 50; // Flush after every 50 messages
 // private flushIntervalMs = 5000; // Also flush every 5 seconds
  private flushTimer: NodeJS.Timeout | null = null;

  // To store the last processed data for change detection (excluding timestamp)
  private lastData: CueData | null = null;

  private lastLogData: Record<string, any> | null = null;

  constructor(cueHandler: BaseCueHandler) {
    super(); // Initialize EventEmitter
    this.cueHandler = cueHandler;

    console.log('YargNetworkListener initialized.');

    /*
    // Initialize the flush timer
    this.flushTimer = setInterval(() => {
      if (this.logBuffer.length > 0) {
        this.flushLogBuffer();
      }
    }, this.flushIntervalMs);

    // Ensure logs are flushed on application exit
    process.on('exit', () => this.flushLogBuffer());
    process.on('SIGINT', () => {
      this.flushLogBuffer();
      process.exit();
    });
    process.on('SIGTERM', () => {
      this.flushLogBuffer();
      process.exit();
    });
    */
  }

  public start() {
    if (this.listening) {
      console.warn("YargNetworkListener is already running.");
      return;
    }

    if (!this.server) {
      this.server = dgram.createSocket('udp4');
      this.setupServerEvents();
    }

    this.server.bind(PORT, () => {
      this.listening = true;
      console.log(`YargNetworkListener started and listening on port ${PORT}`);
    });
  }

  public stop() {
    if (!this.listening) {
      console.warn("YargNetworkListener is not running.");
      return;
    }

    if (this.server) {
      this.server.close(() => {
        console.log("YargNetworkListener server closed.");
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
        console.log(`Listening for YARG events on ${address.address}:${address.port}`);
      }
    });

    this.server.on('message', (msg) => {
      try {
        // console.log(`Received message of ${msg.length} bytes: ${msg.toString('hex')}`);
        this.deserializePacket(msg);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });
  }

  private deserializePacket(buffer: Buffer) {
    try {
      let offset = 0;

      // Ensure buffer has at least the minimum expected length
      const expectedLength =
        4 + // Header
        1 + // Datagram version
        1 + // Platform
        1 + // Scene
        1 + // Pause State
        1 + // Venue Size
        4 + // BPM
        1 + // Song Section
        1 + // Guitar Notes
        1 + // Bass Notes
        1 + // Drum Notes
        1 + // Keys Notes
        4 + // Vocal Note
        4 + // Harmony0 Note
        4 + // Harmony1 Note
        4 + // Harmony2 Note
        1 + // Lighting Cue
        1 + // PostProcessing
        1 + // FogState
        1 + // StrobeState
        1 + // Performer
        1 + // Beat
        1 + // Keyframe
        1 + // Bonus Effect
        1; // AutoGen Track

      if (buffer.length < expectedLength) {
        console.warn(`Received packet is too short: ${buffer.length} bytes`);
        return;
      }

      // Header (little-endian)
      const header = buffer.readUInt32LE(offset); offset += 4;
      if (header !== PACKET_HEADER) {
        console.warn(`Invalid packet header: 0x${header.toString(16)}`);
        return;
      }

      const datagramVersion = buffer.readUInt8(offset); offset += 1;
      const platformByte = buffer.readUInt8(offset); offset += 1;
      const sceneByte = buffer.readUInt8(offset); offset += 1;
      const pauseStateByte = buffer.readUInt8(offset); offset += 1;
      const venueSizeByte = buffer.readUInt8(offset); offset += 1;
      const beatsPerMinute = buffer.readFloatLE(offset); offset += 4;
      const songSectionByte = buffer.readUInt8(offset); offset += 1;
      const guitarNotesByte = buffer.readUInt8(offset); offset += 1;
      const bassNotesByte = buffer.readUInt8(offset); offset += 1;
      const drumNotesByte = buffer.readUInt8(offset); offset += 1;
      const keysNotesByte = buffer.readUInt8(offset); offset += 1;
      const vocalNote = buffer.readFloatLE(offset); offset += 4;
      const harmony0Note = buffer.readFloatLE(offset); offset += 4;
      const harmony1Note = buffer.readFloatLE(offset); offset += 4;
      const harmony2Note = buffer.readFloatLE(offset); offset += 4;
      const lightingCueValue = buffer.readUInt8(offset); offset += 1;
      const postProcessingByte = buffer.readUInt8(offset); offset += 1;
      const fogState = buffer.readUInt8(offset) === 1;
      offset += 1;

      const strobeStateValue = buffer.readUInt8(offset); offset += 1;
      const performer = buffer.readUInt8(offset); offset += 1;
      const beatValue = buffer.readUInt8(offset); offset += 1;
      const keyframeValue = buffer.readUInt8(offset); offset += 1;
      const bonusEffect = buffer.readUInt8(offset) === 1;
      offset += 1;
      
      // AutoGen track field (byte 24)
      const autoGenTrack = buffer.readUInt8(offset) === 1;
      offset += 1;

      const lightingCue = lightingCueMap[lightingCueValue] || `Unknown (${lightingCueValue})`;

      const YargCueData: CueData = {
        datagramVersion,
        platform: this.getPlatform(platformByte),
        currentScene: this.getCurrentScene(sceneByte),
        pauseState: this.getPauseState(pauseStateByte),
        venueSize: this.getVenueSize(venueSizeByte),
        beatsPerMinute,
        songSection: this.getSongSection(songSectionByte),
        guitarNotes: this.getInstrumentNotes(guitarNotesByte),
        bassNotes: this.getInstrumentNotes(bassNotesByte),
        drumNotes: this.getDrumNotes(drumNotesByte),
        keysNotes: this.getInstrumentNotes(keysNotesByte),
        vocalNote,
        harmony0Note,
        harmony1Note,
        harmony2Note,
        lightingCue,
        postProcessing: this.getPostProcessing(postProcessingByte),
        fogState,
        strobeState: this.getStrobeState(strobeStateValue),
        performer,
        autoGenTrack,
        beat: this.getBeatDescription(beatValue),
        keyframe: this.getKeyframeDescription(keyframeValue),
        bonusEffect,
      };
//console.log("Keyframe:", YargCueData.keyframe);
      // Change Detection: Compare with lastData (excluding timestamp)
      if (this.lastData && this.isDataEqual(this.lastData, YargCueData)) {
        // console.log("Received identical packet, skipping processing.");
        return;
      }

      const logData = {
        currentScene: YargCueData.currentScene,
        songSection: YargCueData.songSection,
        beatsPerMinute: YargCueData.beatsPerMinute,
        lightingCue: lightingCue,
        guitarNotes: YargCueData.guitarNotes,
        bassNotes: YargCueData.bassNotes,
        drumNotes: YargCueData.drumNotes,
        keysNotes: YargCueData.keysNotes,
        postProcessing: YargCueData.postProcessing,
        fogState: YargCueData.fogState,
        beat: YargCueData.beat,
        keyframe: YargCueData.keyframe,
        performer: YargCueData.performer,
        strobeState: YargCueData.strobeState,
      };

      // console.log("Listener Data:", logData);
      if (this.lastLogData && !this.isDataEqual(this.lastLogData, logData)) {
        this.lastLogData = logData;
        // console.log("\n", logData , ",")
      }

      this.lastLogData = logData;
      // Add to batch log buffer
      // this.logBuffer.push(dataWithTimestamp);

      // Track the beat:
      switch (YargCueData.beat) {
        case "Strong":
         // this.emit('handleBeat');
         this.cueHandler.handleBeat();
          break;
        case "Measure":
        //  this.emit('handleMeasure');
        this.cueHandler.handleMeasure();
          break;
      }

      // Handle keyframe events
      switch (YargCueData.keyframe) {
        case "First":
        case "Next":
        case "Previous":
          this.cueHandler.handleKeyframe();
          break;
      }

      // Handle known lighting cue by emitting an event
      const cueType = lightingCue; //lightingCueMap[lightingCueValue];
      if (cueType) {
        //this.emit('handleCue', cueType, YargCueData);
        this.cueHandler.handleCue(cueType, YargCueData)
      } else {
        console.warn(`Unknown lighting cue value received: ${lightingCue}`);
      }

      // Handle strobe state changes
      if (YargCueData.strobeState && YargCueData.strobeState !== "Strobe_Off") {
        console.log(`[YARG] Strobe state change: ${YargCueData.strobeState}`);
        // Convert strobe state to cue type and handle it
        let strobeCueType: CueType;
        switch (YargCueData.strobeState) {
          case "Strobe_Slow":
            strobeCueType = CueType.Strobe_Slow;
            break;
          case "Strobe_Medium":
            strobeCueType = CueType.Strobe_Medium;
            break;
          case "Strobe_Fast":
            strobeCueType = CueType.Strobe_Fast;
            break;
          case "Strobe_Fastest":
            strobeCueType = CueType.Strobe_Fastest;
            break;
          default:
            return; // Unknown strobe state
        }
        this.cueHandler.handleCue(strobeCueType, YargCueData);
      }

      // Handle individual drum notes
      YargCueData.drumNotes.forEach(note => {
        if (note !== DrumNoteType.None) {
          this.cueHandler.handleDrumNote(note, YargCueData);
        }
      });

      // Handle individual guitar notes
      YargCueData.guitarNotes.forEach(note => {
        if (note !== InstrumentNoteType.None) {
          this.cueHandler.handleGuitarNote(note, YargCueData);
        }
      });

      // Handle individual bass notes
      YargCueData.bassNotes.forEach(note => {
        if (note !== InstrumentNoteType.None) {
          this.cueHandler.handleBassNote(note, YargCueData);
        }
      });

      // Handle individual keys notes
      YargCueData.keysNotes.forEach(note => {
        if (note !== InstrumentNoteType.None) {
          this.cueHandler.handleKeysNote(note, YargCueData);
        }
      });

      
      // Update lastData (exclude timestamp)
      this.lastData = YargCueData;

      // Flush to disk periodically
     /*
      if (this.logBuffer.length >= this.flushThreshold) {
        this.flushLogBuffer();
      }
        */

    } catch (error) {
      console.error('YARG Listener: Error during packet deserialization:', error);
    }
  }

  /**
   * Converts a platform byte value to its corresponding string literal.
   * @param byteValue - The numeric byte value representing a platform
   * @returns A string literal of the platform
   * @private
   */
  private getPlatform(byteValue: number): "Unknown" | "Windows" | "Linux" | "Mac" {
    switch (byteValue) {
      case PlatformByte.Windows:
        return "Windows";
      case PlatformByte.Linux:
        return "Linux";
      case PlatformByte.Mac:
        return "Mac";
      default:
        return "Unknown";
    }
  }

  /**
   * Converts a scene byte value to its corresponding string literal.
   * @param byteValue - The numeric byte value representing a scene
   * @returns A string literal of the scene
   * @private
   */
  private getCurrentScene(byteValue: number): "Unknown" | "Menu" | "Gameplay" | "Score" | "Calibration" {
    switch (byteValue) {
      case SceneIndexByte.Menu:
        return "Menu";
      case SceneIndexByte.Gameplay:
        return "Gameplay";
      case SceneIndexByte.Score:
        return "Score";
      case SceneIndexByte.Calibration:
        return "Calibration";
      default:
        return "Unknown";
    }
  }

  /**
   * Converts a pause state byte value to its corresponding string literal.
   * @param byteValue - The numeric byte value representing a pause state
   * @returns A string literal of the pause state
   * @private
   */
  private getPauseState(byteValue: number): "AtMenu" | "Unpaused" | "Paused" {
    switch (byteValue) {
      case PauseStateByte.AtMenu:
        return "AtMenu";
      case PauseStateByte.Unpaused:
        return "Unpaused";
      case PauseStateByte.Paused:
        return "Paused";
      default:
        return "AtMenu"; // Default to "AtMenu" if unknown
    }
  }

  /**
   * Converts a venue size byte value to its corresponding string literal.
   * @param byteValue - The numeric byte value representing a venue size
   * @returns A string literal of the venue size
   * @private
   */
  private getVenueSize(byteValue: number): "NoVenue" | "Small" | "Large" {
    switch (byteValue) {
      case VenueSizeByte.Small:
        return "Small";
      case VenueSizeByte.Large:
        return "Large";
      case VenueSizeByte.NoVenue:
      default:
        return "NoVenue";
    }
  }

  /**
   * Converts a song section byte value to its corresponding string literal.
   * @param byteValue - The numeric byte value representing a song section
   * @returns A string literal of the song section
   * @private
   */
  private getSongSection(byteValue: number): SongSection {
    switch (byteValue) {
      case SongSectionByte.None:
        return "None";
      case SongSectionByte.Chorus:
        return "Chorus";
      case SongSectionByte.Verse:
        return "Verse";
      default:
        return "Unknown";
    }
  }

  /**
   * Converts a post-processing byte value to its corresponding string literal.
   * @param byteValue - The numeric byte value representing post-processing
   * @returns A string literal of the post-processing
   * @private
   */
  private getPostProcessing(byteValue: number): PostProcessing {
    switch (byteValue) {
      case PostProcessingByte.Default:
        return "Default";
      case PostProcessingByte.Bloom:
        return "Bloom";
      case PostProcessingByte.Bright:
        return "Bright";
      case PostProcessingByte.Saturation:
        return "Saturation";
      case PostProcessingByte.Contrast:
        return "Contrast";
      case PostProcessingByte.Sharpness:
        return "Sharpness";
      case PostProcessingByte.Vignette:
        return "Vignette";
      case PostProcessingByte.ChromaticAberration:
        return "ChromaticAberration";
      case PostProcessingByte.MotionBlur:
        return "MotionBlur";
      case PostProcessingByte.DepthOfField:
        return "DepthOfField";
      case PostProcessingByte.AmbientOcclusion:
        return "AmbientOcclusion";
      default:
        return "Unknown";
    }
  }

  /**
   * Converts a byte value to an array of InstrumentNoteType enum values.
   * @param byteValue - The numeric byte value representing instrument notes
   * @returns An array of InstrumentNoteType enum values
   * @private
   */
  private getInstrumentNotes(byteValue: number): InstrumentNoteType[] {
    if (byteValue === GuitarBassKeyboardNotesByte.None) {
      return [];
    }

    const notes: InstrumentNoteType[] = [];

    if ((byteValue & GuitarBassKeyboardNotesByte.Open) === GuitarBassKeyboardNotesByte.Open) {
      notes.push(InstrumentNoteType.Open);
    }
    if ((byteValue & GuitarBassKeyboardNotesByte.Green) === GuitarBassKeyboardNotesByte.Green) {
      notes.push(InstrumentNoteType.Green);
    }
    if ((byteValue & GuitarBassKeyboardNotesByte.Red) === GuitarBassKeyboardNotesByte.Red) {
      notes.push(InstrumentNoteType.Red);
    }
    if ((byteValue & GuitarBassKeyboardNotesByte.Yellow) === GuitarBassKeyboardNotesByte.Yellow) {
      notes.push(InstrumentNoteType.Yellow);
    }
    if ((byteValue & GuitarBassKeyboardNotesByte.Blue) === GuitarBassKeyboardNotesByte.Blue) {
      notes.push(InstrumentNoteType.Blue);
    }
    if ((byteValue & GuitarBassKeyboardNotesByte.Orange) === GuitarBassKeyboardNotesByte.Orange) {
      notes.push(InstrumentNoteType.Orange);
    }

    return notes;
  }

  /**
   * Converts a byte value to an array of DrumNoteType enum values.
   * @param byteValue - The numeric byte value representing drum notes
   * @returns An array of DrumNoteType enum values
   * @private
   */
  private getDrumNotes(byteValue: number): DrumNoteType[] {
    if (byteValue === DrumNotesByte.None) {
      return [];
    }

    const notes: DrumNoteType[] = [];

    if ((byteValue & DrumNotesByte.Kick) === DrumNotesByte.Kick) {
      notes.push(DrumNoteType.Kick);
    }
    if ((byteValue & DrumNotesByte.RedDrum) === DrumNotesByte.RedDrum) {
      notes.push(DrumNoteType.RedDrum);
    }
    if ((byteValue & DrumNotesByte.YellowDrum) === DrumNotesByte.YellowDrum) {
      notes.push(DrumNoteType.YellowDrum);
    }
    if ((byteValue & DrumNotesByte.BlueDrum) === DrumNotesByte.BlueDrum) {
      notes.push(DrumNoteType.BlueDrum);
    }
    if ((byteValue & DrumNotesByte.GreenDrum) === DrumNotesByte.GreenDrum) {
      notes.push(DrumNoteType.GreenDrum);
    }
    if ((byteValue & DrumNotesByte.YellowCymbal) === DrumNotesByte.YellowCymbal) {
      notes.push(DrumNoteType.YellowCymbal);
    }
    if ((byteValue & DrumNotesByte.BlueCymbal) === DrumNotesByte.BlueCymbal) {
      notes.push(DrumNoteType.BlueCymbal);
    }
    if ((byteValue & DrumNotesByte.GreenCymbal) === DrumNotesByte.GreenCymbal) {
      notes.push(DrumNoteType.GreenCymbal);
    }

    return notes;
  }

  /**
   * Converts a beat byte value to its corresponding description string.
   * @param byteValue - The numeric byte value representing a beat type
   * @returns A string description of the beat type
   * @private
   */
  private getBeatDescription(byteValue: number): Beat {
    switch (byteValue) {
      case BeatByte.Measure:
        return "Measure";
      case BeatByte.Strong:
        return "Strong";
      case BeatByte.Weak:
        return "Weak";
      case BeatByte.Off:
        return "Off";
      default:
        return "Unknown";
    }
  }

  /**
   * Converts a strobe state byte value to its corresponding string literal.
   * @param byteValue - The numeric byte value representing a strobe state
   * @returns A string literal of the strobe state
   * @private
   */
  private getStrobeState(byteValue: number): StrobeState {
    switch (byteValue) {
      case 20:
        return "Strobe_Fastest";
      case 21:
        return "Strobe_Fast";
      case 22:
        return "Strobe_Medium";
      case 23:
        return "Strobe_Slow";
      case 24:
        return "Strobe_Off";
      default:
        return "Unknown";
    }
  }

  /**
   * Converts a keyframe byte value to its corresponding description string.
   * @param byteValue - The numeric byte value representing a keyframe type
   * @returns A string description of the keyframe type
   * @private
   */
  private getKeyframeDescription(byteValue: number): string {
    switch (byteValue) {
      case KeyFrameByte.Off:
        return "Off";
      case KeyFrameByte.KeyframeFirst:
        return "First";
      case KeyFrameByte.KeyframeNext:
        return "Next";
      case KeyFrameByte.KeyframePrevious:
        return "Previous";
      default:
        return "Unknown";
    }
  }

  /**
   * Compares two data objects for equality.
   * Performs a shallow comparison of all enumerable properties.
   * Excludes the 'timestamp' property.
   * @param data1 First data object.
   * @param data2 Second data object.
   * @returns True if all properties (excluding 'timestamp') are equal, false otherwise.
   */
  private isDataEqual(data1: Record<string, any>, data2: Record<string, any>): boolean {
    const keys1 = Object.keys(data1);
    const keys2 = Object.keys(data2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      // For array comparisons, perform a shallow comparison
      if (Array.isArray(data1[key]) && Array.isArray(data2[key])) {
        if (data1[key].length !== data2[key].length) return false;
        for (let i = 0; i < data1[key].length; i++) {
          if (data1[key][i] !== data2[key][i]) {
            return false;
          }
        }
      } else {
        if (data1[key] !== data2[key]) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Writes accumulated logs from the buffer to the log file.
   * Merges new logs with existing logs in the file if present.
   * Clears the log buffer after successful write.
   * @private
   * @throws Will log error if file read/write operations fail
   
  private flushLogBuffer() {
    if (this.logBuffer.length === 0) return;

    let existingLogs: Record<string, any>[] = [];

    if (fs.existsSync(this.logFilePath)) {
      try {
        const fileContent = fs.readFileSync(this.logFilePath, 'utf-8');
        existingLogs = JSON.parse(fileContent);
        if (!Array.isArray(existingLogs)) {
          existingLogs = [];
        }
      } catch (err) {
        console.error('Failed to read existing log file. Starting fresh.', err);
        existingLogs = [];
      }
    }

    const combinedLogs = existingLogs.concat(this.logBuffer);

    try {
      fs.writeFileSync(this.logFilePath, JSON.stringify(combinedLogs, null, 2), 'utf-8');
      console.log(`Flushed ${this.logBuffer.length} logs to ${this.logFilePath}`);
      // Clear the buffer after flushing
      this.logBuffer = [];
    } catch (err) {
      console.error('Failed to write log file:', err);
    }
  }

  */

  public destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.stop();
  }
}
/*
YALCY's Lighting Pattern Implementation


Core Architecture
YALCY implements a structured and hierarchical approach to lighting patterns:

Base Class Structure:
StageKitLighting: The base abstract class for all lighting patterns
StageKitLightingCue: Inherits from StageKitLighting and serves as the parent class for specific lighting cues
Primitive Patterns: Three core pattern types that implement different timing mechanisms:
BeatPattern: Synchronizes with the music's beat
ListenPattern: Responds to events (beats, keyframes, drum hits)
TimedPattern: Uses fixed time intervals


UDP Protocol Integration:
YALCY receives lighting commands via UDP packets from YARG (the rhythm game)
The UdpIntake class processes these packets and extracts lighting cue information
Lighting cues are identified by byte values defined in UdpIntake.CueByte enum


Hardware Control:
The StageKitTalker class manages hardware communication
LEDs are controlled through defined command IDs (e.g., RedLeds, BlueLeds)
Fog and strobe effects have specific commands and states
Lighting Primitives
The three primitive pattern classes provide the foundation for all lighting effects:


BeatPattern:
Synchronized to the beat of the music
Uses _cyclesPerBeat to determine timing
Runs asynchronously and can be continuous or one-shot
Follows a defined pattern list of color commands


ListenPattern:

Event-driven, responding to specific triggers
Can listen for major beats, minor beats, drum hits, or "next" events
Supports flash effects and inverse patterns
Processes events by cycling through the pattern list


TimedPattern:
Uses absolute timing rather than beat-relative timing
Runs a coroutine that cycles through the pattern list at fixed intervals
Suitable for patterns that shouldn't vary with song tempo


Lighting Cues Implementation
YALCY implements a wide range of lighting cues, each with its own pattern and behavior:

Basic Cues:

NoCue: Disables all lighting
Default: Simple default lighting pattern
Intro: Introductory lighting pattern
Beat-Synchronized Patterns:
BigRockEnding: Randomly flashes lights in all colors
LoopWarm/LoopCool: Cyclic patterns with warm or cool colors
Harmony: Different patterns for large vs. small venues
Sweep: Sweeping light patterns
Complex Interactive Patterns:
Dischord: Dynamic pattern with green spinning and blue blinking
Silhouette/SilhouetteSpot: Silhouette lighting with vocal event handling
Stomp: Responds to keyframe events for impactful lighting changes
Effect-Specific Patterns:
Blackout: Different blackout patterns
FlareFast/FlareSlow: Quick or slow flare effects
Frenzy: Intense, rapidly changing patterns


Implementation Details
LED Control:
Each LED color (Red, Green, Blue, Yellow) has a corresponding command ID
LED patterns use bit flags to control individual LEDs (Zero through Seven)
Special constants like None and All provide convenient control

Pattern Definition:
Patterns are defined as arrays of tuples: (CommandId, byte)
The byte value controls which specific LEDs are lit within a color group
Bit manipulation allows for complex spatial patterns

Venue-Specific Patterns:
Many cues have different implementations for small vs. large venues
The venue size is received via UDP and affects pattern selection

Event System:
YALCY uses an event-based system for beat synchronization
Events include beat notifications, keyframes, and drum hits
Patterns can subscribe to these events for precise timing

Example Pattern Implementation
Here's an example of how the BigRockEnding cue is implemented:
}
This creates a dramatic flashing pattern where each color flashes on for one beat and then is off for three beats, creating a dramatic "big rock ending" effect.


LED Pattern Structure

YALCY uses a bit-based approach for controlling individual LEDs:
Bytes Zero through Seven represent individual LED bits (0b00000001 through 0b10000000)
These can be combined with bitwise OR to create patterns (e.g., Zero | Four lights the first and fifth LEDs)
The All constant (0b11111111) turns on all LEDs in a color group
The None constant (0b00000000) turns off all LEDs in a color group
This bit manipulation allows for precise control of spatial LED patterns.


Communication with the Hardware
The actual hardware communication happens through the UsbDeviceMonitor.SendReport() method, which takes:
A command ID (e.g., RedLeds, FogOn)
A data byte (which LEDs to control or other parameters)
*/