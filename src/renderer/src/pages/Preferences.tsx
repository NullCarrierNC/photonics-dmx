import React from 'react';
import PrefCueGroups from '../components/PrefCueGroups';
import CueConsistencySettings from '../components/CueConsistencySettings';
import DmxOutputSettings from '../components/DmxOutputSettings';
import StageKitModeSettings from '../components/StageKitModeSettings';
import BrightnessSettings from '../components/BrightnessSettings';

const Preferences: React.FC = () => {
  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Preferences</h1>
      <DmxOutputSettings />
      <BrightnessSettings />
      <PrefCueGroups />
      <StageKitModeSettings />
      <CueConsistencySettings />
     
    </div>
  );
};

export default Preferences; 