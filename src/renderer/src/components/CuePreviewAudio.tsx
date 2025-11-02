import React, { useState, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { audioDataAtom } from '../atoms';

interface CuePreviewAudioProps {
  className?: string;
}

const CuePreviewAudio: React.FC<CuePreviewAudioProps> = ({ className = '' }) => {
  // Read audio data from atom (no IPC needed - data stays in renderer!)
  const audioData = useAtomValue(audioDataAtom);
  const [lastBeatTime, setLastBeatTime] = useState(0);

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
              className="h-full bg-red-500 transition-all duration-150 ease-out"
              style={{ width: `${frequencyBands.bass * 100}%` }}
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
              className="h-full bg-blue-500 transition-all duration-150 ease-out"
              style={{ width: `${frequencyBands.mids * 100}%` }}
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
              className="h-full bg-yellow-500 transition-all duration-150 ease-out"
              style={{ width: `${frequencyBands.highs * 100}%` }}
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

