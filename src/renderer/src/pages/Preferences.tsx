import React from 'react';
import PrefCueGroups from '../components/PrefCueGroups';
import CueConsistencySettings from '../components/CueConsistencySettings';
import DmxOutputSettings from '../components/DmxOutputSettings';
import StageKitModeSettings from '../components/StageKitModeSettings';
import BrightnessSettings from '../components/BrightnessSettings';

const Preferences: React.FC = () => {
  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Preferences</h1>
      <DmxOutputSettings />
      <BrightnessSettings />
      <StageKitModeSettings />
      
      <PrefCueGroups />
      <CueConsistencySettings />
     
    </div>
  );
};

export default Preferences; 