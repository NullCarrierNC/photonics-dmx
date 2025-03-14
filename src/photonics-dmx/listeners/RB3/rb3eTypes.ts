
export type Rb3GameState = 'InGame' | 'Menus';



export enum Rb3ePacketType {
  EVENT_ALIVE          = 0, // string with build tag
  EVENT_STATE          = 1, // char (0=menus,1=ingame)
  EVENT_SONG_NAME      = 2, // string
  EVENT_SONG_ARTIST    = 3, // string
  EVENT_SONG_SHORTNAME = 4, // string
  EVENT_SCORE          = 5, // RB3E_EventScore struct
  EVENT_STAGEKIT       = 6, // RB3E_EventStagekit struct (2 bytes)
  EVENT_BAND_INFO      = 7, // RB3E_EventBandInfo struct
  EVENT_VENUE_NAME     = 8, // string
  EVENT_SCREEN_NAME    = 9, // string
  EVENT_DX_DATA        = 10 // RB3E_EventModData struct
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
  
  DisableAll = 0xFF
}