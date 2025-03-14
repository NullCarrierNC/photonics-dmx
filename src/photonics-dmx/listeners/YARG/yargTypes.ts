
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
  }
  
  export enum KeyFrameByte {
    Off = 0,
    KeyframeFirst = 27,
    KeyframeNext = 28,
    KeyframePrevious = 29,
  }
  
  export enum BeatByte {
    Measure = 0,
    Strong = 1,
    Weak = 2,
    Off = 3,
  }
  
  
