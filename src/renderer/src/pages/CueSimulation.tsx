import React, { useEffect, useState, useCallback, useRef } from 'react'
import { getDefaultStore, useAtom } from 'jotai'
import {
  audioListenerEnabledAtom,
  lightingPrefsAtom,
  previewRigIdAtom,
  rb3eListenerEnabledAtom,
  resolveLastUsedRigId,
} from '@renderer/atoms'
import { EffectSelector } from '../../../photonics-dmx/types'
import EffectsDropdown from '../components/EffectSelector'
import DmxSettingsAccordion from '@renderer/components/PhotonicsInputOutputToggles'
import CuePreviewYarg from '@renderer/components/CuePreviewYarg'
import CuePreviewAudio from '@renderer/components/CuePreviewAudio'
import LightsDmxPreview from '@renderer/components/LightsDmxPreview'
import StrobeChannelPreviewNotice from '@renderer/components/StrobeChannelPreviewNotice'
import LightsDmxChannelsPreview from '@renderer/components/LightsDmxChannelsPreview'
import DmxRigSelector from '@renderer/components/DmxRigSelector'
import { useTimeoutEffect } from '../utils/useTimeout'
import CueRegistrySelector from '@renderer/components/CueRegistrySelector'
import StageKitLedPanel from '@renderer/components/StageKitLedPanel'
import CueSimulationAbout from './CueSimulation/CueSimulationAbout'
import CueSimulationActions from './CueSimulation/CueSimulationActions'
import CueSimulationInstrument from './CueSimulation/CueSimulationInstrument'
import CueSimulationMotion from './CueSimulation/CueSimulationMotion'
import {
  startTestEffect,
  startRb3TestEffect,
  stopTestEffect,
  getPrefs,
  savePrefs,
  getCueGroups,
  getRb3CueGroups,
  getAvailableCues,
  getAvailableRb3Cues,
  getActiveRigs,
  simulateBeat,
  simulateKeyframe,
  simulateMeasure,
  simulateInstrumentNote,
  stopMotionCueSimulation,
} from '../ipcApi'
import { useDmxPreview } from '@renderer/hooks/useDmxPreview'
import { createLogger } from '../../../shared/logger'
const log = createLogger('CueSimulation')

type CueRegistryType = 'YARG' | 'RB3E'

type CueGroup = {
  id: string
  name: string
  description: string
  cueTypes: string[]
}

const isYargVisualCueGroup = (g: CueGroup) => g.cueTypes.length > 0

/** Cue groups come from the YARG registry or the separate RB3 cue registry, by selected game type. */
const fetchCueGroupsForRegistry = (registryType: CueRegistryType) =>
  registryType === 'RB3E' ? getRb3CueGroups() : getCueGroups()

