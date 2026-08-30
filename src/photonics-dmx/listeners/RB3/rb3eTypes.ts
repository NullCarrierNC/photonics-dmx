export type Rb3GameState = 'InGame' | 'Menus'

export type Rb3Platform = 'Xbox' | 'Xenia' | 'Wii' | 'Dolphin' | 'PS3' | 'RPCS3' | 'Unknown'

export type Rb3TrackType = 'Guitar' | 'Bass' | 'Drums' | 'Vocals' | 'Keys' | 'Harmony' | 'Unknown'

export type Rb3Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert' | 'Unknown'

export interface Rb3BandMember {
  exists: boolean
  difficulty: Rb3Difficulty
  trackType: Rb3TrackType
}

export interface Rb3BandInfo {
  members: Rb3BandMember[]
}

export interface Rb3ModData {
  identifyValue: string
  string: string
}

export enum Rb3ePacketType {
  EVENT_ALIVE = 0, // string with build tag
  EVENT_STATE = 1, // char (0=menus,1=ingame)
  EVENT_SONG_NAME = 2, // string
  EVENT_SONG_ARTIST = 3, // string
  EVENT_SONG_SHORTNAME = 4, // string
  EVENT_SCORE = 5, // RB3E_EventScore struct
  EVENT_STAGEKIT = 6, // RB3E_EventStagekit struct (2 bytes)
  EVENT_BAND_INFO = 7, // RB3E_EventBandInfo struct
  EVENT_VENUE_NAME = 8, // string
  EVENT_SCREEN_NAME = 9, // string
  EVENT_DX_DATA = 10, // RB3E_EventModData struct
}

/**
 * RB3E screen names (EVENT_SCREEN_NAME payloads) that map to the main menu; both StageKit
 * processors drive their menu look from these.
 */
export const RB3_MAIN_HUB_SCREEN = 'main_hub_screen'
export const RB3_SONG_SELECT_SCREEN = 'song_select_screen'

/**
 * The parsed StageKit packet emitted on the listener's `stagekit:data` event — the single shared
 * shape consumed by both the direct processor and the RB3 cue-mode processor. `leftChannel` /
 * `rightChannel` are the raw RB3E bytes (`positions` is the derived bit list; `rightChannel` lets a
 * consumer tell DisableAll 0xFF from StrobeOff 0x07).
 */
export interface StageKitData {
  positions: number[] // LED positions derived from leftChannel: [0..7]
  color: string // colour bank: 'red' | 'green' | 'blue' | 'yellow' | 'off'
  brightness: 'low' | 'medium' | 'high'
  fog: boolean
  strobeEffect?: 'slow' | 'medium' | 'fast' | 'fastest' | 'off'
  leftChannel: number // raw 8-bit LED position mask
  rightChannel: number // raw colour-bank / effect byte
  timestamp: number
}

export enum Rb3RightChannel {
  FogOn = 0x01,
  FogOff = 0x02,

  StrobeSlow = 0x03,
  StrobeMedium = 0x04,
  StrobeFast = 0x05,
  StrobeFastest = 0x06,
  StrobeOff = 0x07,

  BlueLeds = 0x20,
  GreenLeds = 0x40,
  YellowLeds = 0x60,
  RedLeds = 0x80,

  DisableAll = 0xff,
}

export enum Rb3PlatformID {
  RB3E_PLATFORM_XBOX = 0,
  RB3E_PLATFORM_XENIA = 1,
  RB3E_PLATFORM_WII = 2,
  RB3E_PLATFORM_DOLPHIN = 3,
  RB3E_PLATFORM_PS3 = 4,
  RB3E_PLATFORM_RPCS3 = 5,
  RB3E_PLATFORM_UNKNOWN = 0xff,
}
