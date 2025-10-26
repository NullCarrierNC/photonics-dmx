import React, { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import {
  activeDmxLightsConfigAtom,
  senderIpcEnabledAtom,
} from '@renderer/atoms';
import LightsDmxPreview from '@renderer/components/LightsDmxPreview';
import LightsDmxChannelsPreview from '@renderer/components/LightsDmxChannelsPreview';
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers';
import DmxSettingsAccordion from '@renderer/components/PhotonicsInputOutputToggles';
import CuePreview from '@renderer/components/CuePreview';
import ActiveGroupsSelector from '@renderer/components/ActiveCueGroupsSelector';

const DmxPreview: React.FC = () => {
  const [lightingConfig] = useAtom(activeDmxLightsConfigAtom);
  const [_isIpcEnabled] = useAtom(senderIpcEnabledAtom);
  const [dmxValues, setDmxValues] = useState<Record<number, number>>({});

  // Automatically enable IPC sender for preview functionality when lights are configured
  useEffect(() => {
    if (lightingConfig && Object.keys(lightingConfig).length > 0) {
      window.electron.ipcRenderer.send('sender-enable', {sender:'ipc'});
      console.log('IPC sender enabled for preview functionality');
    }
  }, [lightingConfig]);

  // Listen for IPC messages to receive DMX values.
  useEffect(() => {
    const handleDmxValues = (_: unknown, universeBuffer: Record<number, number>) => {
      // Set the buffer directly
      setDmxValues(universeBuffer);
    };

    // Add the listener
    addIpcListener('dmxValues', handleDmxValues);

    return () => {
      // Remove the listener
      removeIpcListener('dmxValues', handleDmxValues);
    };
  }, []);

  return (
    <div className="p-6 w-full mx-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">DMX Preview</h1>
     
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          The DMX Preview allows you to see what your lighting rig should be doing. The preview uses the actual DMX channel data being  
          <em> sent</em> by Photonics 
          This is useful for debugging/testing your setup and confirming the configuration of your lights is correct.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-8">
          <strong>Note:</strong> It does not monitor for sACN/ArtNet data on the network.
        </p>
        <hr className="my-6 border-gray-200 dark:border-gray-600" />
        <DmxSettingsAccordion startOpen={true} />
        <ActiveGroupsSelector />
        <CuePreview />
        <LightsDmxPreview lightingConfig={lightingConfig!} dmxValues={dmxValues} />
        <LightsDmxChannelsPreview lightingConfig={lightingConfig!} dmxValues={dmxValues} />
    </div>
  );
};

export default DmxPreview;