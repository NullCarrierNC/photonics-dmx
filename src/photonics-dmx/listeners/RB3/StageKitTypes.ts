/**
 * Configuration interface for StageKit direct mode
 */
export interface StageKitConfig {
  /** Whether StageKit mode is enabled */
  enabled: boolean;
  
  /** Number of DMX lights to control (4 or 8) */
  dmxLightCount: 4 | 8;
  
  /** How to map StageKit LEDs to DMX lights */
  mappingMode: 'direct' | 'scaled' | 'circular';
  
  /** Whether to scale brightness values */
  brightnessScaling: boolean;
  
  /** Whether to apply color correction */
  colorCorrection: boolean;
  
  /** Whether to enable debug logging */
  debug?: boolean;
}

/**
 * Light state change event data
 */
export interface LightStateChangeEvent {
  /** Left channel value from RB3E */
  leftChannel: number;
  
  /** Right channel value from RB3E */
  rightChannel: number;
  
  /** Current brightness setting */
  brightness: 'low' | 'medium' | 'high';
  
  /** StageKit LED positions being controlled */
  ledPositions: number[];
  
  /** DMX light indices being updated */
  dmxLightIndices: number[];
  
  /** Color being applied */
  color: string;
  
  /** Timestamp of the change */
  timestamp: number;
}

/**
 * RB3E packet data structure
 */
export interface RB3EPacketData {
  /** Left channel value (LED position control) */
  leftChannel: number;
  
  /** Right channel value (color/effect control) */
  rightChannel: number;
  
  /** Current brightness setting */
  brightness: 'low' | 'medium' | 'high';
}

/**
 * StageKit LED position mapping
 */
export interface StageKitLedMapping {
  /** LED position (0-7) */
  position: number;
  
  /** Physical location description */
  location: string;
  
  /** DMX light index to map to */
  dmxIndex: number;
}

/**
 * Color mapping information
 */
export interface ColorMapping {
  /** Color name */
  name: string;
  
  /** RGB values */
  rgb: { r: number; g: number; b: number };
  
  /** RB3E right channel value */
  rightChannelValue: number;
}

/**
 * Default StageKit configuration
 */
export const DEFAULT_STAGEKIT_CONFIG: StageKitConfig = {
  enabled: true,
  dmxLightCount: 4,
  mappingMode: 'scaled',
  brightnessScaling: true,
  colorCorrection: true,
  debug: false
};
