import dgram from 'dgram'
import { EventEmitter } from 'events'

import {
  CueData,
  StrobeState,
  CueType,
  isCueType,
  isNonDrivingCueType,
  InstrumentNoteType,
  DrumNoteType,
} from '../../cues/types/cueTypes'
import { createLogger } from '../../../shared/logger'
import type { SongEventCondition } from '../../controllers/sequencer/interfaces'
import { monotonicNowMs } from '../../../shared/time'
import { MIN_SUPPORTED_DATAGRAM_VERSION, MAX_KNOWN_DATAGRAM_VERSION } from './yargTypes'
import { parseYargPacket } from './yargPacketParser'
import { computeInstrumentRisingEdges, shouldForwardFrame } from './yargFrameDispatch'

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
  /** Stops the active strobe slot without clearing per-frame edge baselines. */
  stopActiveStrobe?(): void
  /** Stops any active strobe and clears per-frame edge baselines at YARG session boundaries. */
  resetYargSessionState?(): void
  /**
   * Advance action-timing waits gated on a song event (e.g. an RB3 `led-3` / `fog-on` edge). Optional
   * so existing YARG-only runtimes need no change; the RB3 cue-mode processor calls it. Typed off the
   * sequencer union so the two can't drift.
   */
  handleSongEvent?(condition: SongEventCondition): void
  /**
   * Force a motion-cue re-pick on every chain. Optional; the RB3 cue-mode processor calls it when its
   * switch-timer has elapsed and Light 1 changes state (RB3 has no beat to key motion selection on).
   */
  requestMotionRepick?(): void
}

const PORT = 36107

/** How often the fallback-cue condition is polled (ms). */
const FALLBACK_POLL_MS = 500

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

  /** Last forwarded frame (used for strobe edge detection and fallback context). */
  private lastData: CueData | null = null

  /** Last received frame before forward gating (may differ from lastData when throttled). */
  private lastReceivedData: CueData | null = null

  /** Timestamp (ms) when we last forwarded a frame to handlers. */
  private lastForwardedAt = 0

  /** One-shot latch for newer-than-known datagram version warnings. */
  private newerVersionWarningEmitted = false

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
      this.server = dgram.createSocket({ type: 'udp4', recvBufferSize: 8192 })
      this.setupServerEvents()
    }

    return new Promise<void>((resolve, reject) => {
      this.startBindReject = reject
      this.newerVersionWarningEmitted = false
      this.resetSessionInputState()
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
    this.cueHandler.stopActiveStrobe?.()
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
        this.deserializePacket(msg)
      } catch (error) {
        log.error('Failed to parse message:', error)
      }
    })
  }

  /** Minimum supported datagram version for full cue payloads (excluding shutdown sentinel 0). */
  protected getMinSupportedDatagramVersion(): number {
    return MIN_SUPPORTED_DATAGRAM_VERSION
  }

  /** Reset dispatch and handler edge baselines at YARG session boundaries. */
  private resetSessionInputState(): void {
    this.cueHandler.resetYargSessionState?.()
    this.lastData = null
    this.lastReceivedData = null
    this.lastForwardedAt = 0
    this.lastScene = null
  }

  private emitNewerVersionWarning(datagramVersion: number): void {
    if (this.newerVersionWarningEmitted) {
      return
    }
    this.newerVersionWarningEmitted = true
    this.emit('yarg-error', {
      type: 'datagram-version-newer',
      severity: 'warning' as const,
      message: `YARG datagram version ${datagramVersion} is newer than this build supports (${MAX_KNOWN_DATAGRAM_VERSION}). Lighting may not work correctly — check for a Photonics update.`,
      datagramVersion,
    })
  }

  private deserializePacket(buffer: Buffer) {
    try {
      const result = parseYargPacket(buffer, this.getMinSupportedDatagramVersion())

      switch (result.kind) {
        case 'shutdown':
          log.info('YARG shutdown notification (datagram version 0)')
          this.resetSessionInputState()
          this.emit('yarg-error', {
            type: 'yarg-shutdown',
            message: 'YARG Has Shutdown',
            datagramVersion: 0,
          })
          return
        case 'reject':
          if (result.reason === 'header') {
            log.warn(`Invalid YARG packet: ${result.detail}`)
            return
          }
          if (result.reason === 'version-too-old') {
            log.error(result.detail)
            this.emit('yarg-error', {
              type: 'datagram-version-mismatch',
              message: result.detail,
              datagramVersion: result.datagramVersion,
            })
          } else {
            log.warn(`Invalid YARG packet: ${result.detail}`)
          }
          return
        case 'cue':
          if (result.newerVersionWarning) {
            this.emitNewerVersionWarning(result.data.datagramVersion)
          }
          this.processCueData(result.data)
          return
      }
    } catch (error) {
      log.error('YARG Listener: Error during packet deserialization:', error)
    }
  }

  /**
   * Process one frame of cue data: beat/keyframe, lighting cue, strobe (including passive strobe-off),
   * and instrument notes. Used by deserializePacket and by tests for passive strobe behaviour.
   * Forwards on pulse packets, instrument/vocal/level changes, or a 30 Hz keepalive.
   */
  public processCueData(YargCueData: CueData): void {
    const now = monotonicNowMs()
    const forward = shouldForwardFrame(
      this.lastReceivedData,
      YargCueData,
      this.lastForwardedAt,
      now,
    )
    this.lastReceivedData = YargCueData

    if (!forward) {
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
      // Fallback window: real cues and the first blackout/no-cue of a run reset the window.
      // A continuing run of non-driving cues does not — songs that only stream blackouts
      // fall through to the Fallback poller.
      const nonDriving = isNonDrivingCueType(cueType)
      const continuingBlackoutRun = nonDriving && this.inNonDrivingRun
      if (continuingBlackoutRun) {
        // Non-driving run: don't reset the window; suppress while Fallback owns the look.
        if (!this.fallbackActive) {
          this.cueHandler.handleCue(cueType, YargCueData)
        }
      } else {
        // Driving cue (or first blackout of a run): reset the window and clear active Fallback.
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

    const noteEdges = computeInstrumentRisingEdges(this.lastData, YargCueData)
    for (const note of noteEdges.drumNotes) {
      if (note !== DrumNoteType.None) {
        this.cueHandler.handleDrumNote(note, YargCueData)
      }
    }
    for (const note of noteEdges.guitarNotes) {
      if (note !== InstrumentNoteType.None) {
        this.cueHandler.handleGuitarNote(note, YargCueData)
      }
    }
    for (const note of noteEdges.bassNotes) {
      if (note !== InstrumentNoteType.None) {
        this.cueHandler.handleBassNote(note, YargCueData)
      }
    }
    for (const note of noteEdges.keysNotes) {
      if (note !== InstrumentNoteType.None) {
        this.cueHandler.handleKeysNote(note, YargCueData)
      }
    }

    this.cueHandler.handleVocalNote(YargCueData)

    this.lastData = YargCueData
    this.lastForwardedAt = now
  }

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
