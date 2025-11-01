import React, { useState, useEffect } from 'react';
import type { Color } from '../../../photonics-dmx/types';

// Colors suitable for audio-reactive lighting (excludes black, transparent, and colors that don't make sense for lighting)
const AUDIO_COLOR_OPTIONS: Color[] = [
  'red', 'blue', 'yellow', 'green', 'cyan', 'magenta', 'orange', 
  'purple', 'teal', 'violet', 'amber', 'chartreuse', 'vermilion', 'white'
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

const AudioColorMapping: React.FC = () => {
  const [bassColor, setBassColor] = useState<Color>('red');
  const [midsColor, setMidsColor] = useState<Color>('blue');
  const [highsColor, setHighsColor] = useState<Color>('yellow');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadColors = async () => {
      try {
        const config = await window.electron.ipcRenderer.invoke('get-audio-config');
        if (config?.colorMapping) {
          setBassColor(config.colorMapping.bassColor || 'red');
          setMidsColor(config.colorMapping.midsColor || 'blue');
          setHighsColor(config.colorMapping.highsColor || 'yellow');
        }
      } catch (error) {
        console.error('Failed to load audio color mapping:', error);
      }
    };

    loadColors();
  }, []);

  const handleColorChange = async (band: 'bass' | 'mids' | 'highs', color: Color) => {
    setIsSaving(true);

    try {
      // Update local state
      if (band === 'bass') setBassColor(color);
      else if (band === 'mids') setMidsColor(color);
      else setHighsColor(color);

      // Save to config
      await window.electron.ipcRenderer.invoke('save-audio-config', {
        colorMapping: {
          bassColor: band === 'bass' ? color : bassColor,
          midsColor: band === 'mids' ? color : midsColor,
          highsColor: band === 'highs' ? color : highsColor
        }
      });
    } catch (error) {
      console.error('Failed to save color mapping:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Configure which colors are used for each frequency range when audio-reactive lighting is active.
      </p>

      {/* Bass Color */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-40 flex-shrink-0">
          Bass (20-250Hz):
        </label>
        <select
          value={bassColor}
          onChange={(e) => handleColorChange('bass', e.target.value as Color)}
          disabled={isSaving}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
        >
          {AUDIO_COLOR_OPTIONS.map(color => (
            <option key={color} value={color}>{color.charAt(0).toUpperCase() + color.slice(1)}</option>
          ))}
        </select>
        <div 
          className="w-12 h-8 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0" 
          style={{ backgroundColor: COLOR_TO_RGB[bassColor] }}
          title={bassColor} 
        />
      </div>

      {/* Mids Color */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-40 flex-shrink-0">
          Mids (250-4000Hz):
        </label>
        <select
          value={midsColor}
          onChange={(e) => handleColorChange('mids', e.target.value as Color)}
          disabled={isSaving}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
        >
          {AUDIO_COLOR_OPTIONS.map(color => (
            <option key={color} value={color}>{color.charAt(0).toUpperCase() + color.slice(1)}</option>
          ))}
        </select>
        <div 
          className="w-12 h-8 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0" 
          style={{ backgroundColor: COLOR_TO_RGB[midsColor] }}
          title={midsColor} 
        />
      </div>

      {/* Highs Color */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-40 flex-shrink-0">
          Highs (4000-20kHz):
        </label>
        <select
          value={highsColor}
          onChange={(e) => handleColorChange('highs', e.target.value as Color)}
          disabled={isSaving}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
        >
          {AUDIO_COLOR_OPTIONS.map(color => (
            <option key={color} value={color}>{color.charAt(0).toUpperCase() + color.slice(1)}</option>
          ))}
        </select>
        <div 
          className="w-12 h-8 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0" 
          style={{ backgroundColor: COLOR_TO_RGB[highsColor] }}
          title={highsColor} 
        />
      </div>

      {isSaving && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Saving...</p>
      )}
    </div>
  );
};

export default AudioColorMapping;

