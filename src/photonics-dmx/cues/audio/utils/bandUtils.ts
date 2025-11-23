import { AudioCueData } from '../../types/audioCueTypes';
import type { AudioConfig, AudioLightingData } from '../../../listeners/Audio/audioTypes';
import type { RGBIO, TrackedLight, Color, Brightness } from '../../../types';
import { getColor, validateColorString, getGlobalBrightnessConfig } from '../../../helpers';

export type AudioRangeConfig = AudioConfig['frequencyBands']['ranges'][number];

export const DEFAULT_LAYER_DURATION = 90;

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const getActiveBandIndices = (enabledBandCount?: number): number[] => {
  if (enabledBandCount === 3) {
    return [0, 2, 4];
  }

  if (enabledBandCount === 4) {
    return [0, 1, 2, 3];
  }

  return [0, 1, 2, 3, 4];
};

export const getBandValue = (bands: AudioLightingData['frequencyBands'], bandIndex: number): number => {
  switch (bandIndex) {
    case 0:
      return bands.range1;
    case 1:
      return bands.range2;
    case 2:
      return bands.range3;
    case 3:
      return bands.range4;
    case 4:
      return bands.range5;
    default:
      return 0;
  }
};

export const getRangeConfig = (
  config: AudioConfig,
  bandIndex: number
): AudioRangeConfig | undefined => config.frequencyBands?.ranges?.[bandIndex];

export const buildColorFromRange = (
  range: AudioRangeConfig,
  intensity: number,
  blendMode: RGBIO['blendMode'] = 'add',
  intensityScale = 1
): RGBIO | null => {
  if (!range) {
    return null;
  }

  const colorName = validateColorString(range.color);
  const brightness = range.brightness ?? 'medium';
  const rgbColor = getColor(colorName, brightness, blendMode);
  const normalized = clamp01(intensity) * intensityScale;

  rgbColor.intensity = Math.floor(rgbColor.intensity * normalized);
  rgbColor.opacity = normalized;
  return rgbColor;
};

export const getDominantBand = (
  data: AudioCueData
): { bandIndex: number; intensity: number } | null => {
  const { audioData, config, enabledBandCount } = data;
  const ranges = config.frequencyBands?.ranges ?? [];
  const activeIndices = getActiveBandIndices(enabledBandCount);

  let dominantIndex: number | null = null;
  let dominantIntensity = 0;

  activeIndices.forEach((bandIndex) => {
    const range = ranges[bandIndex];
    if (!range) {
      return;
    }
    const intensity = getBandValue(audioData.frequencyBands, bandIndex);
    if (intensity > dominantIntensity) {
      dominantIntensity = intensity;
      dominantIndex = bandIndex;
    }
  });

  if (dominantIndex === null) {
    return null;
  }

  return {
    bandIndex: dominantIndex,
    intensity: dominantIntensity
  };
};

export const getAverageBandIntensity = (
  audioData: AudioLightingData,
  bandIndices: number[]
): number => {
  if (bandIndices.length === 0) {
    return 0;
  }

  const total = bandIndices.reduce((sum, index) => sum + getBandValue(audioData.frequencyBands, index), 0);
  return total / bandIndices.length;
};

export const getRangeAndColor = (
  config: AudioConfig,
  bandIndex: number,
  intensity: number,
  blendMode: RGBIO['blendMode'] = 'add',
  intensityScale = 1
): { range: AudioRangeConfig; color: RGBIO } | null => {
  const range = getRangeConfig(config, bandIndex);
  if (!range) {
    return null;
  }

  const color = buildColorFromRange(range, intensity, blendMode, intensityScale);
  if (!color) {
    return null;
  }

  return { range, color };
};

export const splitLightsForBands = (
  lights: TrackedLight[],
  segmentCount: number
): TrackedLight[][] => {
  if (segmentCount <= 0 || lights.length === 0) {
    return [];
  }

  const segments: TrackedLight[][] = [];
  let startIndex = 0;
  let remainingLights = lights.length;
  let remainingSegments = segmentCount;

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
    if (remainingSegments <= 0) {
      break;
    }

    const isLastSegment = segmentIndex === segmentCount - 1;
    let count = isLastSegment
      ? remainingLights
      : Math.max(1, Math.floor(remainingLights / remainingSegments));

    count = Math.min(count, remainingLights);
    const segmentLights = lights.slice(startIndex, startIndex + count);
    segments.push(segmentLights);

    startIndex += count;
    remainingLights -= count;
    remainingSegments -= 1;
  }

  return segments;
};

export const scaleColor = (color: RGBIO, scale: number): RGBIO => {
  const normalizedScale = Math.max(0, scale);
  return {
    ...color,
    intensity: Math.min(255, Math.floor(color.intensity * normalizedScale)),
    opacity: clamp01(color.opacity * normalizedScale)
  };
};

export const ORGAN_COLOR_SEQUENCE: Color[] = ['red', 'amber', 'green', 'cyan', 'blue'];

export const getOrganColorByIndex = (index: number): Color => {
  if (ORGAN_COLOR_SEQUENCE.length === 0) {
    return 'white';
  }

  const normalizedIndex = ((index % ORGAN_COLOR_SEQUENCE.length) + ORGAN_COLOR_SEQUENCE.length) % ORGAN_COLOR_SEQUENCE.length;
  return ORGAN_COLOR_SEQUENCE[normalizedIndex];
};

const DEFAULT_BRIGHTNESS_MAP = {
  low: 40,
  medium: 100,
  high: 180,
  max: 255
};

const DISCRETE_LEVELS: Brightness[] = ['low', 'medium', 'high', 'max'];

export const getIntensityScale = (value: number, linearResponse: boolean): number => {
  const normalized = clamp01(value);
  if (linearResponse) {
    return normalized;
  }

  const step = Math.min(4, Math.floor(normalized * 5));
  if (step === 0) {
    return 0;
  }

  const brightnessMap = getGlobalBrightnessConfig() || DEFAULT_BRIGHTNESS_MAP;
  const level = DISCRETE_LEVELS[step - 1];
  const maxValue = brightnessMap.max || DEFAULT_BRIGHTNESS_MAP.max;
  const levelValue = brightnessMap[level] || DEFAULT_BRIGHTNESS_MAP[level];

  return levelValue / maxValue;
};

export const applyIntensityScale = (rgbColor: RGBIO, scale: number): void => {
  const normalizedScale = clamp01(scale);
  rgbColor.intensity = Math.floor(rgbColor.intensity * normalizedScale);
  rgbColor.opacity = normalizedScale;
};


