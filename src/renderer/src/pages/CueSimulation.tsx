import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAtom } from 'jotai';
import { senderIpcEnabledAtom, activeDmxLightsConfigAtom } from '@renderer/atoms';
import { EffectSelector, DmxChannel } from '../../../photonics-dmx/types';
import EffectsDropdown from '../components/EffectSelector';
import DmxSettingsAccordion from '@renderer/components/PhotonicsInputOutputToggles';
import CuePreviewYarg from '@renderer/components/CuePreviewYarg';
import LightsDmxPreview from '@renderer/components/LightsDmxPreview';
import LightsDmxChannelsPreview from '@renderer/components/LightsDmxChannelsPreview';
import { useTimeoutEffect } from '../utils/useTimeout';
import CueRegistrySelector from '@renderer/components/CueRegistrySelector';
import { FaChevronCircleDown, FaChevronCircleRight } from 'react-icons/fa';
import ActiveGroupsSelector, { ActiveGroupsSelectorRef } from '../components/ActiveCueGroupsSelector';
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers';

type CueRegistryType = 'YARG' | 'RB3E';

type CueGroup = {
  id: string;
  name: string;
  description: string;
  cueTypes: string[];
};

const CueSimulation: React.FC = () => {
  const [_isIpcEnabled, setIsIpcEnabled] = useAtom(senderIpcEnabledAtom);
  const [lightingConfig] = useAtom(activeDmxLightsConfigAtom);
  const [selectedEffect, setSelectedEffect] = useState<EffectSelector | null>(null);
  const [, setRegistryType] = useState<CueRegistryType>('YARG');
  const [selectedGroup, setSelectedGroup] = useState<string>('default');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('default');
  const [currentGroup, setCurrentGroup] = useState<CueGroup | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [dmxValues, setDmxValues] = useState<Record<number, number>>({});
  
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

  const activeGroupsSelectorRef = useRef<ActiveGroupsSelectorRef>(null);

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

  // Cleanup effect: stop any running test effects when component unmounts
  useEffect(() => {
    return () => {
      // Stop any running test effects when leaving the page
      window.electron.ipcRenderer.invoke('stop-test-effect').catch(error => {
        console.error('Error stopping test effect on unmount:', error);
      });
    };
  }, []);

  // Track initialization phases to avoid overriding active groups during startup
  const isInitialMount = useRef(true);
  const isFullyInitialized = useRef(false);

  // Helper function to ensure active group matches the selected group when user interacts with effects
  const ensureActiveGroupMatches = useCallback(async () => {
    if (selectedGroupId && isFullyInitialized.current) {
      try {
        const result = await window.electron.ipcRenderer.invoke('set-active-cue-groups', [selectedGroupId]);
        if (result.success) {
          activeGroupsSelectorRef.current?.refreshActiveGroups();
          console.log(`Set active group to match selected group: ${selectedGroupId}`);
        } else {
          console.error('Failed to set active group to match selection:', result.error);
        }
      } catch (error) {
        console.error('Error setting active group to match selection:', error);
      }
    }
  }, [selectedGroupId]);

  const handleEffectSelect = useCallback(async (effect: EffectSelector) => {
    setSelectedEffect(effect);
    // When user selects an effect, ensure the active group matches the selected group
    await ensureActiveGroupMatches();
  }, [ensureActiveGroupMatches]);

  const handleTestEffect = async () => {
    if (!selectedEffect) {
      console.log('No effect selected');
      return;
    }

    // Ensure the active group matches the selected group when testing an effect
    await ensureActiveGroupMatches();

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
  const handleGroupChange = useCallback(async (groupIds: string[]) => {
    // Handle both "All" selection (multiple groups) and single group selection
    if (groupIds.length > 0) {
      // Get group details to determine display name
      let displayName: string;
      
      if (groupIds.length > 1) {
        displayName = 'All';
        setSelectedGroupId('default'); // Use default group for "All" mode
        setSelectedEffect(null); // Clear selected effect immediately when group changes
      } else {
        // Single group - need to get the group name for display
        const groupId = groupIds[0];
        setSelectedGroupId(groupId); // Store the actual group ID
        setSelectedEffect(null); // Clear selected effect immediately when group changes
        try {
          const allGroups = await window.electron.ipcRenderer.invoke('get-cue-groups');
          const group = allGroups.find((g: CueGroup) => g.id === groupId);
          displayName = group ? group.name : groupId;
        } catch (error) {
          console.error('Error fetching group details:', error);
          displayName = groupId;
        }
      }
      
      // Only update state if the selection actually changed
      setSelectedGroup(prevSelectedGroup => {
        if (prevSelectedGroup !== displayName) {
          console.log(`Preview group changed from ${prevSelectedGroup} to ${displayName}`);
          
          // Don't override active groups during initial mount - let the startup registration stand
          if (!isInitialMount.current) {
            // Set the selected group IDs as active for DMX preview
            window.electron.ipcRenderer.invoke('set-active-cue-groups', groupIds)
              .then(result => {
                if (result.success) {
                  // Directly refresh the ActiveGroupsSelector to reflect the change
                  activeGroupsSelectorRef.current?.refreshActiveGroups();
                } else {
                  console.error('Failed to set active groups for preview:', result.error);
                }
              })
              .catch(err => {
                console.error('Error setting active groups for preview:', err);
              });
            
            // Mark as fully initialized after first user-initiated group change
            isFullyInitialized.current = true;
          } else {
            console.log('Skipping active group override during initial mount');
            isInitialMount.current = false;
          }
          
          return displayName;
        }
        return prevSelectedGroup;
      });
    }
  }, [setSelectedGroup]);

  // Fetch current group info when selected group changes
  useEffect(() => {
    const fetchGroupInfo = async () => {
      try {
        if (selectedGroup === 'All') {
          // For "All" selection, show a synthetic group description
          setCurrentGroup({
            id: 'all',
            name: 'All',
            description: 'All enabled cue groups are active',
            cueTypes: []
          });
          
          // For effects dropdown, use the default group's effects
          try {
            const availableEffects = await window.electron.ipcRenderer.invoke('get-available-cues', 'default');
            
            // If there are effects available, select the first one automatically
            if (availableEffects && availableEffects.length > 0) {
              const firstEffect = availableEffects[0];
              const effect = {
                id: firstEffect.id,
                yargDescription: firstEffect.yargDescription,
                rb3Description: firstEffect.rb3Description,
                groupName: firstEffect.groupName
              };
              setSelectedEffect(effect);
              console.log(`Auto-selected first effect: ${firstEffect.id} from default group (All mode)`);
            }
          } catch (error) {
            console.error('Error fetching available effects for All mode:', error);
          }
        } else {
          // Single group selection
          const groups = await window.electron.ipcRenderer.invoke('get-cue-groups');
          const group = groups.find((g: CueGroup) => g.id === selectedGroup);
          if (group) {
            setCurrentGroup(group);
            
            // Fetch available effects for the specific group using group ID
            try {
              const availableEffects = await window.electron.ipcRenderer.invoke('get-available-cues', selectedGroup);
              
              // If there are effects available, select the first one automatically
              if (availableEffects && availableEffects.length > 0) {
                const firstEffect = availableEffects[0];
                const effect = {
                  id: firstEffect.id,
                  yargDescription: firstEffect.yargDescription,
                  rb3Description: firstEffect.rb3Description,
                  groupName: firstEffect.groupName
                };
                setSelectedEffect(effect);
                console.log(`Auto-selected first effect: ${firstEffect.id} from group ${group.name} (ID: ${selectedGroup})`);
              }
            } catch (error) {
              console.error('Error fetching available effects for group:', error);
            }
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

  return (
    <div className="p-6 w-full mx-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200">
      <h1 className="text-2xl font-bold mb-4">Cue Simulation</h1>

      {/* Photonics input/output toggle component as the first thing */}
      <DmxSettingsAccordion startOpen={true} />

      <hr className="my-6" />

      {/* Active Cue Groups */}
      <ActiveGroupsSelector ref={activeGroupsSelectorRef} className="mb-6" />

      <div className="bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 mb-6">
        <button
          className="w-full px-4 py-3 text-left font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded-t-lg flex items-center justify-between"
          onClick={() => setIsAboutOpen(!isAboutOpen)}
        >
          <span>Using Cue Simulation</span>
          {isAboutOpen ? <FaChevronCircleDown size={20} /> : <FaChevronCircleRight size={20} />}
        </button>
        <div className={`px-4 pb-4 ${isAboutOpen ? '' : 'hidden'}`}>
          <p className="text-md text-gray-700 dark:text-gray-300 mt-4">
            Cue Simulation allows you to test and preview lighting effects before using them in-game. 
            You can select different cue groups, choose specific effects, and manually simulate beats, 
            measures, and keyframes to see how the effects respond.
          </p>
          <p className="text-md text-gray-700 dark:text-gray-300 mt-4">
            Which cue groups are enabled is defined in the Preferences menu.
          </p>
          <p className="text-md text-gray-700 dark:text-gray-300 mt-4">
            Active groups are a subset of enabled groups. Only cues in the active groups will be used in-game.
          </p>
          <p className="text-md text-gray-700 dark:text-gray-300 mt-4">
            By default all enabled groups are active. Here you can select which groups are active, allowing you to 
            isolate specific groups or cues for testing at runtime. The active toggles are not saved between sessions.
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
        </div>
      </div>
     
      <div className="my-6">
        <h2 className="text-xl font-bold mb-1">Effect Selection</h2>
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div>
            <CueRegistrySelector 
              onRegistryChange={handleRegistryChange}
              onGroupChange={handleGroupChange}
            />
          </div>
          <div className="lg:w-64">
            <EffectsDropdown 
              onSelect={handleEffectSelect}
              groupId={selectedGroupId}
              value={selectedEffect?.id}
            />
          </div>
        </div>
        
        {currentGroup && (
          <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            <strong>Group Description:</strong> {currentGroup.description}
          </div>
        )}
        
        {selectedEffect && selectedEffect.yargDescription && 
         selectedEffect.yargDescription !== "No description available" && (
          <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            <strong>Effect Description:</strong> {selectedEffect.yargDescription}
          </div>
        )}
      </div>

      <div className="flex items-center mt-4 flex-wrap gap-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleTestEffect}
            className={`px-4 py-2 rounded ${
              !selectedEffect 
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
            disabled={!selectedEffect}
          >
            Start Test Effect
          </button>
          <button
            onClick={handleStopTestEffect}
            className={`px-4 py-2 rounded ${
              !selectedEffect 
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                : 'bg-orange-500 text-white hover:bg-orange-600'
            }`}
            disabled={!selectedEffect}
          >
            Stop Test Effect
          </button>
          <button
            onClick={handleSimulateBeat}
            className={`px-4 py-2 rounded ${
              !selectedEffect 
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                : 'bg-purple-500 text-white hover:bg-purple-600'
            }`}
            disabled={!selectedEffect}
          >
            Simulate Beat
          </button>
          <button
            onClick={handleSimulateMeasure}
            className={`px-4 py-2 rounded ${
              !selectedEffect 
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                : 'bg-yellow-500 text-white hover:bg-yellow-600'
            }`}
            disabled={!selectedEffect}
          >
            Simulate Measure
          </button>
          <button
            onClick={handleSimulateKeyframe}
            className={`px-4 py-2 rounded ${
              !selectedEffect 
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                : 'bg-emerald-500 text-white hover:bg-emerald-600'
            }`}
            disabled={!selectedEffect}
          >
            Simulate Keyframe
          </button>
        </div>
      </div>
  
      <hr className="my-6" />

      <CuePreviewYarg 
        className="mb-0"
        showBeatIndicator={showBeatIndicator}
        showMeasureIndicator={showMeasureIndicator}
        showKeyframeIndicator={showKeyframeIndicator}
        manualBeatType="Manual Beat"
        manualMeasureType="Manual Measure"
        manualKeyframeType="Manual Keyframe"
        simulationMode={true}
      />

      <hr className="my-6" />

      <LightsDmxPreview lightingConfig={lightingConfig!} dmxValues={dmxValues} />
      <LightsDmxChannelsPreview lightingConfig={lightingConfig!} dmxValues={dmxValues} />
    </div>
  );
};

export default CueSimulation;
