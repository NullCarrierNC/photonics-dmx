import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useAtom } from 'jotai'
import { senderIpcEnabledAtom, audioListenerEnabledAtom } from '@renderer/atoms'
import { EffectSelector } from '../../../photonics-dmx/types'
import EffectsDropdown from '../components/EffectSelector'
import DmxSettingsAccordion from '@renderer/components/PhotonicsInputOutputToggles'
import CuePreviewYarg from '@renderer/components/CuePreviewYarg'
import CuePreviewAudio from '@renderer/components/CuePreviewAudio'
import LightsDmxPreview from '@renderer/components/LightsDmxPreview'
import LightsDmxChannelsPreview from '@renderer/components/LightsDmxChannelsPreview'
import DmxRigSelector from '@renderer/components/DmxRigSelector'
import { DmxRig, LightingConfiguration } from '../../../photonics-dmx/types'
import { useTimeoutEffect } from '../utils/useTimeout'
import CueRegistrySelector from '@renderer/components/CueRegistrySelector'
import { ActiveGroupsSelectorRef } from '../components/ActiveCueGroupsSelector'
import CueSimulationAbout from './CueSimulation/CueSimulationAbout'
import CueSimulationActions from './CueSimulation/CueSimulationActions'
import CueSimulationInstrument from './CueSimulation/CueSimulationInstrument'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { CONFIG, LIGHT, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { startTestEffect, stopTestEffect } from '../ipcApi'
import AudioCueSelectorPanel from '@renderer/components/AudioCueSelectorPanel'

type CueRegistryType = 'YARG' | 'RB3E'

type CueGroup = {
  id: string
  name: string
  description: string
  cueTypes: string[]
}

const CueSimulation: React.FC = () => {
  const [_isIpcEnabled] = useAtom(senderIpcEnabledAtom)
  const [isAudioReactiveEnabled] = useAtom(audioListenerEnabledAtom)
  const [selectedEffect, setSelectedEffect] = useState<EffectSelector | null>(null)
  const [selectedRegistryType, setSelectedRegistryType] = useState<CueRegistryType>('YARG')
  const [selectedGroup, setSelectedGroup] = useState<string>('Select')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [currentGroup, setCurrentGroup] = useState<CueGroup | null>(null)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  // Store DMX values per universe: Map<universe, Record<channel, value>>
  const [dmxValuesByUniverse, setDmxValuesByUniverse] = useState<
    Map<number, Record<number, number>>
  >(new Map())
  const [selectedRigId, setSelectedRigId] = useState<string | null>(null)
  const [selectedRig, setSelectedRig] = useState<DmxRig | null>(null)
  const [rigConfig, setRigConfig] = useState<LightingConfiguration | null>(null)
  const [selectedVenueSize, setSelectedVenueSize] = useState<'NoVenue' | 'Small' | 'Large'>('Large')
  const [selectedBpm, setSelectedBpm] = useState<number>(120)

  // State for instrument simulation
  const [selectedInstrument, setSelectedInstrument] = useState<
    'guitar' | 'bass' | 'keys' | 'drums'
  >('guitar')

  // State for manual simulation indicators
  const [showBeatIndicator, setShowBeatIndicator] = useState(false)
  const [showMeasureIndicator, setShowMeasureIndicator] = useState(false)
  const [showKeyframeIndicator, setShowKeyframeIndicator] = useState(false)

  // Reset indicators after timeout
  const resetBeatIndicator = useCallback(() => setShowBeatIndicator(false), [])
  const resetMeasureIndicator = useCallback(() => setShowMeasureIndicator(false), [])
  const resetKeyframeIndicator = useCallback(() => setShowKeyframeIndicator(false), [])

  // Set up auto-reset timeouts for indicators
  // The delay is null when indicator is off, and set to 200ms when indicator is turned on
  useTimeoutEffect(resetBeatIndicator, showBeatIndicator ? 200 : null)
  useTimeoutEffect(resetMeasureIndicator, showMeasureIndicator ? 200 : null)
  useTimeoutEffect(resetKeyframeIndicator, showKeyframeIndicator ? 200 : null)

  const activeGroupsSelectorRef = useRef<ActiveGroupsSelectorRef>(null)

  // Track initialization phases to avoid overriding active groups during startup
  const isInitialMount = useRef(true)
  const isFullyInitialized = useRef(false)
  const isSettingActiveGroup = useRef(false)
  const isLoadingFromPrefs = useRef(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasLoadedSavedEffect = useRef(false)
  const savedEffectIdRef = useRef<string | null>(null)

  // Load rig configuration when rig selection changes
  useEffect(() => {
    const loadRigConfig = async () => {
      if (!selectedRigId) {
        setSelectedRig(null)
        setRigConfig(null)
        return
      }

      try {
        const rig: DmxRig = await window.electron.ipcRenderer.invoke(
          CONFIG.GET_DMX_RIG,
          selectedRigId,
        )
        if (rig) {
          setSelectedRig(rig)
          setRigConfig(rig.config)

          // Automatically enable IPC sender for preview functionality when rig is selected
          window.electron.ipcRenderer.send(LIGHT.SENDER_ENABLE, { sender: 'ipc' })
          console.log('IPC sender enabled for preview functionality')
        }
      } catch (error) {
        console.error('Failed to load rig configuration:', error)
        setSelectedRig(null)
        setRigConfig(null)
      }
    }

    loadRigConfig()
  }, [selectedRigId])

  // Listen for IPC messages to receive DMX values with universe information.
  useEffect(() => {
    const handleDmxValues = (
      _: unknown,
      data: { universeBuffer: Record<number, number>; universe: number } | Record<number, number>,
    ) => {
      // Handle both old format (just Record<number, number>) and new format (with universe)
      let universeBuffer: Record<number, number>
      let universe: number

      if (
        'universeBuffer' in data &&
        'universe' in data &&
        typeof data === 'object' &&
        data !== null
      ) {
        // New format with universe
        universeBuffer = data.universeBuffer || {}
        universe = data.universe
      } else {
        // Old format - just the buffer (backward compatibility)
        universeBuffer = data as Record<number, number>
        // Default to universe 1 for old format
        universe = 1
      }

      // Update the universe-specific buffer
      setDmxValuesByUniverse((prev) => {
        const newMap = new Map(prev)
        newMap.set(universe, universeBuffer)
        return newMap
      })
    }
    type DmxPayload =
      | { universeBuffer: Record<number, number>; universe: number }
      | Record<number, number>
    addIpcListener<DmxPayload>(RENDERER_RECEIVE.DMX_VALUES, handleDmxValues)

    return () => {
      removeIpcListener(RENDERER_RECEIVE.DMX_VALUES, handleDmxValues)
    }
  }, []) // Empty deps - we use functional updates for state

  // Get DMX values for the selected rig's universe
  // Handle universe 0 correctly (0 is a valid universe, only default to 1 if undefined/null)
  const rigUniverse =
    selectedRig?.universe !== undefined && selectedRig?.universe !== null ? selectedRig.universe : 1
  const dmxValues = selectedRig !== null ? dmxValuesByUniverse.get(rigUniverse) || {} : {}

  // Cleanup effect: stop any running test effects when component unmounts
  useEffect(() => {
    return () => {
      // Stop any running test effects when leaving the page
      window.electron.ipcRenderer.invoke(LIGHT.STOP_TEST_EFFECT).catch((error) => {
        console.error('Error stopping test effect on unmount:', error)
      })
      // Clear any pending save timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Load saved simulation settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        isLoadingFromPrefs.current = true
        const prefs = await window.electron.ipcRenderer.invoke(CONFIG.GET_PREFS)
        const savedSettings = prefs.simulationSettings

        if (savedSettings) {
          // Load all saved settings
          if (savedSettings.registryType) {
            setSelectedRegistryType(savedSettings.registryType)
          }
          if (savedSettings.venueSize) {
            setSelectedVenueSize(savedSettings.venueSize)
          }
          if (savedSettings.bpm) {
            setSelectedBpm(savedSettings.bpm)
          }
          if (savedSettings.instrument) {
            setSelectedInstrument(savedSettings.instrument)
          }
          if (savedSettings.groupId) {
            // Store saved effect ID for later loading
            if (savedSettings.effectId) {
              savedEffectIdRef.current = savedSettings.effectId
            }
            // Set group ID first, which will trigger group loading
            setSelectedGroupId(savedSettings.groupId)
            // Get group display name
            try {
              const allGroups = await window.electron.ipcRenderer.invoke(LIGHT.GET_CUE_GROUPS)
              const group = allGroups.find((g: CueGroup) => g.id === savedSettings.groupId)
              if (group) {
                setSelectedGroup(group.name)
              }
            } catch (error) {
              console.error('Error fetching group details during load:', error)
            }
          }
        }
      } catch (error) {
        console.error('Error loading simulation settings:', error)
      } finally {
        isLoadingFromPrefs.current = false
      }
    }

    loadSettings()
  }, [])

  // Save simulation settings when they change (debounced)
  const saveSettings = useCallback(() => {
    if (isLoadingFromPrefs.current) {
      return // Don't save during initial load
    }

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Debounce the save operation
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
          simulationSettings: {
            registryType: selectedRegistryType,
            groupId: selectedGroupId,
            effectId: selectedEffect?.id || null,
            venueSize: selectedVenueSize,
            bpm: selectedBpm,
            instrument: selectedInstrument,
          },
        })
      } catch (error) {
        console.error('Error saving simulation settings:', error)
      }
    }, 500) // 500ms debounce
  }, [
    selectedRegistryType,
    selectedGroupId,
    selectedEffect?.id,
    selectedVenueSize,
    selectedBpm,
    selectedInstrument,
  ])

  // Save settings when they change
  useEffect(() => {
    if (!isLoadingFromPrefs.current) {
      saveSettings()
    }
  }, [saveSettings])

  // Load saved effect after group is loaded and effects are available
  useEffect(() => {
    const loadSavedEffect = async () => {
      // Only load if we have a saved effect ID and haven't loaded it yet
      if (!selectedGroupId || !savedEffectIdRef.current || hasLoadedSavedEffect.current) {
        return
      }

      // Wait for effects to be loaded by EffectsDropdown
      const checkForEffects = async (retries = 10) => {
        try {
          const availableEffects = await window.electron.ipcRenderer.invoke(
            LIGHT.GET_AVAILABLE_CUES,
            selectedGroupId,
          )
          if (availableEffects && availableEffects.length > 0) {
            const savedEffect = availableEffects.find(
              (e: EffectSelector) => e.id === savedEffectIdRef.current,
            )
            if (savedEffect) {
              setSelectedEffect(savedEffect)
              hasLoadedSavedEffect.current = true
              savedEffectIdRef.current = null // Clear after loading
            } else {
              // Effect not found in this group, clear it
              hasLoadedSavedEffect.current = true
              savedEffectIdRef.current = null
            }
          } else if (retries > 0) {
            // Effects not loaded yet, retry after a short delay
            setTimeout(() => checkForEffects(retries - 1), 200)
          } else {
            hasLoadedSavedEffect.current = true
            savedEffectIdRef.current = null
          }
        } catch (error) {
          console.error('Error loading saved effect:', error)
          hasLoadedSavedEffect.current = true
          savedEffectIdRef.current = null
        }
      }

      checkForEffects()
    }

    if (selectedGroupId && savedEffectIdRef.current) {
      loadSavedEffect()
    }
  }, [selectedGroupId])

  // Reset the hasLoadedSavedEffect flag when group changes (user-initiated change)
  useEffect(() => {
    if (!isLoadingFromPrefs.current) {
      hasLoadedSavedEffect.current = false
      savedEffectIdRef.current = null
    }
  }, [selectedGroupId])

  // Single useEffect to handle set-active-cue-groups when selectedGroupId changes
  useEffect(() => {
    if (selectedGroupId && !isSettingActiveGroup.current) {
      isSettingActiveGroup.current = true
      window.electron.ipcRenderer
        .invoke(LIGHT.SET_ACTIVE_CUE_GROUPS, [selectedGroupId])
        .then((result) => {
          if (result.success) {
            activeGroupsSelectorRef.current?.refreshActiveGroups()
            console.log(`Set active cue groups: ${selectedGroupId}`)
            // Mark as fully initialized after first successful group selection
            if (isInitialMount.current) {
              isInitialMount.current = false
            }
            isFullyInitialized.current = true
          } else {
            console.error('Failed to set active groups for preview:', result.error)
          }
        })
        .catch((err) => {
          console.error('Error setting active groups for preview:', err)
        })
        .finally(() => {
          isSettingActiveGroup.current = false
        })
    }
  }, [selectedGroupId])

  // Helper function to ensure active group matches the selected group when user interacts with effects
  // This is only needed for explicit user actions, not when group changes (handled by useEffect above)
  const ensureActiveGroupMatches = useCallback(async () => {
    if (selectedGroupId && isFullyInitialized.current && !isSettingActiveGroup.current) {
      try {
        isSettingActiveGroup.current = true
        const result = await window.electron.ipcRenderer.invoke(LIGHT.SET_ACTIVE_CUE_GROUPS, [
          selectedGroupId,
        ])
        if (result.success) {
          activeGroupsSelectorRef.current?.refreshActiveGroups()
          console.log(`Set active group to match selected group: ${selectedGroupId}`)
        } else {
          console.error('Failed to set active group to match selection:', result.error)
        }
      } catch (error) {
        console.error('Error setting active group to match selection:', error)
      } finally {
        isSettingActiveGroup.current = false
      }
    }
  }, [selectedGroupId])

  const handleEffectSelect = useCallback(
    async (effect: EffectSelector) => {
      console.log('Effect selected:', effect)
      setSelectedEffect(effect)
      // When user selects an effect, ensure the active group matches the selected group
      await ensureActiveGroupMatches()
    },
    [ensureActiveGroupMatches],
  )

  const handleTestEffect = async () => {
    if (!selectedEffect) {
      console.log('No effect selected')
      return
    }

    // Ensure the active group matches the selected group when testing an effect
    await ensureActiveGroupMatches()
    try {
      const result = await startTestEffect(selectedEffect.id, selectedVenueSize, selectedBpm)
      if (!result.success) {
        console.error('Failed to start test effect:', result.error)
      }
    } catch (error) {
      console.error('Error starting test effect:', error)
    }
  }

  const handleStopTestEffect = async () => {
    try {
      await stopTestEffect()
    } catch (error) {
      console.error('Error stopping test effect:', error)
    }
  }

  const handleSimulateBeat = async () => {
    await window.electron.ipcRenderer.invoke(LIGHT.SIMULATE_BEAT, {
      venueSize: selectedVenueSize,
      bpm: selectedBpm,
      cueGroup: selectedGroupId,
      effectId: selectedEffect?.id || null,
      trackMode: 'simulated',
    })
    // Simply turn on the indicator, the useTimeoutEffect will reset it
    setShowBeatIndicator(true)
  }

  const handleSimulateKeyframe = async () => {
    await window.electron.ipcRenderer.invoke(LIGHT.SIMULATE_KEYFRAME, {
      venueSize: selectedVenueSize,
      bpm: selectedBpm,
      cueGroup: selectedGroupId,
      effectId: selectedEffect?.id || null,
      trackMode: 'simulated',
    })
    setShowKeyframeIndicator(true)
  }

  const handleSimulateMeasure = async () => {
    await window.electron.ipcRenderer.invoke(LIGHT.SIMULATE_MEASURE, {
      venueSize: selectedVenueSize,
      bpm: selectedBpm,
      cueGroup: selectedGroupId,
      effectId: selectedEffect?.id || null,
      trackMode: 'simulated',
    })
    setShowMeasureIndicator(true)
  }

  const handleSimulateInstrumentNote = async (noteType: string) => {
    try {
      await window.electron.ipcRenderer.invoke(LIGHT.SIMULATE_INSTRUMENT_NOTE, {
        instrument: selectedInstrument,
        noteType: noteType,
        venueSize: selectedVenueSize,
        bpm: selectedBpm,
        cueGroup: selectedGroupId,
        effectId: selectedEffect?.id || null,
        trackMode: 'simulated',
      })
    } catch (error) {
      console.error('Error simulating instrument note:', error)
    }
  }

  const handleRegistryChange = (type: CueRegistryType) => {
    setSelectedRegistryType(type)
    // Future implementation: switch between YARG and RB3E registries
  }

  // Memoize handleGroupChange to prevent unnecessary re-renders/calls from CueRegistrySelector
  const handleGroupChange = useCallback(
    async (groupIds: string[]) => {
      // Handle group selection - only single groups are supported
      if (groupIds.length === 1) {
        const groupId = groupIds[0]
        setSelectedGroupId(groupId) // Store the actual group ID
        // Clear selected effect when group changes so EffectsDropdown will show "- Select -"
        setSelectedEffect(null)

        // Get group details to determine display name
        try {
          const allGroups = await window.electron.ipcRenderer.invoke(LIGHT.GET_CUE_GROUPS)
          const group = allGroups.find((g: CueGroup) => g.id === groupId)
          const displayName = group ? group.name : groupId

          // Only update state if the selection actually changed
          setSelectedGroup((prevSelectedGroup) => {
            if (prevSelectedGroup !== displayName) {
              // Note: set-active-cue-groups is now handled by the useEffect watching selectedGroupId
              return displayName
            }
            return prevSelectedGroup
          })
        } catch (error) {
          console.error('Error fetching group details:', error)
          setSelectedGroup(groupId)
        }
      } else {
        // No group selected - reset to empty state
        setSelectedGroup('')
        setSelectedGroupId('')
        setSelectedEffect(null)
      }
    },
    [setSelectedGroup],
  )

  // Fetch current group info when selected group changes
  useEffect(() => {
    const fetchGroupInfo = async () => {
      try {
        if (!selectedGroupId) {
          // For no group selected state, show a synthetic group description
          setCurrentGroup({
            id: 'none',
            name: 'No Group Selected',
            description: 'Please select a cue group to view its effects.',
            cueTypes: [],
          })
          setSelectedEffect(null) // Clear selected effect when no group is selected
        } else {
          // Single group selection
          const groups = await window.electron.ipcRenderer.invoke(LIGHT.GET_CUE_GROUPS)
          const group = groups.find((g: CueGroup) => g.id === selectedGroupId)
          if (group) {
            setCurrentGroup(group)

            // Don't fetch effects here - let the EffectsDropdown handle it
          }
        }
      } catch (error) {
        console.error('Error fetching group info:', error)
      }
    }

    if (selectedGroup) {
      fetchGroupInfo()
    }
  }, [selectedGroup, selectedGroupId])

  return (
    <div className="p-6 w-full mx-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Cue Simulation</h1>

      {/* Photonics input/output toggle component as the first thing */}
      <DmxSettingsAccordion startOpen={true} />

      <hr className="my-6 border-gray-200 dark:border-gray-600" />

      <CueSimulationAbout isOpen={isAboutOpen} onToggle={() => setIsAboutOpen(!isAboutOpen)} />

      {/* Rig Selector */}
      <DmxRigSelector selectedRigId={selectedRigId} onRigChange={setSelectedRigId} />

      <div className="my-6">
        <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-200">
          Simulation Settings
        </h2>
        {isAudioReactiveEnabled ? (
          <p className="t text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            When Reactive Audio mode is enabled you can select which audio-reactive cue is used to
            drive the DMX output.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Game Type: YARG
                </label>
                {/* <select
                  value={selectedRegistryType}
                  onChange={(e) => setSelectedRegistryType(e.target.value as CueRegistryType)}
                  className="p-2 pr-8 border rounded dark:bg-gray-700 dark:text-gray-200 h-10"
                  style={{ width: '150px' }}>
                  <option value="YARG">YARG</option>
                  <option value="RB3E" disabled>
                    RB3E (Uses direct)
                  </option>
                </select> */}
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div>
                <CueRegistrySelector
                  onRegistryChange={handleRegistryChange}
                  onGroupChange={handleGroupChange}
                  selectedVenueSize={selectedVenueSize}
                  onVenueSizeChange={setSelectedVenueSize}
                  selectedBpm={selectedBpm}
                  onBpmChange={setSelectedBpm}
                  selectedGroupId={selectedGroupId}
                />
              </div>
              <div className="lg:w-64">
                <EffectsDropdown
                  onSelect={handleEffectSelect}
                  groupId={selectedGroupId}
                  value={selectedEffect?.id}
                  disabled={!selectedGroupId}
                />
              </div>
            </div>

            {currentGroup && (
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                <strong>Group Description:</strong> {currentGroup.description}
              </div>
            )}

            {selectedEffect &&
              selectedEffect.yargDescription &&
              selectedEffect.yargDescription !== 'No description available' && (
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  <strong>Effect Description:</strong> {selectedEffect.yargDescription}
                </div>
              )}
          </>
        )}
      </div>

      {isAudioReactiveEnabled && <AudioCueSelectorPanel className="mt-2" />}

      {!isAudioReactiveEnabled && (
        <>
          <CueSimulationActions
            disabled={!selectedEffect || !selectedGroupId}
            onTestEffect={handleTestEffect}
            onStopTestEffect={handleStopTestEffect}
            onSimulateBeat={handleSimulateBeat}
            onSimulateMeasure={handleSimulateMeasure}
            onSimulateKeyframe={handleSimulateKeyframe}
          />
          <CueSimulationInstrument
            selectedInstrument={selectedInstrument}
            onInstrumentChange={setSelectedInstrument}
            onSimulateNote={handleSimulateInstrumentNote}
            disabled={!selectedGroupId}
          />
        </>
      )}

      {selectedRig !== null && rigConfig !== null && dmxValues !== null && (
        <>
          <LightsDmxPreview lightingConfig={rigConfig} dmxValues={dmxValues} />
        </>
      )}

      <hr className="my-6 border-gray-200 dark:border-gray-600" />

      {isAudioReactiveEnabled ? (
        <CuePreviewAudio className="mb-0" />
      ) : (
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
      )}

      <hr className="my-6 border-gray-200 dark:border-gray-600" />

    

      {selectedRig !== null && rigConfig !== null && (
        <>
          <LightsDmxChannelsPreview lightingConfig={rigConfig} dmxValues={dmxValues} />
        </>
      )}
      {selectedRig === null && (
        <p className="text-gray-600 dark:text-gray-400 mt-4">
          Please select a rig to preview DMX data.
        </p>
      )}
    </div>
  )
}

export default CueSimulation
