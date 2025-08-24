import React from 'react';
import PrefCueGroups from '../components/PrefCueGroups';
import CueConsistencySettings from '../components/CueConsistencySettings';

const Preferences: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Preferences</h1>
      
      <PrefCueGroups />
      <CueConsistencySettings />
    </div>
  );
};

export default Preferences; 