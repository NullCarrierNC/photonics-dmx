import * as dgram from 'dgram'
import { EventEmitter } from 'events'
import { Rb3ePacketType, Rb3GameState } from './rb3eTypes'
import { CueData, StrobeState } from '../../cues/types/cueTypes'
import { createLogger } from '../../../shared/logger'
import {
  createRb3eCueData,
  decodeBandInfo,
  decodeScore,
  describeRejectReason,
  parseRb3ePacketHeader,
  parseStageKitData,
  readNullTerminatedString,
} from './rb3ePacketParser'
import type { StageKitPersistentState } from './rb3ePacketParser'

const log = createLogger('Rb3eNetworkListener')

// Use the same port that RB3Enhanced sends to.
const PORT = 21070

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
 *   // handle data
 * });
 *
 * // Listen for specific song information
 * listener.on('rb3eSongName', (songName) => {
 *   // handle song name
 * });
 *
 * // Listen for platform changes
 * listener.on('rb3ePlatform', (platform) => {
 *   // handle platform
 * });
 *
 * listener.start();
 * ```
 */
export class Rb3eNetworkListener extends EventEmitter {
  private server: dgram.Socket | null = null
  private listening = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- packet header shape from parser
  private lastData: { header: any; payload: Buffer; cueData: CueData } | null = null
  // Track persistent strobe state across all packet types
  private _currentStrobeState: StrobeState = 'Strobe_Off'
  // Track persistent fog state (StageKit FogOn/FogOff commands) across all packet types
  private _currentFogState: boolean = false
  // Packet counter for debugging
  private packetCount = 0

  constructor() {
    super()
    log.info('Rb3eNetworkListener initialized as event emitter.')
  }

  /**
   * Binds the UDP socket. Resolves once the socket is listening; rejects if the bind fails
   * (e.g. EADDRINUSE), so callers can surface the failure instead of assuming the listener is up.
   * Post-bind runtime errors are handled by the listener registered in `setupServerEvents`.
   */
  public start(): Promise<void> {
    if (this.listening) {
      log.warn('RB3ENetworkListener is already running.')
      return Promise.resolve()
    }
    log.info(`RB3ENetworkListener: Starting UDP server on port ${PORT}...`)
    this.server = dgram.createSocket('udp4')
    this.setupServerEvents()
    return new Promise((resolve, reject) => {
      const sock = this.server!
      const onListening = (): void => {
        sock.off('error', onBindError)
        this.listening = true
        log.info(`RB3ENetworkListener started and listening on port ${PORT}`)
        resolve()
      }
      const onBindError = (err: Error): void => {
        sock.off('listening', onListening)
        this.server = null
        this.listening = false
        reject(err)
      }
      sock.once('listening', onListening)
      sock.once('error', onBindError)
      sock.bind(PORT)
    })
  }

  /**
   * Closes the UDP socket and resolves when the OS has released the port
   * (required before a new listener can bind the same port).
   */
  public stop(): Promise<void> {
    if (!this.server) {
      this.listening = false
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const sock = this.server!
      sock.close(() => {
        log.info('RB3ENetworkListener server closed.')
        this.listening = false
        this.server = null
        resolve()
      })
    })
  }

  public shutdown(): Promise<void> {
    return this.stop()
  }

  private setupServerEvents() {
    if (!this.server) return

    this.server.on('error', (err) => {
      log.error(`Server error:\n${err.stack}`)
      this.server?.close()
      this.listening = false
    })

    this.server.on('listening', () => {
      const address = this.server?.address()
      if (address) {
        log.info(`Listening for RB3E events on ${address.address}:${address.port}`)
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

  private deserializePacket(buffer: Buffer) {
    try {
      const parsed = parseRb3ePacketHeader(buffer, Date.now())
      if (!parsed.ok) {
        log.warn(describeRejectReason(parsed.reason))
        return
      }

      const { header, payload } = parsed
      const packetType = header.type
      this.packetCount++

      const cueData = createRb3eCueData(this.stageKitState(), header.platform)

      switch (packetType) {
        case Rb3ePacketType.EVENT_ALIVE:
          this.handleAlive(payload, cueData)
          break

        case Rb3ePacketType.EVENT_STATE:
          this.handleGameState(payload, cueData)
          break

        case Rb3ePacketType.EVENT_SONG_NAME:
          this.handleSongName(payload, cueData)
          break

        case Rb3ePacketType.EVENT_SONG_ARTIST:
          this.handleSongArtist(payload, cueData)
          break

        case Rb3ePacketType.EVENT_SONG_SHORTNAME:
          this.handleSongShortName(payload, cueData)
          break

        case Rb3ePacketType.EVENT_SCORE:
          this.handleScore(payload, cueData)
          break

        case Rb3ePacketType.EVENT_STAGEKIT:
          this.handleStageKit(payload, cueData)
          break

        case Rb3ePacketType.EVENT_BAND_INFO:
          this.handleBandInfo(payload, cueData)
          break

        case Rb3ePacketType.EVENT_VENUE_NAME:
          this.handleVenueName(payload, cueData)
          break

        case Rb3ePacketType.EVENT_SCREEN_NAME:
          this.handleScreenName(payload, cueData)
          break

        case Rb3ePacketType.EVENT_DX_DATA:
          this.handleDxData(payload, cueData)
          break

        default:
          log.warn(`Unknown RB3E packet type: ${packetType}`)
          return
      }

      // De‐duplicate repeated data
      if (this.lastData && this.isDataEqual(this.lastData, { header, payload, cueData })) {
        return
      }
      this.lastData = { header, payload, cueData }

      // Emit the enhanced cue data for external consumers
      this.emit('rb3eData', cueData)

      // Emit specific events for different data types
      if (cueData.rb3SongName) this.emit('rb3eSongName', cueData.rb3SongName)
      if (cueData.rb3SongArtist) this.emit('rb3eSongArtist', cueData.rb3SongArtist)
      if (cueData.rb3SongShortName) this.emit('rb3eSongShortName', cueData.rb3SongShortName)
      if (cueData.rb3VenueName) this.emit('rb3eVenueName', cueData.rb3VenueName)
      if (cueData.rb3ScreenName) this.emit('rb3eScreenName', cueData.rb3ScreenName)
      if (cueData.rb3BandInfo) this.emit('rb3eBandInfo', cueData.rb3BandInfo)
      if (cueData.rb3ModData) this.emit('rb3eModData', cueData.rb3ModData)
      if (cueData.rb3Platform) this.emit('rb3ePlatform', cueData.rb3Platform)
      if (cueData.rb3BuildTag) this.emit('rb3eBuildTag', cueData.rb3BuildTag)
    } catch (error) {
      log.error('Error processing RB3E packet:', error)
      log.error('Packet buffer:', buffer.toString('hex'))
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic packet comparison
  private isDataEqual(data1: any, data2: any): boolean {
    if (data1.header.type !== data2.header.type) return false
    if (data1.payload.length !== data2.payload.length) return false
    return data1.payload.equals(data2.payload)
  }

  public destroy(): Promise<void> {
    return this.stop()
  }

  /**
   * Get the current enhanced cue data
   * @returns The current CueData with all available RB3E information
   */
  public getCurrentData(): CueData | null {
    return this.lastData ? this.lastData.cueData : null
  }

  /**
   * Check if we have received basic RB3E information
   * @returns True if we have platform and basic game state information
   */
  public hasBasicInfo(): boolean {
    if (!this.lastData) return false
    const data = this.lastData.cueData
    return !!(data.rb3Platform && data.rb3Platform !== 'Unknown')
  }

  /**
   * Check if we have complete song information
   * @returns True if we have song name, artist, and basic metadata
   */
  public hasSongInfo(): boolean {
    if (!this.lastData) return false
    const data = this.lastData.cueData
    return !!(data.rb3SongName && data.rb3SongArtist && data.rb3SongShortName)
  }

  /**
   * Check if we have band information
   * @returns True if we have band member details
   */
  public hasBandInfo(): boolean {
    if (!this.lastData) return false
    const data = this.lastData.cueData
    return !!(data.rb3BandInfo && data.rb3BandInfo.members.length > 0)
  }

  /**
   * Get the current platform information
   * @returns The current platform or 'Unknown'
   */
  public getCurrentPlatform(): string {
    if (!this.lastData) return 'Unknown'
    return this.lastData.cueData.rb3Platform || 'Unknown'
  }

  /**
   * Get the current build tag
   * @returns The current build tag or empty string
   */
  public getCurrentBuildTag(): string {
    if (!this.lastData) return ''
    return this.lastData.cueData.rb3BuildTag || ''
  }

  /**
   * Get the current persistent strobe state
   * @returns The current strobe state that persists across all packet types
   */
  public getCurrentStrobeState(): StrobeState {
    return this._currentStrobeState
  }

  /**
   * Get the current song information
   * @returns Object with song name, artist, and short name
   */
  public getCurrentSongInfo(): { name: string; artist: string; shortName: string } | null {
    if (!this.lastData) return null
    const data = this.lastData.cueData
    if (!data.rb3SongName || !data.rb3SongArtist || !data.rb3SongShortName) return null

    return {
      name: data.rb3SongName,
      artist: data.rb3SongArtist,
      shortName: data.rb3SongShortName,
    }
  }

  /**
   * Get the current score information
   * @returns Object with total score, member scores, and stars
   */
  public getCurrentScoreInfo(): {
    totalScore: number
    memberScores: number[]
    stars: number
  } | null {
    if (!this.lastData) return null
    const data = this.lastData.cueData
    if (data.totalScore === undefined || !data.memberScores || data.stars === undefined) return null

    return {
      totalScore: data.totalScore,
      memberScores: data.memberScores,
      stars: data.stars,
    }
  }

  /**
   * Get the current venue and screen information
   * @returns Object with venue name and screen name
   */
  public getCurrentVenueInfo(): { venueName: string; screenName: string } | null {
    if (!this.lastData) return null
    const data = this.lastData.cueData
    if (!data.rb3VenueName || !data.rb3ScreenName) return null

    return {
      venueName: data.rb3VenueName,
      screenName: data.rb3ScreenName,
    }
  }

  /**
   * Check if we have received any RB3E data
   * @returns True if we have received at least one packet
   */
  public hasReceivedData(): boolean {
    return this.lastData !== null
  }

  /**
   * Get the timestamp of the last received data
   * @returns Timestamp in milliseconds or null if no data received
   */
  public getLastDataTimestamp(): number | null {
    return this.lastData ? this.lastData.header.timestamp : null
  }

  // Helper Methods for non‐lighting RB3E events
  private handleAlive(payload: Buffer, cueData: CueData) {
    const txt = readNullTerminatedString(payload)
    cueData.rb3BuildTag = txt
    log.info(`RB3E_EVENT_ALIVE => ${txt}`)
  }

  private handleGameState(payload: Buffer, cueData: CueData) {
    // Single byte: 0 = menus, 1 = in‐game
    if (payload.length < 1) return
    const stateByte = payload.readUInt8(0)
    const gameState: Rb3GameState = stateByte === 0 ? 'Menus' : 'InGame'

    log.info(`RB3E_EVENT_STATE => ${gameState}`)

    // Emit this packet's parsed data. lastData is assigned only at the end of deserializePacket,
    // so it still holds the previous packet here; read from the cueData parameter instead.
    this.emit('rb3e:gameState', {
      gameState,
      platform: cueData.rb3Platform || 'Unknown',
      timestamp: Date.now(),
      cueData,
    })
  }

  private handleSongName(payload: Buffer, cueData: CueData) {
    const name = readNullTerminatedString(payload)
    cueData.rb3SongName = name

    // Emit song name event for event processors to handle
    this.emit('rb3e:songName', {
      songName: name,
      timestamp: Date.now(),
    })

    log.info(`RB3E_EVENT_SONG_NAME => ${name}`)
  }

  private handleSongArtist(payload: Buffer, cueData: CueData) {
    const artist = readNullTerminatedString(payload)
    cueData.rb3SongArtist = artist

    // Emit song artist event for event processors to handle
    this.emit('rb3e:songArtist', {
      songArtist: artist,
      timestamp: Date.now(),
    })

    log.info(`RB3E_EVENT_SONG_ARTIST => ${artist}`)
  }

  private handleSongShortName(payload: Buffer, cueData: CueData) {
    const shortName = readNullTerminatedString(payload)
    cueData.rb3SongShortName = shortName

    // Emit song short name event for event processors to handle
    this.emit('rb3e:songShortName', {
      songShortName: shortName,
      timestamp: Date.now(),
    })

    log.info(`RB3E_EVENT_SONG_SHORTNAME => ${shortName}`)
  }

  private handleScore(payload: Buffer, _cueData: CueData) {
    const score = decodeScore(payload)
    if (!score) {
      log.warn(`Score payload too short, expected >=21, got ${payload.length}`)
      return
    }
    const { totalScore, memberScores, stars } = score

    _cueData.totalScore = totalScore
    _cueData.memberScores = memberScores
    _cueData.stars = stars

    // Emit score event for event processors to handle
    this.emit('rb3e:score', {
      totalScore,
      memberScores,
      stars,
      timestamp: Date.now(),
    })

    log.info(
      `RB3E_EVENT_SCORE => totalScore=${totalScore}, stars=${stars}, memberScores=${memberScores}`,
    )
  }

  private handleStageKit(payload: Buffer, cueData: CueData) {
    // StageKit struct has 2 bytes: LeftChannel, RightChannel
    if (payload.length < 2) {
      log.warn(`STAGEKIT payload too short: expected 2 bytes, got ${payload.length}`)
      return
    }

    const { data, state } = parseStageKitData(
      payload.readUInt8(0),
      payload.readUInt8(1),
      this.stageKitState(),
      Date.now(),
    )
    this._currentStrobeState = state.strobeState
    this._currentFogState = state.fogState

    // The packet may have carried a strobe or fog command, so the frame reports the state it left.
    cueData.strobeState = state.strobeState
    cueData.fogState = state.fogState

    this.emit('stagekit:data', data)
  }

  /** Strobe and fog as the last StageKit packet left them. */
  private stageKitState(): StageKitPersistentState {
    return {
      strobeState: this._currentStrobeState,
      fogState: this._currentFogState,
    }
  }

  private handleBandInfo(payload: Buffer, cueData: CueData) {
    const members = decodeBandInfo(payload)
    if (!members) {
      log.warn(`Band info payload too short: expected >=12, got ${payload.length}`)
      return
    }

    cueData.rb3BandInfo = { members }

    // Emit band info event for event processors to handle
    this.emit('rb3e:bandInfo', {
      members,
      timestamp: Date.now(),
    })

    log.info(`RB3E_EVENT_BAND_INFO => members: ${JSON.stringify(members)}`)
  }

  private handleVenueName(payload: Buffer, cueData: CueData) {
    const venue = readNullTerminatedString(payload)
    cueData.rb3VenueName = venue

    // Emit venue name event for event processors to handle
    this.emit('rb3e:venueName', {
      venueName: venue,
      timestamp: Date.now(),
    })

    log.info(`RB3E_EVENT_VENUE_NAME => ${venue}`)
  }

  private handleScreenName(payload: Buffer, cueData: CueData) {
    const screen = readNullTerminatedString(payload)
    cueData.rb3ScreenName = screen

    // Emit screen name event for event processors to handle
    this.emit('rb3e:screenName', {
      screenName: screen,
      timestamp: Date.now(),
    })

    log.info(`RB3E_EVENT_SCREEN_NAME => ${screen}`)
  }

  private handleDxData(payload: Buffer, cueData: CueData) {
    // Typically 10 bytes identifyValue + up to 240 for string
    if (payload.length < 10) {
      log.warn(`DX data payload too short: expected >=10, got ${payload.length}`)
      return
    }

    const identifyValue = readNullTerminatedString(payload.subarray(0, 10))
    const string = readNullTerminatedString(payload.subarray(10))

    cueData.rb3ModData = {
      identifyValue,
      string,
    }

    // Emit DX data event for event processors to handle
    this.emit('rb3e:dxData', {
      identifyValue,
      string,
      timestamp: Date.now(),
    })

    log.info(`RB3E_EVENT_DX_DATA => identifyValue: ${identifyValue}, string: ${string}`)
  }
}
