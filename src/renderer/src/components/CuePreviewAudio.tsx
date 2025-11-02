import React, { useState, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { audioDataAtom, audioConfigAtom } from '../atoms';
import type { Color } from '../../../photonics-dmx/types';

// Map Color type to RGB values for preview bars (matches AudioColorMapping.tsx)
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

interface CuePreviewAudioProps {
  className?: string;
}

const CuePreviewAudio: React.FC<CuePreviewAudioProps> = ({ className = '' }) => {
  // Read audio data from atom (no IPC needed - data stays in renderer!)
  const audioData = useAtomValue(audioDataAtom);
  const audioConfig = useAtomValue(audioConfigAtom);
  const [lastBeatTime, setLastBeatTime] = useState(0);

  // Get configured colors with fallback to defaults
  const bassColor = audioConfig?.colorMapping?.bassColor || 'red';
  const midsColor = audioConfig?.colorMapping?.midsColor || 'blue';
  const highsColor = audioConfig?.colorMapping?.highsColor || 'yellow';

  // Get RGB values for the bars
  const bassColorRgb = COLOR_TO_RGB[bassColor as Color] || COLOR_TO_RGB.red;
  const midsColorRgb = COLOR_TO_RGB[midsColor as Color] || COLOR_TO_RGB.blue;
  const highsColorRgb = COLOR_TO_RGB[highsColor as Color] || COLOR_TO_RGB.yellow;

  // Track beat detection for pulse animation
  useEffect(() => {
    if (audioData?.beatDetected) {
      setLastBeatTime(Date.now());
    }
  }, [audioData?.beatDetected]);

  // Calculate if beat indicator should show (fades after 200ms)
  const showBeatPulse = audioData?.beatDetected || (Date.now() - lastBeatTime < 200);

  if (!audioData) {
    return (
      <div className={`p-3 bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`}>
        <h3 className="text-lg font-semibold mb-1">Audio Preview</h3>
        <p className="text-gray-500 dark:text-gray-400">Waiting for audio data...</p>
      </div>
    );
  }

  const { frequencyBands, energy, bpm } = audioData;

  return (
    <div className={`p-4 bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Audio Preview</h3>
        {bpm && (
          <div className="text-sm font-mono bg-gray-300 dark:bg-gray-600 px-2 py-1 rounded">
            {bpm.toFixed(0)} BPM
          </div>
        )}
      </div>

      {/* Frequency Bars */}
      <div className="space-y-3 mb-4">
        {/* Bass */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-300">Bass (20-250Hz)</span>
            <span className="text-gray-600 dark:text-gray-300 font-mono">
              {(frequencyBands.bass * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded overflow-hidden">
            <div
              className="h-full transition-all duration-150 ease-out"
              style={{ 
                width: `${frequencyBands.bass * 100}%`,
                backgroundColor: bassColorRgb
              }}
            />
          </div>
        </div>

        {/* Mids */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-300">Mids (250-4kHz)</span>
            <span className="text-gray-600 dark:text-gray-300 font-mono">
              {(frequencyBands.mids * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded overflow-hidden">
            <div
              className="h-full transition-all duration-150 ease-out"
              style={{ 
                width: `${frequencyBands.mids * 100}%`,
                backgroundColor: midsColorRgb
              }}
            />
          </div>
        </div>

        {/* Highs */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-300">Highs (4-20kHz)</span>
            <span className="text-gray-600 dark:text-gray-300 font-mono">
              {(frequencyBands.highs * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded overflow-hidden">
            <div
              className="h-full transition-all duration-150 ease-out"
              style={{ 
                width: `${frequencyBands.highs * 100}%`,
                backgroundColor: highsColorRgb
              }}
            />
          </div>
        </div>

        {/* Overall Energy */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-300 font-semibold">Overall Energy</span>
            <span className="text-gray-600 dark:text-gray-300 font-mono">
              {(energy * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-150 ease-out"
              style={{ width: `${energy * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Beat Indicator */}
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Beat Detected:</span>
        <div className={`w-16 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-200 ${
          showBeatPulse
            ? 'bg-white border-gray-300 text-black' 
            : 'bg-gray-800 border-gray-600 text-white'
        }`}>
          {showBeatPulse ? 'BEAT' : 'OFF'}
        </div>
      </div>
    </div>
  );
};

export default CuePreviewAudio;

