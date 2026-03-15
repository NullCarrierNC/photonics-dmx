import dgram from 'dgram'
import { EventEmitter } from 'events'

import {
  CueData,
  SongSection,
  PostProcessing,
  Beat,
  StrobeState,
  CueType,
  lightingCueMap,
  InstrumentNoteType,
  DrumNoteType,
} from '../../cues/types/cueTypes'

import { BaseCueHandler } from '../../cueHandlers/BaseCueHandler'

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
  Practice = 5,
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
  Contrast = 3,
  Posterize = 4,
  PhotoNegative = 5,
  Mirror = 6,
  BlackAndWhite = 7,
  SepiaTone = 8,
  SilverTone = 9,
  Choppy_BlackAndWhite = 10,
  PhotoNegative_RedAndBlack = 11,
  Polarized_BlackAndWhite = 12,
  Polarized_RedAndBlue = 13,
  Desaturated_Blue = 14,
  Desaturated_Red = 15,
  Contrast_Red = 16,
  Contrast_Green = 17,
  Contrast_Blue = 18,
  Grainy_Film = 19,
  Grainy_ChromaticAbberation = 20,
  Scanlines = 21,
  Scanlines_BlackAndWhite = 22,
  Scanlines_Blue = 23,
  Scanlines_Security = 24,
  Trails = 25,
  Trails_Long = 26,
  Trails_Desaturated = 27,
  Trails_Flickery = 28,
  Trails_Spacey = 29,
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

const PORT = 36107
const PACKET_HEADER = 0x59415247 // 'YARG' in hex
const YARG_DATAGRAM_VERSION = 1
/** Max rate for forwarding identical-state packets (30 updates per second). */
const IDENTICAL_FRAME_THROTTLE_MS = 1000 / 30

export class YargNetworkListener extends EventEmitter {
  private server: dgram.Socket | null = null
  private cueHandler: BaseCueHandler

  //private logFilePath = path.join(app.getPath('documents'), 'yargLog.json');
  private listening = false

  // Batch logging
  //  private logBuffer: Record<string, any>[] = [];
  //  private flushThreshold = 50; // Flush after every 50 messages
  // private flushIntervalMs = 5000; // Also flush every 5 seconds
  private flushTimer: NodeJS.Timeout | null = null

  // To store the last processed data for change detection (excluding timestamp)
  private lastData: CueData | null = null

  /** Timestamp (ms) when we last forwarded an identical frame; used to throttle unchanged packets to 30 Hz. */
  private lastForwardedIdenticalAt = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- log payload shape varies
  private lastLogData: Record<string, any> | null = null

  // Track the last scene to detect transitions
  private lastScene: 'Unknown' | 'Menu' | 'Gameplay' | 'Score' | 'Calibration' | 'Practice' | null =
    null

  constructor(cueHandler: BaseCueHandler) {
    super() // Initialize EventEmitter
    this.cueHandler = cueHandler

    console.log('YargNetworkListener initialized.')

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
      console.warn('YargNetworkListener is already running.')
      return
    }

    if (!this.server) {
      this.server = dgram.createSocket('udp4')
      this.setupServerEvents()
    }

