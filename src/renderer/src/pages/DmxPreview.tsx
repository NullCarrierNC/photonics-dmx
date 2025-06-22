import React, { useEffect, useState, useCallback } from 'react';
import { useAtom } from 'jotai';
import {
  activeDmxLightsConfigAtom,
  senderIpcEnabledAtom,
} from '@renderer/atoms';
import LightsDmxPreview from '@renderer/components/LightsDmxPreview';
import LightsDmxChannelsPreview from '@renderer/components/LightsDmxChannelsPreview';
import { DmxChannel, EffectSelector } from '../../../photonics-dmx/types';
import EffectsDropdown from '../components/EffectSelector';
import DmxSettingsAccordion from '@renderer/components/DmxSettingAccordion';
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers';
import CuePreview from '@renderer/components/CuePreview';
import { useTimeoutEffect } from '../utils/useTimeout';
import CueRegistrySelector from '@renderer/components/CueRegistrySelector';

type CueRegistryType = 'YARG' | 'RB3E';

type CueGroup = {
  name: string;
  description: string;
  cueTypes: string[];
};

const DmxPreview: React.FC = () => {
  const [lightingConfig] = useAtom(activeDmxLightsConfigAtom);
  const [_isIpcEnabled, setIsIpcEnabled] = useAtom(senderIpcEnabledAtom);
  const [dmxValues, setDmxValues] = useState<Record<number, number>>({});
  const [selectedEffect, setSelectedEffect] = useState<EffectSelector | null>(null);
  const [, setRegistryType] = useState<CueRegistryType>('YARG');
  const [selectedGroup, setSelectedGroup] = useState<string>('default');
  const [currentGroup, setCurrentGroup] = useState<CueGroup | null>(null);
  
  // State for manual simulation indicators
  const [showBeatIndicator, setShowBeatIndicator] = useState(false);
  const [showMeasureIndicator, setShowMeasureIndicator] = useState(false);
  const [showKeyframeIndicator, setShowKeyframeIndicator] = useState(false);

  // Reset indicators after timeout
  const resetBeatIndicator = useCallback(() => setShowBeatIndicator(false), []);
  const resetMeasureIndicator = useCallback(() => setShowMeasureIndicator(false), []);
  const resetKeyframeIndicator = useCallback(() => setShowKeyframeIndicator(false), []);
  
  // Set up auto-reset timeouts for indicators
  // The delay is null when indicator is off, and set to 200ms when indicator is turned on
  useTimeoutEffect(resetBeatIndicator, showBeatIndicator ? 200 : null);
  useTimeoutEffect(resetMeasureIndicator, showMeasureIndicator ? 200 : null);
  useTimeoutEffect(resetKeyframeIndicator, showKeyframeIndicator ? 200 : null);

  // Fetch current group info when selected group changes
  useEffect(() => {
    const fetchGroupInfo = async () => {
      try {
        const groups = await window.electron.ipcRenderer.invoke('get-cue-groups');
        const group = groups.find((g: CueGroup) => g.name === selectedGroup);
        if (group) {
          setCurrentGroup(group);
          
          // Fetch available effects for the new group
          try {
            const availableEffects = await window.electron.ipcRenderer.invoke('get-available-cues', selectedGroup);
            
            // Reset the currently selected effect since we changed groups
            setSelectedEffect(null);
            
            // If there are effects available, select the first one automatically
            if (availableEffects && availableEffects.length > 0) {
              const firstEffect = availableEffects[0];
              setSelectedEffect({
                id: firstEffect.id,
                yargDescription: firstEffect.yargDescription,
                rb3Description: firstEffect.rb3Description,
                groupName: firstEffect.groupName
              });
              console.log(`Auto-selected first effect: ${firstEffect.id} from group ${selectedGroup}`);
            }
          } catch (error) {
            console.error('Error fetching available effects for group:', error);
          }
        }
      } catch (error) {
        console.error('Error fetching group info:', error);
      }
    };
    
    if (selectedGroup) {
      fetchGroupInfo();
    }
  }, [selectedGroup]);

  // Automatically enable IPC sender on mount and disable on unmount.
  useEffect(() => {
    setIsIpcEnabled(true);
    window.electron.ipcRenderer.send('sender-enable', {sender:'ipc'});
    console.log('IPC sender enabled automatically on mount');

    return () => {
      setIsIpcEnabled(false);
      window.electron.ipcRenderer.send('sender-disable', {sender:'ipc'} ) ;
      console.log('IPC sender disabled automatically on unmount');
    };
  }, [setIsIpcEnabled]);

  // Listen for IPC messages to receive DMX values.
  useEffect(() => {
    const handleDmxValues = (_: unknown, channels: DmxChannel[]) => {
      const values = channels.reduce<Record<number, number>>((acc, channel) => {
        acc[channel.channel] = channel.value;
        return acc;
      }, {});
      setDmxValues(values);
    };

    // Add the listener
    addIpcListener('dmxValues', handleDmxValues);

    return () => {
      // Remove the listener
      removeIpcListener('dmxValues', handleDmxValues);
    };
  }, []);

  const handleTestEffect = async () => {
    if (!selectedEffect) {
      console.log('No effect selected');
      return;
    }

    console.log(`Test Cue for Effect: ${selectedEffect.id}`);
    await window.electron.ipcRenderer.invoke('start-test-effect', selectedEffect.id);
  };

  const handleStopTestEffect = async () => {
    await window.electron.ipcRenderer.invoke('stop-test-effect');
  };

  const handleSimulateBeat = async () => {
    await window.electron.ipcRenderer.invoke('simulate-beat');
    // Simply turn on the indicator, the useTimeoutEffect will reset it
    setShowBeatIndicator(true);
  };

  const handleSimulateKeyframe = async () => {
    await window.electron.ipcRenderer.invoke('simulate-keyframe');
    setShowKeyframeIndicator(true);
  };

  const handleSimulateMeasure = async () => {
    await window.electron.ipcRenderer.invoke('simulate-measure');
    setShowMeasureIndicator(true);
  };

  const handleRegistryChange = (type: CueRegistryType) => {
    setRegistryType(type);
    // Future implementation: switch between YARG and RB3E registries
  };

  // Memoize handleGroupChange to prevent unnecessary re-renders/calls from CueRegistrySelector
  const handleGroupChange = useCallback((groupNames: string[]) => {
    // Set the selected group for the UI
    if (groupNames.length > 0) {
      const newSelectedGroup = groupNames[0];
      // Only update state if the group actually changed
      setSelectedGroup(prevSelectedGroup => {
        if (prevSelectedGroup !== newSelectedGroup) {
          console.log(`Group changed from ${prevSelectedGroup} to ${newSelectedGroup}`);
          return newSelectedGroup;
        }
        return prevSelectedGroup;
      });
    }

    // Set active groups in the backend
    window.electron.ipcRenderer.invoke('set-active-cue-groups', groupNames)
      .then(result => {
        if (!result.success) {
          console.error('Failed to set active group:', result.error);
        }
      })
      .catch(err => {
        console.error('Error setting active group:', err);
      });
  }, [setSelectedGroup]); // Dependency: setSelectedGroup (stable)

  return (
    <div className="p-6 w-full mx-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200">
      <h1 className="text-2xl font-bold mb-4">DMX Preview</h1>

      <DmxSettingsAccordion startOpen={true} />

      <hr className="my-6" />
      
      <p className="text-md text-gray-700 dark:text-gray-300 mt-4">
        The DMX Preview allows you to see what your lighting rig should be doing. The preview uses the actual DMX channel data being  
        <em> sent</em> by Photonics as it responds to YARG/RB3E input or manual tests below. 
       
        This is useful for debugging/testing your setup.
      </p>
      <p className="text-md text-gray-700 dark:text-gray-300 mt-4">
        It does not monitor for sACN/ArtNet data on the network.
      </p>

      <hr className="my-6" />

      <p className="text-md text-gray-700 dark:text-gray-300 mt-4">
        Testing a cue will give you an approximation of what it will look like in-game. Some effects require you to 
        manually simulate a beat or keyframe. If an effect uses a song's BPM value, the simulation will assume 120 BPM. 
        For YARG, some effects are modified by run-time data such as the notes being played. This is not currently simulated.
      </p>
      <p className="text-md text-gray-700 dark:text-gray-300 mt-4">
        If you have DMX output enabled above the effect will be sent to your lighting rig. Compare this 
        with the DMX Preview to confirm the configuration of your lights is correct.
      </p>

      <hr className="my-6" />

      <div className="my-6">
        <h2 className="text-xl font-bold mb-4">Cue Selection</h2>
        <CueRegistrySelector 
          onRegistryChange={handleRegistryChange}
          onGroupChange={handleGroupChange}
          useActiveGroupsOnly={true}
        />
        
        {currentGroup && (
          <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            <strong>Group Description:</strong> {currentGroup.description}
          </div>
        )}
      </div>

      <div className="flex items-center mt-4 flex-wrap gap-4">
        <EffectsDropdown 
          onSelect={(effect) => setSelectedEffect(effect)} 
          groupName={selectedGroup}
          value={selectedEffect?.id}
        />
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleTestEffect}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            disabled={!selectedEffect}
          >
            Start Test Effect
          </button>
          <button
            onClick={handleStopTestEffect}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            Stop Test Effect
          </button>
          <button
            onClick={handleSimulateBeat}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            Simulate Beat
          </button>
          <button
            onClick={handleSimulateMeasure}
            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
          >
            Simulate Measure
          </button>
          <button
            onClick={handleSimulateKeyframe}
            className="px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600"
          >
            Simulate Keyframe
          </button>
        </div>
      </div>
  
      <hr className="my-6" />
     
      <CuePreview 
        className="mb-6"
        showBeatIndicator={showBeatIndicator}
        showMeasureIndicator={showMeasureIndicator}
        showKeyframeIndicator={showKeyframeIndicator}
        manualBeatType="Manual Beat"
        manualMeasureType="Manual Measure"
        manualKeyframeType="Manual Keyframe"
      />

      <LightsDmxPreview lightingConfig={lightingConfig!} dmxValues={dmxValues} />
      <LightsDmxChannelsPreview lightingConfig={lightingConfig!} dmxValues={dmxValues} />
    </div>
  );
};

export default DmxPreview;