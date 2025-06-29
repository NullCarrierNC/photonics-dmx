import React from 'react';
import PrefCueGroups from '../components/PrefCueGroups';

const Preferences: React.FC = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Preferences</h1>
      <PrefCueGroups />
    </div>
  );
};

export default Preferences; 