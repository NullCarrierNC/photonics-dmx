import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Color, Brightness } from '../../../photonics-dmx/types';
import FrequencyRangeSlider from './FrequencyRangeSlider';

// Colors suitable for audio-reactive lighting (excludes black, and colors that don't make sense for lighting)
// Transparent is included to allow ranges to be disabled while seeing effects from other ranges
const AUDIO_COLOR_OPTIONS: Color[] = [
  'white',
  'red',
  'green',
  'blue',
  'vermilion',
  'orange',
  'amber',
  'yellow',
  'chartreuse',
  'teal',
  'cyan',
  'violet',
  'purple',
  'magenta',
  'transparent'
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
  { id: 'range1', name: 'Bass', minHz: 20, maxHz: 250, color: 'red' as Color, brightness: 'medium' as Brightness, sensitivity: 1.0 },
  { id: 'range2', name: 'Low-Mids', minHz: 250, maxHz: 800, color: 'blue' as Color, brightness: 'medium' as Brightness, sensitivity: 1.0 },
  { id: 'range3', name: 'Mids', minHz: 800, maxHz: 4000, color: 'yellow' as Color, brightness: 'medium' as Brightness, sensitivity: 1.0 },
  { id: 'range4', name: 'Upper-Mids', minHz: 4000, maxHz: 10000, color: 'green' as Color, brightness: 'medium' as Brightness, sensitivity: 1.0 },
  { id: 'range5', name: 'Highs', minHz: 10000, maxHz: 20000, color: 'cyan' as Color, brightness: 'medium' as Brightness, sensitivity: 1.0 }
];

const THREE_BAND_VISIBLE_IDS = ['range1', 'range3', 'range5'];

const BAND_OPTIONS: Array<{ value: 3 | 5; label: string }> = [
  { value: 3, label: '3 Bands (Bass / Mids / Highs)' },
  { value: 5, label: '5 Bands (Bass / Low-Mids / Mids / Upper-Mids / Highs)' },
];

interface FrequencyRange {
  id: string;
  name: string;
  minHz: number;
  maxHz: number;
  color: Color;
  brightness: Brightness;
  sensitivity: number;
}

const normalizeRanges = (inputRanges: FrequencyRange[]): FrequencyRange[] => {
  const rangeMap = new Map(inputRanges.map((range) => [range.id, range]));
  return DEFAULT_RANGES.map((defaultRange) => {
    const existing = rangeMap.get(defaultRange.id);
    return {
      ...defaultRange,
      ...existing,
      sensitivity: existing?.sensitivity ?? defaultRange.sensitivity,
    };
  });
};

