import React from 'react';
import YargEnabledCueGroups from '../components/YargEnabledCueGroups';
import AudioEnabledCueGroups from '../components/AudioEnabledCueGroups';
import CueConsistencySettings from '../components/CueConsistencySettings';
import DmxOutputSettings from '../components/DmxOutputSettings';
import StageKitModeSettings from '../components/StageKitModeSettings';
import BrightnessSettings from '../components/BrightnessSettings';
import ClockRateSettings from '../components/ClockRateSettings';

const Preferences: React.FC = () => {
  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Preferences</h1>
      <DmxOutputSettings />
      <BrightnessSettings />
     
      <YargEnabledCueGroups/>
      <AudioEnabledCueGroups/>
      <StageKitModeSettings />
      <CueConsistencySettings />
      <ClockRateSettings />
    </div>
  );
};

export default Preferences; 