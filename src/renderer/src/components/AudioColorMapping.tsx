import React, { useState, useEffect, useCallback } from 'react';
import type { Color, Brightness } from '../../../photonics-dmx/types';
import FrequencyRangeSlider from './FrequencyRangeSlider';

// Colors suitable for audio-reactive lighting (excludes black, and colors that don't make sense for lighting)
// Transparent is included to allow ranges to be disabled while seeing effects from other ranges
const AUDIO_COLOR_OPTIONS: Color[] = [
  'red', 'blue', 'yellow', 'green', 'cyan', 'magenta', 'orange', 
  'purple', 'teal', 'violet', 'amber', 'chartreuse', 'vermilion', 'white', 'transparent'
];

// Brightness options
const BRIGHTNESS_OPTIONS: Array<{ value: Brightness; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' }
];

// Map Color type to RGB values for preview swatches (matches dmxHelpers.ts colorMap)
const COLOR_TO_RGB: Record<Color, string> = {
  red: 'rgb(255, 0, 0)',
  blue: 'rgb(0, 0, 255)',
  yellow: 'rgb(255, 255, 0)',
  green: 'rgb(0, 255, 0)',
  cyan: 'rgb(0, 255, 255)',
  orange: 'rgb(255, 127, 0)',
  purple: 'rgb(128, 0, 128)',
  chartreuse: 'rgb(127, 255, 0)',
  teal: 'rgb(0, 128, 128)',
  violet: 'rgb(138, 43, 226)',
  magenta: 'rgb(255, 0, 255)',
  vermilion: 'rgb(227, 66, 52)',
  amber: 'rgb(255, 191, 0)',
  white: 'rgb(255, 255, 255)',
  black: 'rgb(0, 0, 0)',
  transparent: 'rgb(0, 0, 0)'
};

// Default frequency ranges
const DEFAULT_RANGES = [
  { id: 'range1', name: 'Bass', minHz: 20, maxHz: 250, color: 'red' as Color, brightness: 'medium' as Brightness },
  { id: 'range2', name: 'Low-Mids', minHz: 250, maxHz: 800, color: 'blue' as Color, brightness: 'medium' as Brightness },
  { id: 'range3', name: 'Mids', minHz: 800, maxHz: 4000, color: 'yellow' as Color, brightness: 'medium' as Brightness },
  { id: 'range4', name: 'Upper-Mids', minHz: 4000, maxHz: 10000, color: 'green' as Color, brightness: 'medium' as Brightness },
  { id: 'range5', name: 'Highs', minHz: 10000, maxHz: 20000, color: 'cyan' as Color, brightness: 'medium' as Brightness }
];

interface FrequencyRange {
  id: string;
  name: string;
  minHz: number;
  maxHz: number;
  color: Color;
  brightness: Brightness;
}

const AudioColorMapping: React.FC = () => {
  const [ranges, setRanges] = useState<FrequencyRange[]>(DEFAULT_RANGES);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load configuration on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await window.electron.ipcRenderer.invoke('get-audio-config');
        if (config?.colorMapping?.ranges && Array.isArray(config.colorMapping.ranges) && config.colorMapping.ranges.length > 0) {
          // Use loaded ranges
          setRanges(config.colorMapping.ranges as FrequencyRange[]);
        } else {
          // Use defaults
          setRanges(DEFAULT_RANGES);
        }
      } catch (error) {
        console.error('Failed to load audio color mapping:', error);
        setRanges(DEFAULT_RANGES);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  // Save configuration
  const saveConfig = useCallback(async (updatedRanges: FrequencyRange[]) => {
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      await window.electron.ipcRenderer.invoke('save-audio-config', {
        colorMapping: {
          ranges: updatedRanges
        }
      });
    } catch (error) {
      console.error('Failed to save color mapping:', error);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving]);

  // Handle range frequency change
  const handleRangeChange = useCallback((rangeId: string, minHz: number, maxHz: number) => {
    const updatedRanges = ranges.map(range =>
      range.id === rangeId ? { ...range, minHz, maxHz } : range
    );
    setRanges(updatedRanges);
    saveConfig(updatedRanges);
  }, [ranges, saveConfig]);

  // Handle color change
  const handleColorChange = useCallback((rangeId: string, color: Color) => {
    const updatedRanges = ranges.map(range =>
      range.id === rangeId ? { ...range, color } : range
    );
    setRanges(updatedRanges);
    saveConfig(updatedRanges);
  }, [ranges, saveConfig]);

  // Handle brightness change
  const handleBrightnessChange = useCallback((rangeId: string, brightness: Brightness) => {
    const updatedRanges = ranges.map(range =>
      range.id === rangeId ? { ...range, brightness } : range
    );
    setRanges(updatedRanges);
    saveConfig(updatedRanges);
  }, [ranges, saveConfig]);

  // Handle name change
  const handleNameChange = useCallback((rangeId: string, name: string) => {
    const updatedRanges = ranges.map(range =>
      range.id === rangeId ? { ...range, name } : range
    );
    setRanges(updatedRanges);
    saveConfig(updatedRanges);
  }, [ranges, saveConfig]);


  if (isLoading) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Loading frequency color mapping configuration...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Configure frequency ranges, colors, and brightness levels for audio-reactive lighting. Overlapping ranges will blend colors additively.
      </p>

      {ranges.map((range) => {
        return (
          <div
            key={range.id}
            className="p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-colors"
          >
            {/* Label, Color, and Brightness controls on same line */}
            <div className="flex items-center gap-4 mb-3">
              {/* Range name input with label */}
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Label:
              </label>
              <input
                type="text"
                value={range.name}
                onChange={(e) => handleNameChange(range.id, e.target.value)}
                disabled={isSaving}
                className="px-2 py-1 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
              />

              {/* Color selector */}
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-4">
                Color:
              </label>
              <select
                value={range.color}
                onChange={(e) => handleColorChange(range.id, e.target.value as Color)}
                disabled={isSaving}
                className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {AUDIO_COLOR_OPTIONS.map(color => (
                  <option key={color} value={color}>
                    {color.charAt(0).toUpperCase() + color.slice(1)}
                  </option>
                ))}
              </select>

              {/* Color preview swatch */}
              <div
                className="w-12 h-8 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0"
                style={{ backgroundColor: COLOR_TO_RGB[range.color] }}
                title={range.color}
              />

              {/* Brightness selector */}
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-4">
                Brightness:
              </label>
              <select
                value={range.brightness}
                onChange={(e) => handleBrightnessChange(range.id, e.target.value as Brightness)}
                disabled={isSaving}
                className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {BRIGHTNESS_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Frequency range slider */}
            <div className="mb-1">
              <FrequencyRangeSlider
                minHz={range.minHz}
                maxHz={range.maxHz}
                minBound={20}
                maxBound={20000}
                onChange={(minHz, maxHz) => handleRangeChange(range.id, minHz, maxHz)}
                disabled={isSaving}
              />
            </div>
          </div>
        );
      })}

      {isSaving && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Saving...</p>
      )}
    </div>
  );
};

export default AudioColorMapping;