    this.server.bind(PORT, () => {
      this.listening = true
      console.log(`YargNetworkListener started and listening on port ${PORT}`)
    })
  }

  public stop() {
    if (!this.listening) {
      console.warn('YargNetworkListener is not running.')
      return
    }

    if (this.server) {
      this.server.close(() => {
        console.log('YargNetworkListener server closed.')
        this.listening = false
        this.server = null
      })
    }
  }

  public shutdown() {
    this.stop()
  }

  private setupServerEvents() {
    if (!this.server) return

    this.server.on('error', (err) => {
      console.error(`Server error:\n${err.stack}`)
      this.server?.close()
      this.listening = false
    })

    this.server.on('listening', () => {
      const address = this.server?.address()
      if (address) {
        console.log(`Listening for YARG events on ${address.address}:${address.port}`)
      }
    })

    this.server.on('message', (msg) => {
      try {
        // console.log(`Received message of ${msg.length} bytes: ${msg.toString('hex')}`);
        this.deserializePacket(msg)
      } catch (error) {
        console.error('Failed to parse message:', error)
      }
    })
  }

  private deserializePacket(buffer: Buffer) {
    try {
      let offset = 0

      // Ensure buffer has at least the minimum required length (longer packets are allowed for forward compatibility)
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
        1 + // Beat
        1 + // Keyframe
        1 + // Bonus Effect
        1 + // AutoGen Track
        1 + // Spotlight
        1 // Singalong

      if (buffer.length < expectedLength) {
        throw new Error(
          `Received packet is too short: ${buffer.length} bytes, expected at least ${expectedLength} bytes`,
        )
      }

      // Header (little-endian)
      const header = buffer.readUInt32LE(offset)
      offset += 4
      if (header !== PACKET_HEADER) {
        console.warn(`Invalid packet header: 0x${header.toString(16)}`)
        return
      }

      const datagramVersion = buffer.readUInt8(offset)
      offset += 1
      const platformByte = buffer.readUInt8(offset)
      offset += 1
      const sceneByte = buffer.readUInt8(offset)
      offset += 1
      const pauseStateByte = buffer.readUInt8(offset)
      offset += 1
      const venueSizeByte = buffer.readUInt8(offset)
      offset += 1
      const beatsPerMinute = buffer.readFloatLE(offset)
      offset += 4
      const songSectionByte = buffer.readUInt8(offset)
      offset += 1
      const guitarNotesByte = buffer.readUInt8(offset)
      offset += 1
      const bassNotesByte = buffer.readUInt8(offset)
      offset += 1
      const drumNotesByte = buffer.readUInt8(offset)
      offset += 1
      const keysNotesByte = buffer.readUInt8(offset)
      offset += 1
      const vocalNote = buffer.readFloatLE(offset)
      offset += 4
      const harmony0Note = buffer.readFloatLE(offset)
      offset += 4
      const harmony1Note = buffer.readFloatLE(offset)
      offset += 4
      const harmony2Note = buffer.readFloatLE(offset)
      offset += 4
      const lightingCueValue = buffer.readUInt8(offset)
      offset += 1
      const postProcessingByte = buffer.readUInt8(offset)
      offset += 1
      const fogState = buffer.readUInt8(offset) === 1
      offset += 1
      const strobeStateValue = buffer.readUInt8(offset)
      offset += 1
      const beatValue = buffer.readUInt8(offset)
      offset += 1
      const keyframeValue = buffer.readUInt8(offset)
      offset += 1
      const bonusEffect = buffer.readUInt8(offset) === 1
      offset += 1
      const autoGenTrack = buffer.readUInt8(offset) === 1
      offset += 1

      if (datagramVersion < YARG_DATAGRAM_VERSION) {
        console.error(
          `Unsupported datagram version: ${datagramVersion}, need at least version ${YARG_DATAGRAM_VERSION}`,
        )
        const errorMessage = `YARG Datagram Version too old: received version ${datagramVersion}, need at least version ${YARG_DATAGRAM_VERSION}`

        // Emit error event for the controller to handle
        this.emit('yarg-error', {
          type: 'datagram-version-mismatch',
          message: errorMessage,
          datagramVersion: datagramVersion,
        })

        throw new Error(errorMessage)
      }

      const spotlight = buffer.readUInt8(offset)
      offset += 1
      const singalong = buffer.readUInt8(offset)
      offset += 1

      let cameraCutConstraint: number | undefined
      let cameraCutPriority: number | undefined
      let cameraCutSubject: number | undefined
      if (buffer.length >= 47) {
        cameraCutConstraint = buffer.readUInt8(offset)
        offset += 1
        cameraCutPriority = buffer.readUInt8(offset)
        offset += 1
        cameraCutSubject = buffer.readUInt8(offset)
      }

      const lightingCue = lightingCueMap[lightingCueValue] || `Unknown (${lightingCueValue})`

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
        performer: 0,
        spotlight,
        singalong,
        ...(cameraCutConstraint !== undefined && {
          cameraCutConstraint,
          cameraCutPriority: cameraCutPriority!,
          cameraCutSubject: cameraCutSubject!,
        }),
        trackMode: autoGenTrack ? 'autogen' : 'tracked',
        beat: this.getBeatDescription(beatValue),
        keyframe: this.getKeyframeDescription(keyframeValue),
        bonusEffect,
      }
      //console.log("Keyframe:", YargCueData.keyframe);
      this.processCueData(YargCueData)
    } catch (error) {
      console.error('YARG Listener: Error during packet deserialization:', error)
    }
  }

  /**
   * Process one frame of cue data: beat/keyframe, lighting cue, strobe (including passive strobe-off),
   * and instrument notes. Used by deserializePacket and by tests for passive strobe behaviour.
   * Identical frames are forwarded at most 30 times per second; changed frames are forwarded immediately.
   */
  public processCueData(YargCueData: CueData): void {
    const isIdentical = this.lastData !== null && this.isDataEqual(this.lastData, YargCueData)
    if (isIdentical && Date.now() - this.lastForwardedIdenticalAt < IDENTICAL_FRAME_THROTTLE_MS) {
      return
    }

    this.handleSceneTransition(YargCueData.currentScene)

    const logData = {
      currentScene: YargCueData.currentScene,
      songSection: YargCueData.songSection,
      beatsPerMinute: YargCueData.beatsPerMinute,
      lightingCue: YargCueData.lightingCue,
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
    }
    if (this.lastLogData && !this.isDataEqual(this.lastLogData, logData)) {
      this.lastLogData = logData
    }
    this.lastLogData = logData

    switch (YargCueData.beat) {
      case 'Strong':
        this.cueHandler.handleBeat()
        break
      case 'Measure':
        this.cueHandler.handleMeasure()
        break
    }

    switch (YargCueData.keyframe) {
      case 'First':
        this.cueHandler.handleKeyframeFirst()
        break
      case 'Next':
        this.cueHandler.handleKeyframeNext()
        break
      case 'Previous':
        this.cueHandler.handleKeyframePrevious()
        break
    }

    const cueType = YargCueData.lightingCue
    if (cueType) {
      this.cueHandler.handleCue(cueType as CueType, YargCueData)
    } else {
      console.warn(`Unknown lighting cue value received: ${YargCueData.lightingCue}`)
    }

    const activeStrobeStates: StrobeState[] = [
      'Strobe_Slow',
      'Strobe_Medium',
      'Strobe_Fast',
      'Strobe_Fastest',
    ]
    const previousHadActiveStrobe =
      this.lastData?.strobeState != null &&
      this.lastData.strobeState !== 'Strobe_Off' &&
      (activeStrobeStates as string[]).includes(this.lastData.strobeState)
    const currentHasActiveStrobe =
      YargCueData.strobeState != null &&
      YargCueData.strobeState !== 'Strobe_Off' &&
      (activeStrobeStates as string[]).includes(YargCueData.strobeState)

    if (currentHasActiveStrobe) {
      let strobeCueType: CueType
      switch (YargCueData.strobeState) {
        case 'Strobe_Slow':
          strobeCueType = CueType.Strobe_Slow
          break
        case 'Strobe_Medium':
          strobeCueType = CueType.Strobe_Medium
          break
        case 'Strobe_Fast':
          strobeCueType = CueType.Strobe_Fast
          break
        case 'Strobe_Fastest':
          strobeCueType = CueType.Strobe_Fastest
          break
        default:
          strobeCueType = CueType.Strobe_Slow
      }
      this.cueHandler.handleCue(strobeCueType, YargCueData)
    } else if (previousHadActiveStrobe) {
      this.cueHandler.handleCue(CueType.Strobe_Off, YargCueData)
    }

    YargCueData.drumNotes.forEach((note) => {
      if (note !== DrumNoteType.None) {
        this.cueHandler.handleDrumNote(note, YargCueData)
      }
    })
    YargCueData.guitarNotes.forEach((note) => {
      if (note !== InstrumentNoteType.None) {
        this.cueHandler.handleGuitarNote(note, YargCueData)
      }
    })
    YargCueData.bassNotes.forEach((note) => {
      if (note !== InstrumentNoteType.None) {
        this.cueHandler.handleBassNote(note, YargCueData)
      }
    })
    YargCueData.keysNotes.forEach((note) => {
      if (note !== InstrumentNoteType.None) {
        this.cueHandler.handleKeysNote(note, YargCueData)
      }
    })

    this.lastData = YargCueData
    if (isIdentical) {
      this.lastForwardedIdenticalAt = Date.now()
    }
  }

  /**
   * Converts a platform byte value to its corresponding string literal.
   * @param byteValue - The numeric byte value representing a platform
   * @returns A string literal of the platform
   * @private
   */
  private getPlatform(byteValue: number): 'Unknown' | 'Windows' | 'Linux' | 'Mac' {
    switch (byteValue) {
      case PlatformByte.Windows:
        return 'Windows'
      case PlatformByte.Linux:
        return 'Linux'
      case PlatformByte.Mac:
        return 'Mac'
      default:
        return 'Unknown'
    }
  }

  /**
   * Converts a scene byte value to its corresponding string literal.
   * @param byteValue - The numeric byte value representing a scene
   * @returns A string literal of the scene
   * @private
   */
  private getCurrentScene(
    byteValue: number,
  ): 'Unknown' | 'Menu' | 'Gameplay' | 'Score' | 'Calibration' | 'Practice' {
    switch (byteValue) {
      case SceneIndexByte.Menu:
        return 'Menu'
      case SceneIndexByte.Gameplay:
        return 'Gameplay'
      case SceneIndexByte.Score:
        return 'Score'
      case SceneIndexByte.Calibration:
        return 'Calibration'
      case SceneIndexByte.Practice:
        return 'Practice'
      default:
        return 'Unknown'
    }
  }

  /**
   * Converts a pause state byte value to its corresponding string literal.
   * @param byteValue - The numeric byte value representing a pause state
   * @returns A string literal of the pause state
   * @private
   */
  private getPauseState(byteValue: number): 'AtMenu' | 'Unpaused' | 'Paused' {
    switch (byteValue) {
      case PauseStateByte.AtMenu:
        return 'AtMenu'
      case PauseStateByte.Unpaused:
        return 'Unpaused'
      case PauseStateByte.Paused:
        return 'Paused'
      default:
        return 'AtMenu' // Default to "AtMenu" if unknown
    }
  }

  /**
   * Converts a venue size byte value to its corresponding string literal.
   * @param byteValue - The numeric byte value representing a venue size
   * @returns A string literal of the venue size
   * @private
   */
  private getVenueSize(byteValue: number): 'NoVenue' | 'Small' | 'Large' {
    switch (byteValue) {
      case VenueSizeByte.Small:
        return 'Small'
      case VenueSizeByte.Large:
        return 'Large'
      case VenueSizeByte.NoVenue:
      default:
        return 'NoVenue'
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
        return 'None'
      case SongSectionByte.Chorus:
        return 'Chorus'
      case SongSectionByte.Verse:
        return 'Verse'
      default:
        return 'Unknown'
    }
  }

  /**
   * Converts a post-processing byte value to its corresponding string literal.
   * @param byteValue - The numeric byte value representing post-processing
   * @returns A string literal of the post-processing
   * @private
   */
  private getPostProcessing(byteValue: number): PostProcessing {
    const map: Record<number, PostProcessing> = {
      [PostProcessingByte.Default]: 'Default',
      [PostProcessingByte.Bloom]: 'Bloom',
      [PostProcessingByte.Bright]: 'Bright',
      [PostProcessingByte.Contrast]: 'Contrast',
      [PostProcessingByte.Posterize]: 'Posterize',
      [PostProcessingByte.PhotoNegative]: 'PhotoNegative',
      [PostProcessingByte.Mirror]: 'Mirror',
      [PostProcessingByte.BlackAndWhite]: 'BlackAndWhite',
      [PostProcessingByte.SepiaTone]: 'SepiaTone',
      [PostProcessingByte.SilverTone]: 'SilverTone',
      [PostProcessingByte.Choppy_BlackAndWhite]: 'Choppy_BlackAndWhite',
      [PostProcessingByte.PhotoNegative_RedAndBlack]: 'PhotoNegative_RedAndBlack',
      [PostProcessingByte.Polarized_BlackAndWhite]: 'Polarized_BlackAndWhite',
      [PostProcessingByte.Polarized_RedAndBlue]: 'Polarized_RedAndBlue',
      [PostProcessingByte.Desaturated_Blue]: 'Desaturated_Blue',
      [PostProcessingByte.Desaturated_Red]: 'Desaturated_Red',
      [PostProcessingByte.Contrast_Red]: 'Contrast_Red',
      [PostProcessingByte.Contrast_Green]: 'Contrast_Green',
      [PostProcessingByte.Contrast_Blue]: 'Contrast_Blue',
      [PostProcessingByte.Grainy_Film]: 'Grainy_Film',
      [PostProcessingByte.Grainy_ChromaticAbberation]: 'Grainy_ChromaticAbberation',
      [PostProcessingByte.Scanlines]: 'Scanlines',
      [PostProcessingByte.Scanlines_BlackAndWhite]: 'Scanlines_BlackAndWhite',
      [PostProcessingByte.Scanlines_Blue]: 'Scanlines_Blue',
      [PostProcessingByte.Scanlines_Security]: 'Scanlines_Security',
      [PostProcessingByte.Trails]: 'Trails',
      [PostProcessingByte.Trails_Long]: 'Trails_Long',
      [PostProcessingByte.Trails_Desaturated]: 'Trails_Desaturated',
      [PostProcessingByte.Trails_Flickery]: 'Trails_Flickery',
      [PostProcessingByte.Trails_Spacey]: 'Trails_Spacey',
    }
    return map[byteValue] ?? 'Unknown'
  }

  /**
   * Converts a byte value to an array of InstrumentNoteType enum values.
   * @param byteValue - The numeric byte value representing instrument notes
   * @returns An array of InstrumentNoteType enum values
   * @private
   */
  private getInstrumentNotes(byteValue: number): InstrumentNoteType[] {
    if (byteValue === GuitarBassKeyboardNotesByte.None) {
      return []
    }

    const notes: InstrumentNoteType[] = []

    if ((byteValue & GuitarBassKeyboardNotesByte.Open) === GuitarBassKeyboardNotesByte.Open) {
      notes.push(InstrumentNoteType.Open)
    }
    if ((byteValue & GuitarBassKeyboardNotesByte.Green) === GuitarBassKeyboardNotesByte.Green) {
      notes.push(InstrumentNoteType.Green)
    }
    if ((byteValue & GuitarBassKeyboardNotesByte.Red) === GuitarBassKeyboardNotesByte.Red) {
      notes.push(InstrumentNoteType.Red)
    }
    if ((byteValue & GuitarBassKeyboardNotesByte.Yellow) === GuitarBassKeyboardNotesByte.Yellow) {
      notes.push(InstrumentNoteType.Yellow)
    }
    if ((byteValue & GuitarBassKeyboardNotesByte.Blue) === GuitarBassKeyboardNotesByte.Blue) {
      notes.push(InstrumentNoteType.Blue)
    }
    if ((byteValue & GuitarBassKeyboardNotesByte.Orange) === GuitarBassKeyboardNotesByte.Orange) {
      notes.push(InstrumentNoteType.Orange)
    }

    return notes
  }

  /**
   * Converts a byte value to an array of DrumNoteType enum values.
   * @param byteValue - The numeric byte value representing drum notes
   * @returns An array of DrumNoteType enum values
   * @private
   */
  private getDrumNotes(byteValue: number): DrumNoteType[] {
    if (byteValue === DrumNotesByte.None) {
      return []
    }

    const notes: DrumNoteType[] = []

    if ((byteValue & DrumNotesByte.Kick) === DrumNotesByte.Kick) {
      notes.push(DrumNoteType.Kick)
    }
    if ((byteValue & DrumNotesByte.RedDrum) === DrumNotesByte.RedDrum) {
      notes.push(DrumNoteType.RedDrum)
    }
    if ((byteValue & DrumNotesByte.YellowDrum) === DrumNotesByte.YellowDrum) {
      notes.push(DrumNoteType.YellowDrum)
    }
    if ((byteValue & DrumNotesByte.BlueDrum) === DrumNotesByte.BlueDrum) {
      notes.push(DrumNoteType.BlueDrum)
    }
    if ((byteValue & DrumNotesByte.GreenDrum) === DrumNotesByte.GreenDrum) {
      notes.push(DrumNoteType.GreenDrum)
    }
    if ((byteValue & DrumNotesByte.YellowCymbal) === DrumNotesByte.YellowCymbal) {
      notes.push(DrumNoteType.YellowCymbal)
    }
    if ((byteValue & DrumNotesByte.BlueCymbal) === DrumNotesByte.BlueCymbal) {
      notes.push(DrumNoteType.BlueCymbal)
    }
    if ((byteValue & DrumNotesByte.GreenCymbal) === DrumNotesByte.GreenCymbal) {
      notes.push(DrumNoteType.GreenCymbal)
    }

    return notes
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
        return 'Measure'
      case BeatByte.Strong:
        return 'Strong'
      case BeatByte.Weak:
        return 'Weak'
      case BeatByte.Off:
        return 'Off'
      default:
        return 'Unknown'
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
        return 'Strobe_Fastest'
      case 21:
        return 'Strobe_Fast'
      case 22:
        return 'Strobe_Medium'
      case 23:
        return 'Strobe_Slow'
      case 24:
        return 'Strobe_Off'
      default:
        return 'Unknown'
    }
  }

  /**
   * Converts a keyframe byte value to its corresponding description string.
   * @param byteValue - The numeric byte value representing a keyframe type
   * @returns A string description of the keyframe type
   * @private
   */
  private getKeyframeDescription(
    byteValue: number,
  ): 'Off' | 'First' | 'Next' | 'Previous' | 'Unknown' {
    switch (byteValue) {
      case KeyFrameByte.Off:
        return 'Off'
      case KeyFrameByte.KeyframeFirst:
        return 'First'
      case KeyFrameByte.KeyframeNext:
        return 'Next'
      case KeyFrameByte.KeyframePrevious:
        return 'Previous'
      default:
        return 'Unknown'
    }
  }

  /**
   * Compares two data objects for equality.
   * Performs a shallow comparison of all enumerable properties.
   * @param data1 First data object.
   * @param data2 Second data object.
   * @returns True if all properties are equal, false otherwise.
   */
  private isDataEqual<T extends Record<string, unknown>>(data1: T, data2: T): boolean {
    const keys1 = Object.keys(data1) as (keyof T)[]
    const keys2 = Object.keys(data2) as (keyof T)[]

    if (keys1.length !== keys2.length) return false

    for (const key of keys1) {
      const value1 = data1[key]
      const value2 = data2[key]
      if (Array.isArray(value1) && Array.isArray(value2)) {
        if (value1.length !== value2.length) return false
        for (let i = 0; i < value1.length; i++) {
          if (value1[i] !== value2[i]) return false
        }
      } else {
        if (value1 !== value2) return false
      }
    }
    return true
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

  /**
   * Handle scene transitions, particularly Menu -> Gameplay to clear menu lighting
   * @param currentScene The current scene from the YARG packet
   */
  private handleSceneTransition(
    currentScene: 'Unknown' | 'Menu' | 'Gameplay' | 'Score' | 'Calibration' | 'Practice',
  ): void {
    // Check if we have a scene change
    if (this.lastScene !== null && this.lastScene !== currentScene) {
      console.log(`YARG: Scene transition detected: ${this.lastScene} -> ${currentScene}`)

      // Handle Menu -> Gameplay transition (song start)
      if (this.lastScene === 'Menu' && currentScene === 'Gameplay') {
        console.log('YARG: Song starting - triggering blackout to clear menu lighting')
        // Trigger a fast blackout to clear any menu lighting
        this.cueHandler.handleCue(CueType.Blackout_Fast, {
          datagramVersion: 0,
          platform: 'Unknown',
          currentScene: currentScene,
          pauseState: 'Unpaused',
          venueSize: 'NoVenue',
          beatsPerMinute: 0,
          songSection: 'None',
          guitarNotes: [],
          bassNotes: [],
          drumNotes: [],
          keysNotes: [],
          vocalNote: 0,
          harmony0Note: 0,
          harmony1Note: 0,
          harmony2Note: 0,
          lightingCue: 'Blackout_Fast',
          postProcessing: 'Default',
          fogState: false,
          strobeState: 'Strobe_Off',
          performer: 0,
          trackMode: 'tracked',
          beat: 'Off',
          keyframe: 'Off',
          bonusEffect: false,
        })
      }
    }

    // Update the last scene
    this.lastScene = currentScene
  }

  public destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    this.stop()
  }
}