const AudioColorMapping: React.FC = () => {
  const [ranges, setRanges] = useState<FrequencyRange[]>(() => normalizeRanges(DEFAULT_RANGES));
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Local state for sensitivity sliders to prevent re-renders during drag
  const [localSensitivityValues, setLocalSensitivityValues] = useState<Map<string, number>>(new Map());
  const [bandCount, setBandCount] = useState<3 | 5>(3);
  const [activeColorPickerId, setActiveColorPickerId] = useState<string | null>(null);
  const colorPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeColorPickerId) {
      colorPickerRef.current = null;
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setActiveColorPickerId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeColorPickerId]);

  // Load configuration on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await window.electron.ipcRenderer.invoke('get-audio-config');
        if (config?.frequencyBands?.ranges && Array.isArray(config.frequencyBands.ranges) && config.frequencyBands.ranges.length > 0) {
          const normalized = normalizeRanges(config.frequencyBands.ranges as FrequencyRange[]);
          setRanges(normalized);
          setBandCount((config.frequencyBands.bandCount as 3 | 5) ?? 3);
          setLocalSensitivityValues(new Map());
        } else {
          setRanges(normalizeRanges(DEFAULT_RANGES));
          setBandCount(3);
          setLocalSensitivityValues(new Map());
        }
      } catch (error) {
        console.error('Failed to load audio frequency bands:', error);
        setRanges(normalizeRanges(DEFAULT_RANGES));
        setBandCount(3);
        setLocalSensitivityValues(new Map());
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  // Save configuration
  const saveConfig = useCallback(async (updatedRanges: FrequencyRange[], overrideBandCount?: 3 | 5) => {
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      await window.electron.ipcRenderer.invoke('save-audio-config', {
        frequencyBands: {
          bandCount: overrideBandCount ?? bandCount,
          ranges: updatedRanges
        }
      });
    } catch (error) {
      console.error('Failed to save frequency bands:', error);
    } finally {
      setIsSaving(false);
    }
  }, [bandCount, isSaving]);

  const handleBandCountChange = useCallback((value: 3 | 5) => {
    setBandCount(value);
    saveConfig(ranges, value);
  }, [ranges, saveConfig]);

  const handleColorPickerToggle = useCallback((rangeId: string) => {
    setActiveColorPickerId((prev) => (prev === rangeId ? null : rangeId));
  }, []);

  const displayRanges = useMemo(() => {
    if (bandCount === 3) {
      return ranges.filter((range) => THREE_BAND_VISIBLE_IDS.includes(range.id));
    }
    return ranges;
  }, [bandCount, ranges]);

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
    setActiveColorPickerId(null);
    colorPickerRef.current = null;
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

  // Handle sensitivity slider change (local state only, no save)
  const handleSensitivitySliderChange = useCallback((rangeId: string, sensitivity: number) => {
    setLocalSensitivityValues(prev => {
      const newMap = new Map(prev);
      newMap.set(rangeId, sensitivity);
      return newMap;
    });
  }, []);

  // Handle sensitivity change (save on mouse up or blur)
  const handleSensitivityChange = useCallback(async (rangeId: string, sensitivity: number) => {
    const updatedRanges = ranges.map(range =>
      range.id === rangeId ? { ...range, sensitivity } : range
    );
    setRanges(updatedRanges);
    setLocalSensitivityValues(prev => {
      const newMap = new Map(prev);
      newMap.delete(rangeId);
      return newMap;
    });
    await saveConfig(updatedRanges);
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
          Loading frequency band configuration...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
       <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Configure frequency ranges, colours, and brightness levels for audio-reactive lighting. Overlapping ranges will blend colours additively.
      </p>


      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Number of Bands</h3>
          
        </div>
        <select
          value={bandCount}
          onChange={(e) => handleBandCountChange(Number(e.target.value) as 3 | 5)}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-auto"
        >
          {BAND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      
     
      {displayRanges.map((range) => {
        // Get current sensitivity value (local state if dragging, otherwise from range)
        const currentSensitivity = localSensitivityValues.has(range.id) 
          ? localSensitivityValues.get(range.id)! 
          : (range.sensitivity ?? 1.0);
        
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

              {/* Color picker */}
              <div className="flex items-center ml-4 gap-2 relative">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  Colour:
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => handleColorPickerToggle(range.id)}
                    disabled={isSaving}
                    className="flex items-center justify-between border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[140px]"
                  >
                    <span className="text-sm">
                      {range.color.charAt(0).toUpperCase() + range.color.slice(1)}
                    </span>
                    <span
                      className="w-10 h-6 rounded border border-gray-200 dark:border-gray-500"
                      style={{ backgroundColor: COLOR_TO_RGB[range.color] }}
                    />
                  </button>
                  {activeColorPickerId === range.id && (
                    <div
                      ref={(node) => {
                        if (activeColorPickerId === range.id) {
                          colorPickerRef.current = node;
                        }
                      }}
                      className="absolute top-full left-0 z-20 mt-2 w-56 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3"
                    >
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">
                        Choose a colour
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {AUDIO_COLOR_OPTIONS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`w-8 h-8 rounded-md border border-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              range.color === color ? 'ring-2 ring-blue-500' : ''
                            }`}
                            style={{ backgroundColor: COLOR_TO_RGB[color] }}
                            onClick={() => handleColorChange(range.id, color as Color)}
                            aria-label={`Select ${color}`}
                            title={color.charAt(0).toUpperCase() + color.slice(1)}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        onClick={() => {
                          setActiveColorPickerId(null);
                          colorPickerRef.current = null;
                        }}
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              </div>

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

            {/* Sensitivity slider */}
            <div className="mb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 sm:min-w-[90px]">
                  Sensitivity
                </label>
                <div className="flex items-center flex-1 gap-4">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={currentSensitivity}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      handleSensitivitySliderChange(range.id, value);
                    }}
                    onMouseUp={(e) => {
                      const value = parseFloat((e.target as HTMLInputElement).value);
                      handleSensitivityChange(range.id, value);
                    }}
                    disabled={isSaving}
                    className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentSensitivity / 1.0) * 100}%, #e5e7eb ${(currentSensitivity / 1.0) * 100}%, #e5e7eb 100%)`
                    }}
                  />
                  <div className="flex items-center space-x-2 min-w-[70px] justify-end">
                    <span className="text-sm text-gray-600 dark:text-gray-400 text-right">
                      {currentSensitivity.toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      / 1.0
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={currentSensitivity}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      handleSensitivitySliderChange(range.id, Math.max(0, Math.min(1, value)));
                    }}
                    onBlur={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      handleSensitivityChange(range.id, Math.max(0, Math.min(1, value)));
                    }}
                    disabled={isSaving}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
                  />
                </div>
              </div>
            </div>

            {/* Frequency range slider */}
            <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 sm:min-w-[90px]">
                Frequency
              </label>
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
