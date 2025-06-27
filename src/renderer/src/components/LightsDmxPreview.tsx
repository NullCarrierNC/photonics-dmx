import React from 'react';
import { MdTv } from 'react-icons/md';
import { FaUser } from 'react-icons/fa';
import {
  LightingConfiguration,
  DmxFixture,
  FixtureTypes,
  RgbDmxChannels,
  RgbwDmxChannels,
  ConfigStrobeType,
} from '../../../photonics-dmx/types';

interface LightsDmxPreviewProps {
  lightingConfig: LightingConfiguration;
  dmxValues: Record<number, number>;
}

const LightsDmxPreview: React.FC<LightsDmxPreviewProps> = ({
  lightingConfig,
  dmxValues,
}) => {
  /**
   * Helper function to calculate the light's color based on DMX values.
   */
  const getLightColor = (light: DmxFixture): string => {
    const { channels, fixture } = light;

    if (fixture === FixtureTypes.STROBE) {
      // For strobe fixtures, use only masterDimmer for brightness
      const dimmer = dmxValues[channels.masterDimmer] || 255;
      const scale = dimmer / 255;

      // Represent strobe with grayscale color
      return `rgb(${Math.round(255 * scale)}, ${Math.round(255 * scale)}, ${Math.round(255 * scale)})`;
    }

    if (fixture === FixtureTypes.RGB || fixture === FixtureTypes.RGBS || fixture === FixtureTypes.RGBMH) {
      // For RGB fixtures, cast to RgbDmxChannels and calculate color
      const rgbChannels = channels as RgbDmxChannels;
      const red = dmxValues[rgbChannels.red] || 0;
      const green = dmxValues[rgbChannels.green] || 0;
      const blue = dmxValues[rgbChannels.blue] || 0;
      const dimmer = dmxValues[rgbChannels.masterDimmer] || 255;
      const scale = dimmer / 255;

      return `rgb(${Math.round(red * scale)}, ${Math.round(green * scale)}, ${Math.round(blue * scale)})`;
    }

    if (fixture === FixtureTypes.RGBW || fixture === FixtureTypes.RGBWS || fixture === FixtureTypes.RGBWMH ) {
      // For RGBW fixtures, cast to RgbwDmxChannels and calculate color
      const rgbwChannels = channels as RgbwDmxChannels;
      const red = dmxValues[rgbwChannels.red] || 0;
      const green = dmxValues[rgbwChannels.green] || 0;
      const blue = dmxValues[rgbwChannels.blue] || 0;
      const white = dmxValues[rgbwChannels.white] || 0;
      const dimmer = dmxValues[rgbwChannels.masterDimmer] || 255;
      const scale = dimmer / 255;

      return `rgb(${Math.round((red + white) * scale)}, ${Math.round((green + white) * scale)}, ${Math.round((blue + white) * scale)})`;
    }

    // Default to black if fixture type is unknown
    return 'rgb(0, 0, 0)';
  };

  /**
   * Helper function to render individual light circles.
   */
  const renderLightCircle = (light: DmxFixture, index: number) => (
    <div
      key={light.id || `light-${index}`}
      className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold shadow-md mx-2"
      style={{
        backgroundColor: getLightColor(light),
      }}
    >
      {light.position}
    </div>
  );

  /**
   * Helper function to render a row of lights.
   */
  const renderLightRow = (lights: DmxFixture[]) => (
    <div className="flex justify-center gap-x-4 mb-4">
      {lights.map((light, index) => renderLightCircle(light, index))}
    </div>
  );

  /**
   * Helper function to render people icons between front and back rows.
   */
  const renderPeople = () => (
    <div className="flex justify-center mt-1">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="mx-2 ">
          <FaUser size={20} className="text-gray-600 dark:text-gray-300" />
        </div>
      ))}
    </div>
  );

  /**
   * Helper function to render the strobe indicator.
   */
  const renderStrobeIndicator = (light: DmxFixture) => (
    <div
      key={light.id}
      className="w-24 h-8 flex items-center justify-center text-white dark:text-white rounded mt-4 mx-auto"
      style={{
        backgroundColor: getLightColor(light),
      }}
    >
      Strobe
    </div>
  );

  return (
    <div className="mt-8 pt-3 pb-3 bg-gray-200 dark:bg-gray-700 rounded-lg">
      <div className="flex flex-col items-center">
        {/* Icon representing the lighting setup */}
        <div className="mb-1">
          <MdTv size={30} className="text-gray-600 dark:text-gray-300" />
        </div>

        {/* Render front lights */}
        {lightingConfig?.frontLights.length > 0 && (
          <div className="w-full flex flex-col items-center">
            <div className="mb-1 text-lg font-semibold text-gray-700 dark:text-gray-300">Front</div>
            {renderLightRow(lightingConfig.frontLights)}
          </div>
        )}

        {/* Render strobe light if dedicated */}
        {lightingConfig?.strobeType === ConfigStrobeType.Dedicated &&
          lightingConfig.strobeLights.map((strobeLight) => renderStrobeIndicator(strobeLight))}

        {/* Render people icons */}
        {lightingConfig?.backLights.length > 0 && renderPeople()}

        {/* Render back lights */}
        {lightingConfig?.backLights.length > 0 && (
          <div className="w-full flex flex-col items-center mt-3">
            <div className="mb-1 text-lg font-semibold text-gray-700 dark:text-gray-300">Back</div>
            {renderLightRow(lightingConfig.backLights)}
          </div>
        )}
      </div>
    </div>
  );
};

export default LightsDmxPreview;