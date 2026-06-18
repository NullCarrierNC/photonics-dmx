import dgram from 'dgram'
import { EventEmitter } from 'events'

import {
  CueData,
  SongSection,
  PostProcessing,
  Beat,
  StrobeState,
  CueType,
  isCueType,
  isNonDrivingCueType,
  lightingCueMap,
  InstrumentNoteType,
  DrumNoteType,
} from '../../cues/types/cueTypes'
import { createLogger } from '../../../shared/logger'
import { monotonicNowMs } from '../../../shared/time'
import {
  PlatformByte,
  VenueSizeByte,
  SceneIndexByte,
  PauseStateByte,
  SongSectionByte,
  GuitarBassKeyboardNotesByte,
  DrumNotesByte,
  PostProcessingByte,
  KeyFrameByte,
  BeatByte,
} from './yargTypes'

const log = createLogger('YargNetworkListener')

export interface YargCueRuntime {
  notifySongStart(): void
  notifySongEnd(): void
  handleBeat(): void
  handleMeasure(): void
  handleKeyframeFirst(): void
  handleKeyframeNext(): void
  handleKeyframePrevious(): void
  handleCue(cueType: CueType, parameters: CueData): Promise<void>
  handleDrumNote(noteType: DrumNoteType, data: CueData): void
  handleGuitarNote(noteType: InstrumentNoteType, data: CueData): void
  handleBassNote(noteType: InstrumentNoteType, data: CueData): void
  handleKeysNote(noteType: InstrumentNoteType, data: CueData): void
  handleVocalNote(data: CueData): void
}

const PORT = 36107
const PACKET_HEADER = 0x59415247 // 'YARG' in hex
const YARG_DATAGRAM_VERSION = 1
/** Max rate for forwarding identical-state packets (30 updates per second). */
const IDENTICAL_FRAME_THROTTLE_MS = 1000 / 30

/** How often the fallback-cue condition is polled (ms). */
const FALLBACK_POLL_MS = 500

