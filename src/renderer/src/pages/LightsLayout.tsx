import { useState, useMemo, useEffect, useCallback } from 'react';
import LightLayoutPreview from '../components/LightLayoutPreview';
import LightChannelsConfig from '../components/LightChannelsConfig';
import { useAtom } from 'jotai';

import {
    ConfigLightLayoutType,
    ConfigStrobeType,
    DmxLight,
    FixtureTypes
} from '../../../photonics-dmx/types';
import { castToChannelType } from '../../../photonics-dmx/helpers/dmxHelpers';
import { v4 as uuidv4 } from 'uuid';
import { activeDmxLightsConfigAtom, myValidDmxLightsAtom, myDmxLightsAtom } from '@renderer/atoms';

const LIGHT_LAYOUTS: ConfigLightLayoutType[] = [
    { id: 'front', label: 'Front' },
    { id: 'front-back', label: 'Front and Back' },
];

const LIGHT_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Handles the light layout and chanel configuration.
 * TODO: there is far too much going on in this one component...!
 * @returns React component
 */
const LightsLayout = () => {
    const [activeConfig, setActiveLightsConfig] = useAtom(activeDmxLightsConfigAtom);
    const [myFixtures] = useAtom(myValidDmxLightsAtom);
    const [myFixtureLibrary] = useAtom(myDmxLightsAtom);
   
    const [selectedCount, setSelectedCount] = useState<number | null>(() => {
        if (activeConfig?.numLights === 0) return null;
        return activeConfig?.numLights || 4;
    });
    const [selectedLayout, setSelectedLayout] = useState<string>(() => activeConfig?.lightLayout.id || 'front');

    const initialAssignedToBack = useMemo(() => {
        if (activeConfig?.lightLayout.id === 'front-back') {
            return activeConfig.backLights.length > 0 ? activeConfig.backLights.length : 'None';
        }
        return 'None';
    }, [activeConfig]);

    const [assignedToBack, setAssignedToBack] = useState<number | 'None'>(initialAssignedToBack);
    const [selectedStrobe, setSelectedStrobe] = useState<ConfigStrobeType>(
        () => activeConfig?.strobeType || ConfigStrobeType.None
    );

    // Dedicated Strobe Count (0 if strobe effects is not Dedicated)
    const [dedicatedStrobeCount, setDedicatedStrobeCount] = useState<number>(0);

    const [highlightedLight, setHighlightedLight] = useState<number | null>(null);
    const [showSuccessMessage, setShowSuccessMessage] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);



    //  Single Array for All Primary Lights
    const [allPrimaryLights, setAllPrimaryLights] = useState<DmxLight[]>(() => {
        const front = activeConfig?.frontLights || [];
        const back  = activeConfig?.backLights || [];
        // Mark each as front/back
        const merged = [
            ...front.map((l) => ({ ...l, group: 'front' as const })),
            ...back.map((l) => ({ ...l, group: 'back'  as const })),
        ];
        return merged;
    });



    //  Available Layouts
    const availableLayouts = useMemo(() => {
        return LIGHT_LAYOUTS.filter((layout) => {
            if (layout.id === 'front') return true;
            if (layout.id === 'front-back') return (selectedCount || 0) >= 2;
            return false;
        });
    }, [selectedCount]);



    //  Helper to Split Front and Back Counts
    const splitLights = (count: number, assignedBack: number | 'None') => {
        if (assignedBack === 'None' || assignedBack === 0) {
            return { frontCount: count, backCount: 0 };
        }
        const frontCount = count - assignedBack;
        const backCount = assignedBack;
        return { frontCount, backCount };
    };




    //  Create a New Light Instance
    const createLightInstance = useCallback((group: 'front' | 'back' | 'strobe') => {
        const totalExisting = allPrimaryLights.length;
        const templateIndex = totalExisting % myFixtures.length;
        const selectedFixture = myFixtures[templateIndex];

        // Calculate the new master dimmer channel
        const newMasterDimmer = 1 + totalExisting * 10;
        
        // Calculate channel offsets from the template
        const templateChannels = selectedFixture.channels;
        const offsets: { [key: string]: number } = {};
        Object.entries(templateChannels).forEach(([channelName, value]) => {
            if (channelName !== 'masterDimmer') {
                offsets[channelName] = value - templateChannels.masterDimmer;
            }
        });

        // Recalculate all channels using the new master dimmer and template offsets
        const recalculatedChannels: { [key: string]: number } = {};
        Object.entries(templateChannels).forEach(([channelName, _]) => {
            if (channelName === 'masterDimmer') {
                recalculatedChannels[channelName] = newMasterDimmer;
            } else {
                recalculatedChannels[channelName] = newMasterDimmer + (offsets[channelName] || 0);
            }
        });

        // Cast the channels to the correct type based on the fixture
        const castChannels = castToChannelType(selectedFixture.fixture, recalculatedChannels);

        return {
            id: uuidv4(),
            fixtureId: selectedFixture.id!,
            position: totalExisting + 1,
            fixture: selectedFixture.fixture,
            label: selectedFixture.label,
            name: selectedFixture.name,
            isStrobeEnabled: selectedFixture.isStrobeEnabled,
            group,
            channels: castChannels,
            config: selectedFixture.config || undefined, // Include config if present (e.g. MH lights)
            universe: selectedFixture.universe,
        };
    },
    [allPrimaryLights.length, myFixtures]
);




    useEffect(() => {
        setAllPrimaryLights((prev) => {
          // Separate non-strobe lights and strobe lights.
          const nonStrobeLights = prev.filter((l) => l.group !== 'strobe');
          const strobeLights = prev.filter((l) => l.group === 'strobe');
      
          let updated = [...nonStrobeLights];
          if (updated.length === 0) {
            // If no non-strobe lights are assigned, create them using the first fixture.
            if (myFixtures.length > 0 && selectedCount) {
              const firstFixture = myFixtures[0];
              for (let i = 0; i < selectedCount; i++) {
                // Calculate the new master dimmer channel
                const newMasterDimmer = 1 + i * 10;
                
                // Calculate channel offsets from the template
                const templateChannels = firstFixture.channels;
                const offsets: { [key: string]: number } = {};
                Object.entries(templateChannels).forEach(([channelName, value]) => {
                    if (channelName !== 'masterDimmer') {
                        offsets[channelName] = value - templateChannels.masterDimmer;
                    }
                });

                // Recalculate all channels using the new master dimmer and template offsets
                const recalculatedChannels: { [key: string]: number } = {};
                Object.entries(templateChannels).forEach(([channelName, _]) => {
                    if (channelName === 'masterDimmer') {
                        recalculatedChannels[channelName] = newMasterDimmer;
                    } else {
                        recalculatedChannels[channelName] = newMasterDimmer + (offsets[channelName] || 0);
                    }
                });

                // Cast the channels to the correct type based on the fixture
                const castChannels = castToChannelType(firstFixture.fixture, recalculatedChannels);

                updated.push({
                  id: uuidv4(),
                  fixtureId: firstFixture.id!,
                  position: i + 1,
                  fixture: firstFixture.fixture,
                  label: firstFixture.label,
                  name: firstFixture.name,
                  isStrobeEnabled: firstFixture.isStrobeEnabled,
                  group: 'front',
                  channels: castChannels,
                  config: firstFixture.config || undefined,
                  universe: firstFixture.universe,
                });
              }
            }
          } else {
            // Adjust the count only for non-strobe lights.
            if (selectedCount) {
              while (updated.length < selectedCount) {
                updated.push(createLightInstance('front'));
              }
              while (updated.length > selectedCount) {
                updated.pop();
              }
            }
          }
          // Recombine the non-strobe lights with the dedicated strobe lights.
          return [...updated, ...strobeLights];
        });
      }, [selectedCount, createLightInstance, myFixtures]);




    //  Front/Back Assignment
    useEffect(() => {
      const { frontCount, backCount } = splitLights(selectedCount || 0, assignedToBack);
    
      setAllPrimaryLights((prev) => {
        // Separate non-strobe lights from dedicated strobe lights.
        const nonStrobeLights = prev.filter((l) => l.group !== 'strobe');
        const strobeLights = prev.filter((l) => l.group === 'strobe');
    
        // Sort non-strobe lights by their current position.
        const sorted = [...nonStrobeLights].sort((a, b) => a.position - b.position);
    
        let fCount = frontCount;
        let bCount = backCount;
    
        sorted.forEach((light, idx) => {
          if (fCount > 0) {
            light.group = 'front';
            fCount--;
          } else if (bCount > 0) {
            light.group = 'back';
            bCount--;
          } else {
            // Fallback, though this situation should not occur.
            light.group = 'front';
          }
          // Reassign position among non-strobe lights only.
          light.position = idx + 1;
        });
    
        // Return non-strobe lights with their new positions plus the dedicated strobe lights untouched.
        return [...sorted, ...strobeLights];
      });
    }, [assignedToBack, selectedLayout, selectedCount]);



    // Strobe Logic for non-Dedicated lights
    useEffect(() => {
        // If strobe is disabled => turn off strobeMode for non-strobe fixtures
        if (selectedStrobe === ConfigStrobeType.None) {
            setAllPrimaryLights((prev) =>
                prev.map((l) =>
                    l.fixture === FixtureTypes.STROBE
                        ? l
                        : { ...l, strobeMode: 'disabled' }
                )
            );
        }
        // For AllCapable, we don’t create a separate strobe group, 
    }, [selectedStrobe]);



    // Handle Dedicated Strobe (using dedicatedStrobeCount)
    useEffect(() => {
        if (selectedStrobe !== ConfigStrobeType.Dedicated) {
            return;
        }

        setAllPrimaryLights((prev) => {
            let updated = [...prev];

            // Count current dedicated strobe lights
            const currentStrobes = updated.filter(
                (l) => l.group === 'strobe' && l.fixture === FixtureTypes.STROBE
            );
            const currentCount = currentStrobes.length;

            if (currentCount < dedicatedStrobeCount) {
                // Add the missing strobe lights
                const numToAdd = dedicatedStrobeCount - currentCount;
                for (let i = 0; i < numToAdd; i++) {
                    const newStrobe = createLightInstance('strobe');
                    newStrobe.fixture = FixtureTypes.STROBE;
                    newStrobe.isStrobeEnabled = true;
                    newStrobe.group = 'strobe';
                    newStrobe.position = updated.length + 1;
                    updated.push(newStrobe);
                }
            } else if (currentCount > dedicatedStrobeCount) {
                // Remove extra strobe lights
                let toRemove = currentCount - dedicatedStrobeCount;
                updated = updated.filter((light) => {
                    if (
                        light.group === 'strobe' &&
                        light.fixture === FixtureTypes.STROBE &&
                        toRemove > 0
                    ) {
                        toRemove--;
                        return false;
                    }
                    return true;
                });
            }

            // Ensure all strobe lights have proper properties
            updated.forEach((light) => {
                if (light.group === 'strobe') {
                    light.fixture = FixtureTypes.STROBE;
                    light.isStrobeEnabled = true;
                }
            });

            return updated;
        });
    }, [selectedStrobe, dedicatedStrobeCount, createLightInstance]);



    // Validate selectedLayout
    useEffect(() => {
        const isLayoutAvailable = availableLayouts.some((layout) => layout.id === selectedLayout);
        if (!isLayoutAvailable) {
            setSelectedLayout('front');
            setAssignedToBack('None');
        }
    }, [availableLayouts, selectedLayout]);

   
   
    // Initialize from activeConfig
    useEffect(() => {
        if (isInitializing && activeConfig) {
            setSelectedCount(activeConfig.numLights);
            setSelectedLayout(activeConfig.lightLayout.id);
            setSelectedStrobe(activeConfig.strobeType);

            if (activeConfig.lightLayout.id === 'front-back') {
                setAssignedToBack(
                    activeConfig.backLights.length > 0 ? activeConfig.backLights.length : 'None'
                );
            } else {
                setAssignedToBack('None');
            }
            // Set dedicated strobe count from activeConfig (if applicable)
            if (activeConfig.strobeType === ConfigStrobeType.Dedicated) {
                setDedicatedStrobeCount(
                    activeConfig.strobeLights && activeConfig.strobeLights.length > 0
                        ? activeConfig.strobeLights.length
                        : 1
                );
            } else {
                setDedicatedStrobeCount(0);
            }
            setIsInitializing(false);
        }
    }, [activeConfig, isInitializing]);



    // Memos for Front and Back Columns
    const frontLights = useMemo(() => {
        return allPrimaryLights.filter((l) => l.group === 'front');
    }, [allPrimaryLights]);

    const backLights = useMemo(() => {
        return allPrimaryLights.filter((l) => l.group === 'back');
    }, [allPrimaryLights]);

    // Memo Check for Physical Strobe Fixtures in Source Lights
    const hasPhysicalStrobe = useMemo(() => {
        return true; 
    }, [myFixtures]);



    //  Handlers for Updating Lights
    const handleLightChange = (updatedLight: DmxLight) => {
        setAllPrimaryLights((prev) =>
            prev.map((l) => (l.id === updatedLight.id ? { ...updatedLight } : l))
        );
    };

    const handleLightClick = (lightPosition: number) => {
        setHighlightedLight(lightPosition);
    };


    // Save Logic
    /**
     * This helper ensures that if the same original light appears in multiple arrays
     * (e.g., frontLights + strobeLights), it keeps the same ID.
     */
    const mapLightsToNewIds = (lights: DmxLight[], idMap: Record<string, string>) => {
        return lights.map((light) => {
          // Fallback to a placeholder if the light’s ID is null/undefined (first use)
          const originalId = light.id ??  uuidv4();
      
          if (!idMap[originalId]) {
            idMap[originalId] = uuidv4();
          }
      
          return { 
            ...light, 
            id: idMap[originalId] 
          };
        });
      };




    const handleSaveChanges = () => {
        // Decide final strobe set based on the strobe mode
        let finalStrobe: DmxLight[] = [];

        if (selectedStrobe === ConfigStrobeType.AllCapable) {
            // All primary lights that are strobe-enabled
            finalStrobe = allPrimaryLights.filter(
                (l) => l.isStrobeEnabled && l.group !== 'strobe'
            );
        } else if (selectedStrobe === ConfigStrobeType.Dedicated) {
            // Only dedicated strobe group
            finalStrobe = allPrimaryLights.filter((l) => l.group === 'strobe');
        }
        // If "None", finalStrobe remains empty

        const finalFront = allPrimaryLights.filter((l) => l.group === 'front');
        const finalBack  = allPrimaryLights.filter((l) => l.group === 'back');

        const idMap: Record<string, string> = {};

        const frontWithNewIds   = mapLightsToNewIds(finalFront, idMap);
        const backWithNewIds    = mapLightsToNewIds(finalBack, idMap);
        const strobeWithNewIds  = mapLightsToNewIds(finalStrobe, idMap);

        setActiveLightsConfig({
            numLights: selectedCount || 0,
            lightLayout:
                availableLayouts.find((layout) => layout.id === selectedLayout) ||
                LIGHT_LAYOUTS[0],
            strobeType: selectedStrobe,
            frontLights: frontWithNewIds,
            backLights: backWithNewIds,
            strobeLights: strobeWithNewIds,
        });

        setShowSuccessMessage(true);
        setTimeout(() => setShowSuccessMessage(false), 3000);
    };

    // Build Dropdown Options for Assigned to Back
    const assignedToBackOptions = useMemo(() => {
        const opts = [{ value: 'None', label: 'None' }];
        for (let i = 1; i < (selectedCount || 0); i++) {
            opts.push({ value: i.toString(), label: `${i} Light${i > 1 ? 's' : ''}` });
        }
        return opts;
    }, [selectedCount]);

    const { frontCount, backCount } = splitLights(selectedCount || 0, assignedToBack);

   
   
   
    return (
        <div className="p-6 w-full mx-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200">
            <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Lights Layout</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                The Lights Layout allows you to assign the lights you created in My Lights to specific
                lighting fixture positions and to configure their DMX channels.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                The Master Dimmer channel acts like the light's index, and all other channels will be
                calculated for you automatically.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                E.g. If you defined your light as MasterDimmer=1, Red=2, Green=3, Blue=4 and here you set
                Front 1 Master Dimmer to 11, your R/G/B channels automatically become 12/13/14.
            </p>

            {/* Check if any lights are configured at all */}
            {myFixtureLibrary.length === 0 ? (
                <div className="mt-8 text-center text-lg font-semibold text-red-600">
                    You need to configure some lights first.
                </div>
            ) : myFixtures.length === 0 ? (
                <div className="mt-8 text-center text-lg font-semibold text-orange-600">
                    You have configured lights, but they need valid channel assignments. <br/>Please go to My Lights and assign channel values greater than 0 to all channels for your lights.
                </div>
            ) : (
                <>
                    <form className="space-y-6 max-w-full">
                        <div className="flex flex-wrap gap-4">
                            {/* Number of Lights */}
                            <label className="flex flex-col items-start flex-1 min-w-[200px]">
                                <span className="mb-2 text-gray-700 dark:text-gray-300">Number of Primary Lights</span>
                                <select
                                    value={selectedCount || ''}
                                    onChange={(e) => {
                                        const newCount = e.target.value ? Number(e.target.value) : null;
                                        setSelectedCount(newCount);
                                        if (newCount && assignedToBack !== 'None' && assignedToBack >= newCount) {
                                            setAssignedToBack('None');
                                        }
                                    }}
                                    className="p-2 border border-gray-300 dark:border-gray-700 rounded w-full text-black dark:text-white dark:bg-gray-700"
                                >
                                    {!selectedCount && <option value="">Select</option>}
                                    {LIGHT_COUNT_OPTIONS.map((cnt) => (
                                        <option key={cnt} value={cnt}>
                                            {cnt} Light{cnt > 1 ? 's' : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            {/* Light Layout */}
                            <label className="flex flex-col items-start flex-1 min-w-[200px]">
                                <span className="mb-2 text-gray-700 dark:text-gray-300">Primary Light Layout</span>
                                <select
                                    value={selectedLayout}
                                    onChange={(e) => {
                                        setSelectedLayout(e.target.value);
                                        if (e.target.value !== 'front-back') {
                                            setAssignedToBack('None');
                                        } else {
                                            // If switching to 'front-back', reflect how many are currently group='back'
                                            const existingBackCount = allPrimaryLights.filter(
                                                (l) => l.group === 'back'
                                            ).length;
                                            setAssignedToBack(existingBackCount || 'None');
                                        }
                                    }}
                                    className="p-2 border border-gray-300 dark:border-gray-700 rounded w-full text-black dark:text-white dark:bg-gray-700"
                                >
                                    {availableLayouts.map((layout) => (
                                        <option key={layout.id} value={layout.id}>
                                            {layout.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            {/* Assigned to Back */}
                            {selectedLayout === 'front-back' && (
                                <label className="flex flex-col items-start flex-1 min-w-[200px]">
                                    <span className="mb-2 text-gray-700 dark:text-gray-300">Assigned to Back</span>
                                    <select
                                        value={assignedToBack}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setAssignedToBack(val === 'None' ? 'None' : Number(val));
                                        }}
                                        className="p-2 border border-gray-300 dark:border-gray-700 rounded w-full text-black dark:text-white dark:bg-gray-700"
                                    >
                                        {assignedToBackOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}

                            {/* Strobe Effects */}
                            <label className="flex flex-col items-start flex-1 min-w-[200px]">
                                <span className="mb-2 text-gray-700 dark:text-gray-300">Strobe Effects</span>
                                <select
                                    value={selectedStrobe}
                                    onChange={(e) => {
                                        const value = e.target.value as ConfigStrobeType;
                                        setSelectedStrobe(value);
                                        if (value === ConfigStrobeType.Dedicated) {
                                            // Default to 1 if switching to dedicated and no count exists
                                            setDedicatedStrobeCount((prev) => (prev === 0 ? 1 : prev));
                                        } else {
                                            setDedicatedStrobeCount(0);
                                        }
                                    }}
                                    className="p-2 border border-gray-300 dark:border-gray-700 rounded w-full text-black dark:text-white dark:bg-gray-700"
                                >
                                    <option value={ConfigStrobeType.None}>None</option>
                                    {/* Show Dedicated Strobe only if we have at least one physical strobe fixture */}
                                    {hasPhysicalStrobe && (
                                        <option value={ConfigStrobeType.Dedicated}>Dedicated Strobe Lights</option>
                                    )}
                                    <option value={ConfigStrobeType.AllCapable}>Strobe Enabled Lights</option>
                                </select>
                            </label>

                            {/* Number of Strobes dropdown (only for Dedicated Strobe) */}
                            {selectedStrobe === ConfigStrobeType.Dedicated && (
                                <label className="flex flex-col items-start flex-1 min-w-[200px]">
                                    <span className="mb-2 text-gray-700 dark:text-gray-300">Number of Strobes</span>
                                    <select
                                        value={dedicatedStrobeCount}
                                        onChange={(e) => setDedicatedStrobeCount(Number(e.target.value))}
                                        className="p-2 border border-gray-300 dark:border-gray-700 rounded w-full text-black dark:text-white dark:bg-gray-700"
                                    >
                                        {[1, 2, 3, 4].map((num) => (
                                            <option key={num} value={num}>
                                                {num}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                        </div>
                    </form>

                    {/* Light Layout Preview */}
                    <LightLayoutPreview
                        frontCount={frontCount}
                        backCount={backCount}
                        highlightedLight={highlightedLight}
                        selectedStrobe={selectedStrobe}
                    />

                    {/* Light Channels Configuration */}
                    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Front Lights */}
                        {frontLights.map((light, index) => (
                            <div key={light.id} className="flex flex-col">
                                <div className="text-center mb-2 font-semibold text-gray-800 dark:text-gray-200">
                                    Front {index + 1} (Position {light.position})
                                </div>
                                <LightChannelsConfig
                                    light={light}
                                    myLights={myFixtures}
                                    onChange={handleLightChange}
                                    isHighlighted={highlightedLight === light.position}
                                    onClick={() => handleLightClick(light.position)}
                                />
                            </div>
                        ))}

                        {/* Back Lights */}
                        {selectedLayout === 'front-back' &&
                            backLights.map((light, index) => (
                                <div key={light.id} className="flex flex-col">
                                    <div className="text-center mb-2 font-semibold text-gray-800 dark:text-gray-200">
                                        Back {index + 1} (Position {light.position})
                                    </div>
                                    <LightChannelsConfig
                                        light={light}
                                        myLights={myFixtures}
                                        onChange={handleLightChange}
                                        isHighlighted={highlightedLight === light.position}
                                        onClick={() => handleLightClick(light.position)}
                                    />
                                </div>
                            ))}

                        {/* Strobe Column: Only show if Dedicated Strobe is selected */}
                        {selectedStrobe === ConfigStrobeType.Dedicated &&
                            allPrimaryLights
                                .filter((l) => l.group === 'strobe')
                                .map((light, _index) => (
                                    <div key={light.id} className="flex flex-col">
                                        <div className="text-center mb-2 font-semibold text-gray-800 dark:text-gray-200">
                                            Dedicated Strobe (Position {light.position})
                                        </div>
                                        <LightChannelsConfig
                                            light={light}
                                            myLights={myFixtures}
                                            onChange={handleLightChange}
                                            isHighlighted={highlightedLight === light.position}
                                            onClick={() => handleLightClick(light.position)}
                                        />
                                    </div>
                                ))}
                    </div>

                    {/* Success Message */}
                    {showSuccessMessage && (
                        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-800 rounded">
                            Changes saved successfully!
                        </div>
                    )}

                    {/* Save Button */}
                    <button
                        onClick={handleSaveChanges}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mt-4 mb-10"
                    >
                        Save Changes
                    </button>
                </>
            )}
        </div>
    );
};

export default LightsLayout;