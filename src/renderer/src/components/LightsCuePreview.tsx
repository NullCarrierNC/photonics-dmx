import React from 'react';
import { DmxFixture } from '../../../photonics-dmx/types';

interface LightsCuePreviewProps {
  activeLights: Record<number, DmxFixture | null>;
  layout: string;
  channelValues: Record<number, Record<string, number>>; // Channel values for each light
  lightStates: Record<number, 'attack' | 'hold' | 'release' | 'off'>; // Current state of each light
}

const LightsCuePreview: React.FC<LightsCuePreviewProps> = ({
  activeLights,
  layout,
  channelValues,
  lightStates,
}) => {
  const lightIndices = Object.keys(activeLights)
    .map((key) => parseInt(key, 10))
    .sort((a, b) => a - b);

  const renderLightCircle = (index: number) => {
    const light = activeLights[index];
    const channels = channelValues[index] || { red: 0, green: 0, blue: 0, masterDimmer: 0 };
    const state = lightStates[index] || 'off';
    const isOff = channels.red === 0 && channels.green === 0 && channels.blue === 0 && channels.masterDimmer === 0;
    const colorStyle = {
      backgroundColor: isOff
        ? 'black' // Black background when the light is off
        : `rgba(${channels.red}, ${channels.green}, ${channels.blue}, ${channels.masterDimmer / 255})`,
    };
    const circleLabel = light?.isStrobeEnabled ? `S-${index + 1}` : `${index + 1}`;
    const lightLabel = light ? light.label : `Light ${index + 1}`;

    return (
      <div key={index} className="flex flex-col items-center mx-2 min-w-[70px]">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold shadow-md text-gray-800 dark:text-gray-200"
          style={colorStyle}
        >
          {circleLabel}
        </div>
        <div className="mt-1 text-xs text-gray-700 dark:text-gray-300 text-center">
          <div>{lightLabel}</div>
          <div>MD: {channels.masterDimmer}</div>
          <div>R: {channels.red}</div>
          <div>G: {channels.green}</div>
          <div>B: {channels.blue}</div>
          
          <div className="font-bold">{state.toUpperCase()}</div>
        </div>
      </div>
    );
  };

  const renderLightRow = (indices: number[]) => (
    <div className="flex justify-center gap-x-6">
      {indices.map((index) => renderLightCircle(index))}
    </div>
  );

  return (
    <div className="mt-8 pt-2 pb-4 bg-gray-200 dark:bg-gray-700 rounded-lg">
      <div className="flex flex-col items-center">
        {layout === 'front-back' && lightIndices.length === 8 ? (
          <>
            <div>{renderLightRow(lightIndices.slice(0, 4))}</div>
            <div className="h-5" />
            <div>{renderLightRow(lightIndices.slice(4, 8))}</div>
          </>
        ) : (
          <div>{renderLightRow(lightIndices)}</div>
        )}
      </div>
    </div>
  );
};

export default LightsCuePreview;