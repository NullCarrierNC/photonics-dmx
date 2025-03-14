import { Brightness, Color, FixtureTypes, RgbDmxChannels, RGBIP, RgbMovingHeadDmxChannels, RgbStrobeDmxChannels, RgbwDmxChannels, RgbwMovingHeadDmxChannels, RgbwStrobeDmxCannels, StrobeDmxChannels } from "../types";

/**
 * Generates an RGBIP object based on the specified color and brightness.
 * 
 * @param color - The base color from the color wheel, 'white', 'black', or 'transparent'.
 * @param brightness - The brightness level ('low', 'medium', 'high', 'max'). Ignored for black/transparent.
 * @returns An RGBIP object with the specified color and brightness.
 */
export const getColor = (
  color: Color,
  brightness: Brightness
): RGBIP => {
  const colorMap: { [key in typeof color]: { r: number; g: number; b: number } } = {
    red:        { r: 255, g: 0,   b: 0 },
    blue:       { r: 0,   g: 0,   b: 255 },
    yellow:     { r: 255, g: 255, b: 0 },
    green:      { r: 0,   g: 255, b: 0 },
    orange:     { r: 255, g: 127, b: 0 },
    purple:     { r: 128, g: 0,   b: 128 },
    chartreuse: { r: 127, g: 255, b: 0 },
    teal:       { r: 0,   g: 128, b: 128 },
    violet:     { r: 138, g: 43,  b: 226 },
    magenta:    { r: 255, g: 0,   b: 255 },
    vermilion:  { r: 227, g: 66,  b: 52 },
    amber:      { r: 255, g: 191, b: 0 },
    white:      { r: 255, g: 255, b: 255 },
    black:      { r: 0,   g: 0,   b: 0 },
    transparent: { r: 0,  g: 0,    b: 0 } 
  };

  const brightnessMap: { [key in typeof brightness]: number } = {
    low:    40,
    medium: 100,
    high:   180,
    max:    255,
  };

  if (color === 'black') {
    return {
      red: 0, green: 0, blue: 0, intensity: 0,
      rp: 255, gp: 255, bp: 255, ip: 255, // Priority is 255 so that the RGBI values forcibly set 0 (black)
    };
  }
  
  if (color === 'transparent') {
    return {
      red: 0, green: 0, blue: 0, intensity: 0,
      rp: 0, gp: 0, bp: 0, ip: 0, // Priority all zeroed out, otherwise it would be black.
    };
  }

  const selectedColor = colorMap[color];
  const selectedIntensity = brightnessMap[brightness];

  // Construct the RGBIP object
  return {
    red: selectedColor.r,
    rp: 255, 
    green: selectedColor.g,
    gp: 255, 
    blue: selectedColor.b,
    bp: 255, 
    intensity: selectedIntensity,
    ip: 255, 
  };
};

/**
 * Casts a channel configuration to the appropriate fixture type
 * 
 * @param fixtureType - The type of fixture to cast to
 * @param channels - Channel configuration object
 * @returns A strongly-typed channel object for the specified fixture type
 */
export const castToChannelType = (
  fixtureType: FixtureTypes,
  channels: { [key: string]: number }
): RgbDmxChannels | RgbStrobeDmxChannels | RgbwDmxChannels | RgbwStrobeDmxCannels | StrobeDmxChannels | RgbMovingHeadDmxChannels | RgbwMovingHeadDmxChannels => {
  switch (fixtureType) {
    case FixtureTypes.RGB:
      return {
        red: channels.red || 0,
        green: channels.green || 0,
        blue: channels.blue || 0,
        masterDimmer: channels.masterDimmer || 0,
      } as RgbDmxChannels;
    case FixtureTypes.RGBS:
      return {
        red: channels.red || 0,
        green: channels.green || 0,
        blue: channels.blue || 0,
        masterDimmer: channels.masterDimmer || 0,
        strobeSpeed: channels.strobeSpeed || 0,
      } as RgbStrobeDmxChannels;
    case FixtureTypes.RGBW:
      return {
        red: channels.red || 0,
        green: channels.green || 0,
        blue: channels.blue || 0,
        white: channels.white || 0,
        masterDimmer: channels.masterDimmer || 0,
      } as RgbwDmxChannels;
    case FixtureTypes.RGBWS:
      return {
        red: channels.red || 0,
        green: channels.green || 0,
        blue: channels.blue || 0,
        white: channels.white || 0,
        masterDimmer: channels.masterDimmer || 0,
        strobeSpeed: channels.strobeSpeed || 0,
      } as RgbwStrobeDmxCannels;
    case FixtureTypes.STROBE:
      return {
        masterDimmer: channels.masterDimmer || 0,
        strobeSpeed: channels.strobeSpeed || 0,
      } as StrobeDmxChannels;
    case FixtureTypes.RGBMH:
      return {
        red: channels.red || 0,
        green: channels.green || 0,
        blue: channels.blue || 0,
        masterDimmer: channels.masterDimmer || 0,
        pan: channels.pan || 0,
        tilt: channels.tilt || 0,
      } as RgbMovingHeadDmxChannels;
    case FixtureTypes.RGBWMH:
      return {
        red: channels.red || 0,
        green: channels.green || 0,
        blue: channels.blue || 0,
        white: channels.white || 0,
        masterDimmer: channels.masterDimmer || 0,
        pan: channels.pan || 0,
        tilt: channels.tilt || 0,
      } as RgbwMovingHeadDmxChannels;
    default:
      throw new Error(`Unknown fixture type: ${fixtureType}`);
  }
};