/** Maps post-processing byte values to their string literal names. */
const POST_PROCESSING_MAP: Record<number, PostProcessing> = {
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

export class YargNetworkListener extends EventEmitter {
  private server: dgram.Socket | null = null
  private cueHandler: YargCueRuntime

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

  // Track the last scene to detect transitions
  private lastScene: 'Unknown' | 'Menu' | 'Gameplay' | 'Score' | 'Calibration' | 'Practice' | null =
    null

  /** Bound while UDP bind() is pending; used to distinguish bind failures from runtime socket errors. */
  private startBindReject: ((reason: unknown) => void) | null = null

  // --- Fallback cue tracking ---
  /** Reads the configured Fallback Time (ms). 0 disables the feature. */
  private readonly getFallbackCueTimeMs: () => number
  /** Monotonic time the fallback window last restarted: every real cue, and the first blackout / no-cue of a run, reset it; a continuing run of blackouts does not, so a song that only streams blackouts falls through to the Fallback. */
  private lastCueReceivedAt = 0
  /** True when the previous lighting cue was non-driving (blackout / no-cue). The first such cue after a real cue still resets the window; only a continuing run of them is treated as non-driving. */
  private inNonDrivingRun = false
  /** True while the auto Fallback cue is the current look; any received cue clears it. */
  private fallbackActive = false
  /** Monotonic time the Fallback cue last fired; gates the re-fire window. */
  private lastFallbackFireAt = 0
  /** Polls for the fallback condition independently of incoming packets (covers YARG going silent). */
  private fallbackTimer: NodeJS.Timeout | null = null

  constructor(cueHandler: YargCueRuntime, options?: { getFallbackCueTimeMs?: () => number }) {
    super() // Initialize EventEmitter
    this.cueHandler = cueHandler
    this.getFallbackCueTimeMs = options?.getFallbackCueTimeMs ?? (() => 20000)

    log.info('YargNetworkListener initialized.')

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

  public start(): Promise<void> {
    if (this.listening) {
      log.warn('YargNetworkListener is already running.')
      return Promise.resolve()
    }

    if (this.startBindReject !== null) {
      log.warn('YargNetworkListener start already in progress.')
      return Promise.reject(new Error('YargNetworkListener start already in progress'))
    }

    if (!this.server) {
      this.server = dgram.createSocket('udp4')
      this.setupServerEvents()
    }

    return new Promise<void>((resolve, reject) => {
      this.startBindReject = reject
      this.server!.bind(PORT, () => {
        this.startBindReject = null
        this.listening = true
        this.startFallbackPolling()
        log.info(`YargNetworkListener started and listening on port ${PORT}`)
        resolve()
      })
    })
  }

  /**
   * Closes the UDP socket and resolves when the OS has released the port
   * (required before a new listener can bind the same port).
   */
  public stop(): Promise<void> {
    const sock = this.server
    this.server = null
    this.listening = false
    this.stopFallbackPolling()
    if (!sock) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      try {
        sock.close(() => {
          log.info('YargNetworkListener server closed.')
          resolve()
        })
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code
        if (code !== 'ERR_SOCKET_DGRAM_NOT_RUNNING') {
          log.warn('YargNetworkListener: error during close:', err)
        }
        resolve()
      }
    })
  }

  public shutdown(): Promise<void> {
    return this.stop()
  }

  /** Begin polling for the fallback condition. Idempotent. */
  private startFallbackPolling(): void {
    if (this.fallbackTimer) {
      return
    }
    this.fallbackTimer = setInterval(() => this.checkFallback(), FALLBACK_POLL_MS)
  }

  /** Stop polling and reset the fallback state. */
  private stopFallbackPolling(): void {
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer)
      this.fallbackTimer = null
    }
    this.fallbackActive = false
    this.inNonDrivingRun = false
  }

  /**
   * Fire the auto Fallback cue when a song is playing and no *driving* YARG lighting cue has been
   * received within the configured window — i.e. YARG has gone silent, or is only streaming a
   * continuing run of blackout / no-cue cues (the first blackout of a run still counts as driving;
   * see isNonDrivingCueType). Re-fires every window so the registry can re-select a (possibly
   * different) implementation. Runs independently of incoming packets so it still triggers when
   * YARG stops sending entirely. Only fires during Gameplay and never while paused; a Fallback Time
   * of 0 disables it.
   */
  private checkFallback(): void {
    const fallbackMs = this.getFallbackCueTimeMs()
    if (fallbackMs <= 0) {
      return
    }
    if (this.lastScene !== 'Gameplay') {
      return
    }
    const data = this.lastData
    if (!data || data.pauseState === 'Paused') {
      return
    }
    const now = monotonicNowMs()
    const reference = this.fallbackActive ? this.lastFallbackFireAt : this.lastCueReceivedAt
    if (now - reference < fallbackMs) {
      return
    }
    this.fallbackActive = true
    this.lastFallbackFireAt = now
    log.info('YARG: Fallback cue triggered (no new lighting cue within fallback window)')
    void this.cueHandler.handleCue(CueType.Fallback, {
      ...data,
      lightingCue: CueType.Fallback,
      trackMode: 'tracked',
    })
  }

  private setupServerEvents() {
    if (!this.server) return

    this.server.on('error', (err) => {
      const bindReject = this.startBindReject
      if (bindReject !== null) {
        this.startBindReject = null
        log.error(`Server error during bind:\n${err.stack}`)
        void this.stop().finally(() => {
          bindReject(err)
        })
        return
      }

      log.error(`Server error:\n${err.stack}`)
      const message = err instanceof Error ? err.message : String(err)
      this.emit('yarg-error', {
        type: 'runtime-error',
        message,
      })
      void this.stop()
    })

    this.server.on('listening', () => {
      const address = this.server?.address()
      if (address) {
        log.info(`Listening for YARG events on ${address.address}:${address.port}`)
      }
    })

    this.server.on('message', (msg) => {
      try {
        // console.log(`Received message of ${msg.length} bytes: ${msg.toString('hex')}`);
        this.deserializePacket(msg)
      } catch (error) {
        log.error('Failed to parse message:', error)
      }
    })
  }

  /** Minimum supported datagram version for full cue payloads (excluding shutdown sentinel 0). */
  protected getMinSupportedDatagramVersion(): number {
    return YARG_DATAGRAM_VERSION
  }

  private deserializePacket(buffer: Buffer) {
    try {
      const MIN_HEADER_AND_VERSION_LEN = 4 + 1

      if (buffer.length < MIN_HEADER_AND_VERSION_LEN) {
        throw new Error(
          `Received packet is too short: ${buffer.length} bytes, expected at least ${MIN_HEADER_AND_VERSION_LEN} bytes`,
        )
      }

      let offset = 0

      // Ensure buffer has at least the minimum required length for a full cue packet (longer packets are allowed for forward compatibility)
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

      // Header (little-endian)
      const header = buffer.readUInt32LE(offset)
      offset += 4
      if (header !== PACKET_HEADER) {
        log.warn(`Invalid packet header: 0x${header.toString(16)}`)
        return
      }

      const datagramVersion = buffer.readUInt8(offset)
      offset += 1

      if (datagramVersion === 0) {
        log.info('YARG shutdown notification (datagram version 0)')
        this.emit('yarg-error', {
          type: 'yarg-shutdown',
          message: 'YARG Has Shutdown',
          datagramVersion: 0,
        })
        return
      }

      if (buffer.length < expectedLength) {
        throw new Error(
          `Received packet is too short: ${buffer.length} bytes, expected at least ${expectedLength} bytes`,
        )
      }

      const minVersion = this.getMinSupportedDatagramVersion()
      if (datagramVersion < minVersion) {
        log.error(
          `Unsupported datagram version: ${datagramVersion}, need at least version ${minVersion}`,
        )
        const errorMessage = `YARG Datagram Version too old: received version ${datagramVersion}, need at least version ${minVersion}`

        // Emit error event for the controller to handle
        this.emit('yarg-error', {
          type: 'datagram-version-mismatch',
          message: errorMessage,
          datagramVersion: datagramVersion,
        })

        throw new Error(errorMessage)
      }

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
        // Union of performers currently spotlighted or singing along (PerformerByte bitmask).
        // TODO: verify the intended performer against live YARG data.
        performer: spotlight | singalong,
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
      log.error('YARG Listener: Error during packet deserialization:', error)
    }
  }

  /**
   * Process one frame of cue data: beat/keyframe, lighting cue, strobe (including passive strobe-off),
   * and instrument notes. Used by deserializePacket and by tests for passive strobe behaviour.
   * Identical frames are forwarded at most 30 times per second; changed frames are forwarded immediately.
   */
  public processCueData(YargCueData: CueData): void {
    const isIdentical = this.lastData !== null && this.isDataEqual(this.lastData, YargCueData)
    if (
      isIdentical &&
      monotonicNowMs() - this.lastForwardedIdenticalAt < IDENTICAL_FRAME_THROTTLE_MS
    ) {
      return
    }

    this.handleSceneTransition(YargCueData.currentScene)

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
    if (cueType && isCueType(cueType)) {
      // Fallback cue support: some songs contain a venue track that is just blackout cues, etc.
      // YARG won't autogen for these, so we see if we keep getting non-driving cues, if so trigger the fallback.
      const nonDriving = isNonDrivingCueType(cueType)
      // A blackout/no-cue can be a legitimate look, so the *first* one after a real cue still resets
      // the window like any cue. Only a continuing run of them is non-driving — that's what lets a
      // song streaming blackouts fall through to the Fallback.
      const continuingBlackoutRun = nonDriving && this.inNonDrivingRun
      if (continuingBlackoutRun) {
        // Non-driving: don't reset the window; suppress while the Fallback owns the look.
        if (!this.fallbackActive) {
          this.cueHandler.handleCue(cueType, YargCueData)
        }
      } else {
        // Real cue, or the first blackout of a run: YARG is actively driving the lights. Reset the
        // window and clear any active Fallback so this cue takes over immediately.
        this.lastCueReceivedAt = monotonicNowMs()
        this.fallbackActive = false
        this.cueHandler.handleCue(cueType, YargCueData)
      }
      this.inNonDrivingRun = nonDriving
    } else {
      log.warn(`Unknown lighting cue value received: ${YargCueData.lightingCue}`)
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

    this.cueHandler.handleVocalNote(YargCueData)

    this.lastData = YargCueData
    if (isIdentical) {
      this.lastForwardedIdenticalAt = monotonicNowMs()
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
    return POST_PROCESSING_MAP[byteValue] ?? 'Unknown'
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
        log.error('Failed to read existing log file. Starting fresh.', err);
        existingLogs = [];
      }
    }

    const combinedLogs = existingLogs.concat(this.logBuffer);

    try {
      fs.writeFileSync(this.logFilePath, JSON.stringify(combinedLogs, null, 2), 'utf-8');
      log.info(`Flushed ${this.logBuffer.length} logs to ${this.logFilePath}`);
      // Clear the buffer after flushing
      this.logBuffer = [];
    } catch (err) {
      log.error('Failed to write log file:', err);
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
      log.info(`YARG: Scene transition detected: ${this.lastScene} -> ${currentScene}`)

      // Handle Menu -> Gameplay transition (song start)
      if (this.lastScene === 'Menu' && currentScene === 'Gameplay') {
        log.info('YARG: Song starting - triggering blackout to clear menu lighting')
        // Reset the fallback window so it starts fresh from song start.
        this.lastCueReceivedAt = monotonicNowMs()
        this.fallbackActive = false
        this.inNonDrivingRun = false
        this.cueHandler.notifySongStart()
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

      // Handle Gameplay -> other (song end)
      if (this.lastScene === 'Gameplay' && currentScene !== 'Gameplay') {
        this.fallbackActive = false
        this.cueHandler.notifySongEnd()
      }
    }

    // Update the last scene
    this.lastScene = currentScene
  }

  public async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    return this.stop()
  }
}
