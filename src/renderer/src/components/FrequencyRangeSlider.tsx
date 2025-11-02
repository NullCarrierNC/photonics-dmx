import React, { useState, useEffect, useCallback } from 'react';

interface FrequencyRangeSliderProps {
  minHz: number;
  maxHz: number;
  minBound: number; // Minimum allowed value (e.g., 20)
  maxBound: number; // Maximum allowed value (e.g., 20000)
  onChange: (minHz: number, maxHz: number) => void;
  disabled?: boolean;
}

const FrequencyRangeSlider: React.FC<FrequencyRangeSliderProps> = ({
  minHz,
  maxHz,
  minBound,
  maxBound,
  onChange,
  disabled = false
}) => {
  const [localMinHz, setLocalMinHz] = useState(minHz);
  const [localMaxHz, setLocalMaxHz] = useState(maxHz);
  const [isDraggingMin, setIsDraggingMin] = useState(false);
  const [isDraggingMax, setIsDraggingMax] = useState(false);

  // Update local state when props change
  useEffect(() => {
    setLocalMinHz(minHz);
    setLocalMaxHz(maxHz);
  }, [minHz, maxHz]);

  // Calculate percentage positions for slider handles
  const minPercent = ((localMinHz - minBound) / (maxBound - minBound)) * 100;
  const maxPercent = ((localMaxHz - minBound) / (maxBound - minBound)) * 100;


  // Clamp value to valid range
  const clampValue = (value: number): number => {
    return Math.max(minBound, Math.min(maxBound, value));
  };

  // Round to whole number
  const roundValue = (value: number): number => {
    return Math.round(value);
  };

  // Handle min slider change
  const handleMinChange = useCallback((value: number) => {
    const rounded = roundValue(value);
    const clamped = clampValue(rounded);
    const newMin = Math.min(clamped, localMaxHz - 1); // Ensure min < max
    setLocalMinHz(newMin);
    if (!isDraggingMin) {
      onChange(newMin, localMaxHz);
    }
  }, [localMaxHz, isDraggingMin, onChange]);

  // Handle max slider change
  const handleMaxChange = useCallback((value: number) => {
    const rounded = roundValue(value);
    const clamped = clampValue(rounded);
    const newMax = Math.max(clamped, localMinHz + 1); // Ensure max > min
    setLocalMaxHz(newMax);
    if (!isDraggingMax) {
      onChange(localMinHz, newMax);
    }
  }, [localMinHz, isDraggingMax, onChange]);

  // Handle direct input change
  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || minBound;
    const rounded = roundValue(value);
    const clamped = clampValue(rounded);
    const newMin = Math.min(clamped, localMaxHz - 1);
    setLocalMinHz(newMin);
    onChange(newMin, localMaxHz);
  };

  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || maxBound;
    const rounded = roundValue(value);
    const clamped = clampValue(rounded);
    const newMax = Math.max(clamped, localMinHz + 1);
    setLocalMaxHz(newMax);
    onChange(localMinHz, newMax);
  };

  // Mouse drag handlers
  const handleMouseDownMin = () => {
    if (disabled) return;
    setIsDraggingMin(true);
  };

  const handleMouseDownMax = () => {
    if (disabled) return;
    setIsDraggingMax(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingMin || isDraggingMax) {
        const slider = document.getElementById('frequency-range-slider');
        if (!slider) return;

        const rect = slider.getBoundingClientRect();
        const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const value = minBound + (percent / 100) * (maxBound - minBound);

        if (isDraggingMin) {
          handleMinChange(value);
        } else {
          handleMaxChange(value);
        }
      }
    };

    const handleMouseUp = () => {
      if (isDraggingMin) {
        setIsDraggingMin(false);
        onChange(localMinHz, localMaxHz);
      }
      if (isDraggingMax) {
        setIsDraggingMax(false);
        onChange(localMinHz, localMaxHz);
      }
    };

    if (isDraggingMin || isDraggingMax) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingMin, isDraggingMax, handleMinChange, handleMaxChange, localMinHz, localMaxHz, onChange]);

  return (
    <div className="flex items-center space-x-4 w-full">
      {/* Min input */}
      <input
        type="number"
        min={minBound}
        max={maxBound}
        step="1"
        value={Math.round(localMinHz)}
        onChange={handleMinInputChange}
        disabled={disabled}
        className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
      />

      {/* Slider container */}
      <div className="flex-1 relative" id="frequency-range-slider">
        {/* Background track */}
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-lg relative">
          {/* Active range track - white like existing sliders */}
          <div
            className="absolute h-2 bg-white dark:bg-gray-300 rounded-lg"
            style={{
              left: `${minPercent}%`,
              width: `${maxPercent - minPercent}%`
            }}
          />

          {/* Min handle */}
          <div
            className={`absolute w-4 h-4 bg-white dark:bg-gray-300 border-2 border-gray-400 dark:border-gray-500 rounded-full shadow-md hover:scale-110 transition-transform ${
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
            style={{
              left: `calc(${minPercent}% - 8px)`,
              top: '-4px',
            }}
            onMouseDown={handleMouseDownMin}
          />

          {/* Max handle */}
          <div
            className={`absolute w-4 h-4 bg-white dark:bg-gray-300 border-2 border-gray-400 dark:border-gray-500 rounded-full shadow-md hover:scale-110 transition-transform ${
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
            style={{
              left: `calc(${maxPercent}% - 8px)`,
              top: '-4px',
            }}
            onMouseDown={handleMouseDownMax}
          />
        </div>
      </div>

      {/* Max input */}
      <input
        type="number"
        min={minBound}
        max={maxBound}
        step="1"
        value={Math.round(localMaxHz)}
        onChange={handleMaxInputChange}
        disabled={disabled}
        className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
      />

      {/* Frequency range display */}
      <div className="text-xs text-gray-500 dark:text-gray-400 min-w-[80px] text-right">
        {Math.round(localMinHz)}-{Math.round(localMaxHz)} Hz
      </div>
    </div>
  );
};

export default FrequencyRangeSlider;

