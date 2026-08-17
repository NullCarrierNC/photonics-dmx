export enum PlatformByte {
  Unknown = 0,
  Windows = 1,
  Linux = 2,
  Mac = 3,
}

export enum VenueSizeByte {
  NoVenue = 0,
  Small = 1,
  Large = 2,
}

export enum SceneIndexByte {
  Unknown = 0,
  Menu = 1,
  Gameplay = 2,
  Score = 3,
  Calibration = 4,
  Practice = 5,
}

export enum PauseStateByte {
  AtMenu = 0,
  Unpaused = 1,
  Paused = 2,
}

export enum SongSectionByte {
  None = 0,
  Chorus = 2,
  Verse = 5,
}

export enum GuitarBassKeyboardNotesByte {
  None = 0,
  Open = 1 << 0,
  Green = 1 << 1,
  Red = 1 << 2,
  Yellow = 1 << 3,
  Blue = 1 << 4,
  Orange = 1 << 5,
}

export enum DrumNotesByte {
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

export enum PostProcessingByte {
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

export enum KeyFrameByte {
  Off = 0,
  KeyframeFirst = 27,
  KeyframeNext = 28,
  KeyframePrevious = 29,
}

/** Beat type at the versioned beat offset (v3/v4: 38, v5: 40).
 * Does not match YALCY's BeatByte enum; this mapping matches live YARG wire data.
 */
export enum BeatByte {
  Measure = 0,
  Strong = 1,
  Weak = 2,
  Off = 3,
}

/** Strobe cue bytes at the versioned strobe offset (v3/v4: 37, v5: 39). */
export enum StrobeByte {
  Strobe_Fastest = 20,
  Strobe_Fast = 21,
  Strobe_Medium = 22,
  Strobe_Slow = 23,
  Strobe_Off = 24,
}

export enum DatagramVersionByte {
  Shutdown = 0,
  CameraCut = 3,
  PlayerStarPower = 4,
  FogRemainingDuration = 5,
}

export const YARG_PACKET_HEADER = 0x59415247
export const LEGACY_PACKET_SIZE = 47
export const V4_FIXED_PACKET_SIZE = LEGACY_PACKET_SIZE + 2
export const V5_FIXED_PACKET_SIZE = 51
export const MAX_KNOWN_DATAGRAM_VERSION = DatagramVersionByte.FogRemainingDuration
export const MIN_SUPPORTED_DATAGRAM_VERSION = DatagramVersionByte.CameraCut

/** Performer bitmask for Spotlight and Singalong bytes (Guitar=1, Bass=2, Drums=4, Vocals=8, Keyboard=16). */
export enum PerformerByte {
  None = 0,
  Guitar = 1 << 0,
  Bass = 1 << 1,
  Drums = 1 << 2,
  Vocals = 1 << 3,
  Keyboard = 1 << 4,
}

/** Camera cut constraint flags (byte 44). */
export enum CameraCutConstraintByte {
  None = 0,
  OnlyClose = 1,
  OnlyFar = 2,
  NoClose = 4,
  NoBehind = 8,
}

/** Camera cut priority (byte 45). */
export enum CameraCutPriorityByte {
  Normal = 0,
  Directed = 1,
}

/** Camera cut subject (byte 46). */
export enum CameraCutSubjectByte {
  Crowd = 0,
  Stage = 1,
  AllBehind = 2,
  AllFar = 3,
  AllNear = 4,
  BehindNoDrum = 5,
  NearNoDrum = 6,
  Guitar = 7,
  GuitarBehind = 8,
  GuitarCloseup = 9,
  GuitarCloseupHead = 10,
  Drums = 11,
  DrumsKick = 12,
  DrumsBehind = 13,
  DrumsCloseupHand = 14,
  DrumsCloseupHead = 15,
  Bass = 16,
  BassBehind = 17,
  BassCloseup = 18,
  BassCloseupHead = 19,
  Vocals = 20,
  VocalsCloseup = 21,
  VocalsBehind = 22,
  Keys = 23,
  KeysBehind = 24,
  KeysCloseupHand = 25,
  KeysCloseupHead = 26,
  DrumsVocals = 27,
  BassDrums = 28,
  DrumsGuitar = 29,
  BassVocalsBehind = 30,
  BassVocals = 31,
  GuitarVocalsBehind = 32,
  GuitarVocals = 33,
  KeysVocalsBehind = 34,
  KeysVocals = 35,
  BassGuitarBehind = 36,
  BassGuitar = 37,
  BassKeysBehind = 38,
  BassKeys = 39,
  GuitarKeysBehind = 40,
  GuitarKeys = 41,
  Random = 42,
}