const CueSimulation: React.FC = () => {
  const [isAudioReactiveEnabled] = useAtom(audioListenerEnabledAtom)
  const [isRb3Enabled] = useAtom(rb3eListenerEnabledAtom)
  const [lightingPrefs] = useAtom(lightingPrefsAtom)
  const advancedModeEnabled = lightingPrefs.advancedModeEnabled ?? false
  const [selectedEffect, setSelectedEffect] = useState<EffectSelector | null>(null)
  const [selectedRegistryType, setSelectedRegistryType] = useState<CueRegistryType>('YARG')
  const [selectedGroup, setSelectedGroup] = useState<string>('Select')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [currentGroup, setCurrentGroup] = useState<CueGroup | null>(null)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [selectedRigId, setSelectedRigId] = useAtom(previewRigIdAtom)
  const { selectedRig, rigConfig, dmxValues } = useDmxPreview()
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

  // Track initialization phases
  const isInitialMount = useRef(true)
  const isFullyInitialized = useRef(false)
  const isLoadingFromPrefs = useRef(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasLoadedSavedEffect = useRef(false)
  const savedEffectIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!advancedModeEnabled) {
      stopMotionCueSimulation().catch((error) => {
        log.error('Error stopping motion cue simulation when Advanced Mode is disabled', error)
      })
    }
  }, [advancedModeEnabled])

  useEffect(() => {
    if (advancedModeEnabled) return
    let cancelled = false
    void (async () => {
      try {
        const activeRigs = await getActiveRigs()
        if (cancelled) return
        const orderedIds = activeRigs.map((r) => r.id)
        const currentId = getDefaultStore().get(previewRigIdAtom)
        const resolved = resolveLastUsedRigId(currentId, orderedIds)
        if (resolved !== currentId) {
          setSelectedRigId(resolved)
        }
      } catch (e) {
        log.error('Failed to resolve preview rig when Advanced Mode is off', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [advancedModeEnabled, setSelectedRigId])

  // Cleanup effect: stop any running test effects when component unmounts
  useEffect(() => {
    return () => {
      // Stop any running test effects when leaving the page
      stopTestEffect().catch((error) => {
        log.error('Error stopping test effect on unmount:', error)
      })
      stopMotionCueSimulation().catch((error) => {
        log.error('Error stopping motion cue simulation on unmount:', error)
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
        const prefs = await getPrefs()
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
            try {
              const allGroups = await fetchCueGroupsForRegistry(
                savedSettings.registryType ?? 'YARG',
              )
              const group = allGroups.find((g: CueGroup) => g.id === savedSettings.groupId)
              if (group && isYargVisualCueGroup(group)) {
                if (savedSettings.effectId) {
                  savedEffectIdRef.current = savedSettings.effectId
                }
                setSelectedGroupId(savedSettings.groupId)
                setSelectedGroup(group.name)
              }
            } catch (error) {
              log.error('Error fetching group details during load:', error)
            }
          }
        }
      } catch (error) {
        log.error('Error loading simulation settings:', error)
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
        await savePrefs({
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
        log.error('Error saving simulation settings:', error)
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
          const availableEffects =
            selectedRegistryType === 'RB3E'
              ? await getAvailableRb3Cues(selectedGroupId)
              : await getAvailableCues(selectedGroupId)
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
          log.error('Error loading saved effect:', error)
          hasLoadedSavedEffect.current = true
          savedEffectIdRef.current = null
        }
      }

      checkForEffects()
    }

    if (selectedGroupId && savedEffectIdRef.current) {
      loadSavedEffect()
    }
  }, [selectedGroupId, selectedRegistryType])

  // Reset the hasLoadedSavedEffect flag when group changes (user-initiated change)
  useEffect(() => {
    if (!isLoadingFromPrefs.current) {
      hasLoadedSavedEffect.current = false
      savedEffectIdRef.current = null
    }
  }, [selectedGroupId])

  // Simulation uses cueGroup in the simulate payload; we do not set global active groups here.
  useEffect(() => {
    if (selectedGroupId) {
      if (isInitialMount.current) {
        isInitialMount.current = false
      }
      isFullyInitialized.current = true
    }
  }, [selectedGroupId])

  const handleEffectSelect = useCallback(async (effect: EffectSelector) => {
    log.info('Effect selected:', effect)
    setSelectedEffect(effect)
  }, [])

  const handleTestEffect = async () => {
    if (!selectedEffect) {
      log.info('No effect selected')
      return
    }

    try {
      const fire = selectedRegistryType === 'RB3E' ? startRb3TestEffect : startTestEffect
      const result = await fire(
        selectedEffect.id,
        selectedVenueSize,
        selectedBpm,
        selectedGroupId || undefined,
      )
      if (!result.success) {
        log.error('Failed to start test effect:', result.error)
      }
    } catch (error) {
      log.error('Error starting test effect:', error)
    }
  }

  const handleStopTestEffect = async () => {
    try {
      await stopTestEffect()
    } catch (error) {
      log.error('Error stopping test effect:', error)
    }
  }

  const handleSimulateBeat = async () => {
    await simulateBeat({
      venueSize: selectedVenueSize,
      bpm: selectedBpm,
      cueGroup: selectedGroupId,
      effectId: selectedEffect?.id || null,
    })
    // Simply turn on the indicator, the useTimeoutEffect will reset it
    setShowBeatIndicator(true)
  }

  const handleSimulateKeyframe = async () => {
    await simulateKeyframe({
      venueSize: selectedVenueSize,
      bpm: selectedBpm,
      cueGroup: selectedGroupId,
      effectId: selectedEffect?.id || null,
    })
    setShowKeyframeIndicator(true)
  }

  const handleSimulateMeasure = async () => {
    await simulateMeasure({
      venueSize: selectedVenueSize,
      bpm: selectedBpm,
      cueGroup: selectedGroupId,
      effectId: selectedEffect?.id || null,
    })
    setShowMeasureIndicator(true)
  }

  const handleSimulateInstrumentNote = async (noteType: string) => {
    try {
      await simulateInstrumentNote({
        instrument: selectedInstrument,
        noteType: noteType,
        venueSize: selectedVenueSize,
        bpm: selectedBpm,
        cueGroup: selectedGroupId,
        effectId: selectedEffect?.id || null,
      })
    } catch (error) {
      log.error('Error simulating instrument note:', error)
    }
  }

  const handleRegistryChange = (type: CueRegistryType) => {
    if (type === selectedRegistryType) return
    // Switching registry invalidates the current group/effect (different registries, different
    // group ids); clear so the selector re-inits against the newly chosen registry.
    setSelectedRegistryType(type)
    setSelectedGroup('')
    setSelectedGroupId('')
    setSelectedEffect(null)
  }

  // Memoize handleGroupChange to prevent unnecessary re-renders/calls from CueRegistrySelector
  const handleGroupChange = useCallback(
    async (groupIds: string[]) => {
      // Handle group selection - only single groups are supported
      if (groupIds.length === 1) {
        const groupId = groupIds[0]
        // Clear selected effect when group changes so EffectsDropdown will show "- Select -"
        setSelectedEffect(null)

        try {
          const allGroups = await fetchCueGroupsForRegistry(selectedRegistryType)
          const group = allGroups.find((g: CueGroup) => g.id === groupId && isYargVisualCueGroup(g))
          if (!group) {
            setSelectedGroup('')
            setSelectedGroupId('')
            return
          }
          setSelectedGroupId(groupId)
          const displayName = group.name
          // Only update state if the selection actually changed
          setSelectedGroup((prevSelectedGroup) => {
            if (prevSelectedGroup !== displayName) {
              return displayName
            }
            return prevSelectedGroup
          })
        } catch (error) {
          log.error('Error fetching group details:', error)
          setSelectedGroup('')
          setSelectedGroupId('')
        }
      } else {
        // No group selected - reset to empty state
        setSelectedGroup('')
        setSelectedGroupId('')
        setSelectedEffect(null)
      }
    },
    [setSelectedGroup, selectedRegistryType],
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
          const groups = await fetchCueGroupsForRegistry(selectedRegistryType)
          const group = groups.find(
            (g: CueGroup) => g.id === selectedGroupId && isYargVisualCueGroup(g),
          )
          if (group) {
            setCurrentGroup(group)

            // Don't fetch effects here - let the EffectsDropdown handle it
          } else {
            setSelectedGroupId('')
            setSelectedGroup('')
            setSelectedEffect(null)
            setCurrentGroup({
              id: 'none',
              name: 'No Group Selected',
              description: 'Please select a cue group to view its effects.',
              cueTypes: [],
            })
          }
        }
      } catch (error) {
        log.error('Error fetching group info:', error)
      }
    }

    if (selectedGroup) {
      fetchGroupInfo()
    }
  }, [selectedGroup, selectedGroupId, selectedRegistryType])

  return (
    <div className="p-6 w-full mx-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Cue Simulation</h1>

      {/* Photonics input/output toggle component as the first thing */}
      <DmxSettingsAccordion startOpen={true} />

      <hr className="my-6 border-gray-200 dark:border-gray-600" />

      <CueSimulationAbout isOpen={isAboutOpen} onToggle={() => setIsAboutOpen(!isAboutOpen)} />

      {advancedModeEnabled && (
        <DmxRigSelector selectedRigId={selectedRigId} onRigChange={setSelectedRigId} />
      )}

      <div className="my-6">
        <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-200">
          Simulation Settings
        </h2>
        {isAudioReactiveEnabled ? (
          <div className="text-sm text-gray-700 dark:text-gray-300 mb-1">
            <p className="mb-2">
              Reactive Audio mode is enabled. Cue Simulation does not apply when using
              audio-reactive lighting.
            </p>
            <p>
              To choose which audio-reactive cue drives the DMX output and view live preview, use{' '}
              <strong>DMX Preview</strong>. Lighting will follow real-time audio analysis from your
              microphone or system audio input.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Game Type
                </label>
                <select
                  value={selectedRegistryType}
                  onChange={(e) => handleRegistryChange(e.target.value as CueRegistryType)}
                  className="p-2 pr-8 border rounded dark:bg-gray-700 dark:text-gray-200 h-10"
                  style={{ width: '150px' }}>
                  <option value="YARG">YARG</option>
                  <option value="RB3E">RB3E</option>
                </select>
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
                  selectedRegistryType={selectedRegistryType}
                />
              </div>
              <div className="lg:w-64">
                <EffectsDropdown
                  onSelect={handleEffectSelect}
                  groupId={selectedGroupId}
                  value={selectedEffect?.id}
                  disabled={!selectedGroupId}
                  registryType={selectedRegistryType}
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

      {!isAudioReactiveEnabled && (
        <>
          {isRb3Enabled && (
            <div className="mb-4 p-3 rounded border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 text-sm text-amber-800 dark:text-amber-300">
              RB3E is enabled and owns the lights. Disable RB3E to simulate cues.
            </div>
          )}
          <CueSimulationActions
            disabled={!selectedEffect || !selectedGroupId || isRb3Enabled}
            onTestEffect={handleTestEffect}
            onStopTestEffect={handleStopTestEffect}
            onSimulateBeat={handleSimulateBeat}
            onSimulateMeasure={handleSimulateMeasure}
            onSimulateKeyframe={handleSimulateKeyframe}
            showSongSimulation={selectedRegistryType !== 'RB3E'}
          />
          {selectedRegistryType === 'RB3E' && !isRb3Enabled && <StageKitLedPanel />}
          {/* RB3 mode has no instrument-note song events — LED state drives it instead. */}
          {selectedRegistryType !== 'RB3E' && (
            <CueSimulationInstrument
              selectedInstrument={selectedInstrument}
              onInstrumentChange={setSelectedInstrument}
              onSimulateNote={handleSimulateInstrumentNote}
              disabled={!selectedGroupId || isRb3Enabled}
            />
          )}
          {advancedModeEnabled && (
            <CueSimulationMotion platform={selectedRegistryType === 'RB3E' ? 'rb3' : 'yarg'} />
          )}
        </>
      )}

      {selectedRig !== null && rigConfig !== null && dmxValues !== null && (
        <>
          <StrobeChannelPreviewNotice lightingConfig={rigConfig} className="mb-3" />
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
          {advancedModeEnabled
            ? 'Please select a rig to preview DMX data.'
            : 'No active rigs configured. Create and activate a rig in Lights Layout to see DMX preview.'}
        </p>
      )}
    </div>
  )
}

export default CueSimulation
