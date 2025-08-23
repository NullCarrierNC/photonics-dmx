import React from 'react';
import { MdTv } from 'react-icons/md';
import { FaUser } from 'react-icons/fa';
import { ConfigStrobeType } from '../../../photonics-dmx/types';

interface LightLayoutPreviewProps {
  frontCount: number;
  backCount: number;
  highlightedLight: number | null;
  selectedStrobe: ConfigStrobeType;
}

const LightLayoutPreview: React.FC<LightLayoutPreviewProps> = ({
  frontCount,
  backCount,
  highlightedLight,
  selectedStrobe,
}) => {
  /**
   * Helper function to render individual light circles.
   * Highlights the light if it matches `highlightedLight`.
   */
  const renderLightCircle = (number: number) => (
    <div
      key={number}
      className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold shadow-md mx-2
        ${
          highlightedLight === number
            ? 'bg-yellow-500 text-black'
            : 'bg-gray-300 dark:bg-[#303548] text-gray-800 dark:text-gray-200'
        }`}
    >
      {number}
    </div>
  );

  /**
   * Helper function to render a row of light circles from `start` to `end`.
   */
  const renderLightRow = (start: number, end: number) => (
    <div className="flex justify-center gap-x-4 mb-4">
      {Array.from({ length: end - start + 1 }, (_, i) => renderLightCircle(start + i))}
    </div>
  );

  /**
   * Helper function to render the strobe indicator.
   * Highlights the indicator if any dedicated strobe light is selected.
   *
   * We assume that dedicated strobe lights are appended after the front and back lights.
   * Thus, if `highlightedLight` is greater than or equal to (frontCount + backCount + 1),
   * it represents one of the dedicated strobe lights.
   */
  const renderStrobeIndicator = () => {
    const strobeStart = frontCount + backCount + 1;
    const isHighlighted =
      selectedStrobe === ConfigStrobeType.Dedicated &&
      highlightedLight !== null &&
      highlightedLight >= strobeStart;
    return (
      <div
        className={`w-24 h-8 flex items-center justify-center text-white dark:text-black rounded mt-4 mx-auto
        ${isHighlighted ? 'bg-yellow-500 dark:bg-yellow-600' : 'bg-gray-400 dark:bg-gray-500'}`}
      >
        Strobe
      </div>
    );
  };

  /**
   * Helper function to render people icons.
   */
  const renderPeople = () => (
    <div className="flex justify-center mt-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="mx-2 mt-2">
          <FaUser size={24} className="text-gray-600 dark:text-gray-300" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="mt-8 pt-2 pb-4 bg-gray-200 dark:bg-gray-700 rounded-lg">
      <div className="flex flex-col items-center">
        {/* Icon representing the lighting setup */}
        <div className="mb-4">
          <MdTv size={48} className="text-gray-600 dark:text-gray-300" />
        </div>

        {/* Render front lights if applicable */}
        {frontCount > 0 && (
          <div className="w-full flex flex-col items-center">
            <div className="mb-2 text-lg font-semibold text-gray-700 dark:text-gray-300">Front</div>
            {renderLightRow(1, frontCount)}
          </div>
        )}

        {/* Render strobe indicator if dedicated */}
        {selectedStrobe === ConfigStrobeType.Dedicated && (
          <div className="w-full flex justify-center">
            {renderStrobeIndicator()}
          </div>
        )}

        {/* Render people icons between front and back */}
        {backCount > 0 && renderPeople()}

        {/* Render back lights if applicable */}
        {backCount > 0 && (
          <div className="w-full flex flex-col items-center mt-4">
            <div className="mb-2 text-lg font-semibold text-gray-700 dark:text-gray-300">Back</div>
            {/* Render back lights in reverse order to match new natural ring progression */}
            <div className="flex justify-center gap-x-4 mb-4">
              {Array.from({ length: backCount }, (_, i) => 
                renderLightCircle(frontCount + backCount - i)
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LightLayoutPreview;