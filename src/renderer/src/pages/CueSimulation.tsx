import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useAtom } from 'jotai'
import {
  audioListenerEnabledAtom,
  lightingPrefsAtom,
  previewRigIdAtom,
  rb3eListenerEnabledAtom,
  yargListenerEnabledAtom,
} from '@renderer/atoms'
import { useActivePreviewRigs } from '@renderer/hooks/useActivePreviewRigs'
import { EffectSelector } from '../../../photonics-dmx/types'
import type { PostProcessing } from '../../../photonics-dmx/cues/types/cueTypes'
import EffectsDropdown from '../components/EffectSelector'
import DmxSettingsAccordion from '@renderer/components/PhotonicsInputOutputToggles'
import CuePreviewYarg from '@renderer/components/CuePreviewYarg'
import CuePreviewAudio from '@renderer/components/CuePreviewAudio'
import StrobeChannelPreviewNotice from '@renderer/components/StrobeChannelPreviewNotice'
import {
  LiveLightsDmxPreview,
  LiveLightsDmxChannelsPreview,
} from '@renderer/components/LiveDmxPreview'
import DmxRigSelector from '@renderer/components/DmxRigSelector'
import { useTimeoutEffect } from '../utils/useTimeout'
import CueRegistrySelector from '@renderer/components/CueRegistrySelector'
import StageKitLedPanel from '@renderer/components/StageKitLedPanel'
import CueSimulationAbout from './CueSimulation/CueSimulationAbout'
import CueSimulationActions from './CueSimulation/CueSimulationActions'
import CueSimulationInstrument from './CueSimulation/CueSimulationInstrument'
import CueSimulationMotion from './CueSimulation/CueSimulationMotion'
import CueSimulationPostProcessing from './CueSimulation/CueSimulationPostProcessing'
import {
  startTestEffect,
  startRb3TestEffect,
  stopTestEffect,
  getPrefs,
  getCueGroups,
  getRb3CueGroups,
  getAvailableCues,
  getAvailableRb3Cues,
  simulateBeat,
  simulateKeyframe,
  simulateMeasure,
  simulateInstrumentNote,
  simulatePostProcessing,
  stopMotionCueSimulation,
} from '../ipcApi'
import { useDmxPreview } from '@renderer/hooks/useDmxPreview'
import { useDebouncedSave } from '@renderer/hooks/useDebouncedSave'
import { persistPrefs } from '../ipc/persistPrefs'
import { createLogger } from '../../../shared/logger'

/** How long the selections have to stop changing before they are stored. */
const SETTINGS_QUIET_MS = 500
import {
  instrumentNotePayload,
  simulationContext,
  type SimulationContext,
} from './CueSimulation/simulationPayload'
import { sameSimulationSettings, type SimulationSettings } from './CueSimulation/simulationSettings'

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
  const [isYargEnabled] = useAtom(yargListenerEnabledAtom)
  // A live listener owns the rig chains, and main refuses every simulation while one runs.
  const liveInput = isRb3Enabled ? 'RB3E' : isYargEnabled ? 'YARG' : null
  const [lightingPrefs] = useAtom(lightingPrefsAtom)
  const advancedModeEnabled = lightingPrefs.advancedModeEnabled ?? false
  const venuePostProcessingEnabled = lightingPrefs.venuePostProcessingEnabled ?? true
  const [selectedEffect, setSelectedEffect] = useState<EffectSelector | null>(null)
  const [selectedRegistryType, setSelectedRegistryType] = useState<CueRegistryType>('YARG')
  const [selectedGroup, setSelectedGroup] = useState<string>('Select')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [currentGroup, setCurrentGroup] = useState<CueGroup | null>(null)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [selectedRigId, setSelectedRigId] = useAtom(previewRigIdAtom)
  const activeRigs = useActivePreviewRigs()
  const { selectedRig, rigConfig } = useDmxPreview()
  const [selectedVenueSize, setSelectedVenueSize] = useState<'NoVenue' | 'Small' | 'Large'>('Large')
  const [selectedBpm, setSelectedBpm] = useState<number>(120)

  // State for instrument simulation
  const [selectedInstrument, setSelectedInstrument] = useState<
    'guitar' | 'bass' | 'keys' | 'drums'
  >('guitar')

  const [selectedPostProcessing, setSelectedPostProcessing] = useState<PostProcessing>('Default')

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

  // False until the saved selections are back in place. Nothing is stored before then, and the
  // group selector leaves an empty selection alone.
  const [settingsRestored, setSettingsRestored] = useState(false)
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null)
  // The effect to restore and the group it belongs to. Carrying the group is what makes the
  // restore independent of when the load flag clears: the group arrives as a state update, so by
  // the time the effects below run the flag has already gone false and cannot be used to tell a
  // restored group apart from one the user picked.
  const savedEffectRef = useRef<{ groupId: string; effectId: string } | null>(null)
  const postProcessingSimulationActiveRef = useRef(false)

  useEffect(() => {
    if (!advancedModeEnabled) {
      stopMotionCueSimulation().catch((error) => {
        log.error('Error stopping motion cue simulation when Advanced Mode is disabled', error)
      })
    }
  }, [advancedModeEnabled])

  // With the preference off the publisher stops applying the effect but keeps the one YARG last
  // reported, so clear the picker rather than leave it naming an effect nothing is showing.
  useEffect(() => {
    if (venuePostProcessingEnabled) return
    setSelectedPostProcessing('Default')
  }, [venuePostProcessingEnabled])

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
      // Only release a simulated effect this page successfully applied.
      if (postProcessingSimulationActiveRef.current) {
        simulatePostProcessing('Default').catch((error) => {
          log.error('Error clearing simulated post-processing on unmount:', error)
        })
      }
    }
  }, [])

  // The page remembers what was last simulated. A selection changes as fast as the user clicks, so
  // the write waits for the clicking to stop and still goes out if the page is left first.
  const writeSimulationSettings = useCallback(
    (settings: SimulationSettings) =>
      persistPrefs({ simulationSettings: settings }, 'the simulation settings', (message) =>
        setSettingsSaveError(message),
      ),
    [],
  )
  const settingsSaver = useDebouncedSave(writeSimulationSettings, {
    quietMs: SETTINGS_QUIET_MS,
    isEqual: sameSimulationSettings,
  })

  // Load saved simulation settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const prefs = await getPrefs()
        const savedSettings = prefs.simulationSettings

        if (savedSettings) {
          settingsSaver.seed(savedSettings)
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
                  savedEffectRef.current = {
                    groupId: savedSettings.groupId,
                    effectId: savedSettings.effectId,
                  }
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
        setSettingsRestored(true)
      }
    }

    void loadSettings()
  }, [settingsSaver])

  useEffect(() => {
    if (!settingsRestored) {
      return
    }
    setSettingsSaveError(null)
    settingsSaver.saveSoon({
      registryType: selectedRegistryType,
      groupId: selectedGroupId,
      // A saved effect still being restored is kept, so a slow cue list never stores it as cleared.
      effectId: selectedEffect?.id ?? savedEffectRef.current?.effectId ?? null,
      venueSize: selectedVenueSize,
      bpm: selectedBpm,
      instrument: selectedInstrument,
    })
  }, [
    settingsRestored,
    settingsSaver,
    selectedRegistryType,
    selectedGroupId,
    selectedEffect?.id,
    selectedVenueSize,
    selectedBpm,
    selectedInstrument,
  ])

  // Load saved effect after group is loaded and effects are available
  useEffect(() => {
    let cancelled = false
    const loadSavedEffect = (): void => {
      const saved = savedEffectRef.current
      if (!saved || saved.groupId !== selectedGroupId) {
        return
      }

      // Wait for effects to be loaded by EffectsDropdown
      const checkForEffects = async (retries = 10) => {
        try {
          const availableEffects =
            selectedRegistryType === 'RB3E'
              ? await getAvailableRb3Cues(selectedGroupId)
              : await getAvailableCues(selectedGroupId)
          if (cancelled || savedEffectRef.current !== saved) return
          if (availableEffects && availableEffects.length > 0) {
            const savedEffect = availableEffects.find(
              (e: EffectSelector) => e.id === saved.effectId,
            )
            if (savedEffect) {
              setSelectedEffect(savedEffect)
            }
            // Either it was restored or this group no longer offers it. Done either way.
            savedEffectRef.current = null
          } else if (retries > 0) {
            // Effects not loaded yet, retry after a short delay
            setTimeout(() => void checkForEffects(retries - 1), 200)
          } else {
            savedEffectRef.current = null
          }
        } catch (error) {
          log.error('Error loading saved effect:', error)
          savedEffectRef.current = null
        }
      }
      // Settles after the first attempt: the retry chain carries on through a timer.
      void checkForEffects()
    }

    loadSavedEffect()
    return () => {
      cancelled = true
    }
  }, [selectedGroupId, selectedRegistryType])

  // Moving to a different group than the saved effect belongs to abandons the restore.
  useEffect(() => {
    const saved = savedEffectRef.current
    if (saved && saved.groupId !== selectedGroupId) {
      savedEffectRef.current = null
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

  const handlePostProcessingChange = async (state: PostProcessing) => {
    const previous = selectedPostProcessing
    setSelectedPostProcessing(state)
    try {
      const applied = await simulatePostProcessing(state)
      if (applied === true) {
        postProcessingSimulationActiveRef.current = state !== 'Default'
      } else {
        setSelectedPostProcessing(previous)
        log.warn('Post-processing simulation refused while live input owns the lights')
      }
    } catch (error) {
      setSelectedPostProcessing(previous)
      log.error('Error simulating post-processing:', error)
    }
  }

  const simulationContextNow = (): SimulationContext =>
    simulationContext(selectedVenueSize, selectedBpm, selectedGroupId, selectedEffect)

  const handleSimulateBeat = async () => {
    try {
      await simulateBeat(simulationContextNow())
      // Simply turn on the indicator, the useTimeoutEffect will reset it
      setShowBeatIndicator(true)
    } catch (error) {
      log.error('Error simulating a beat:', error)
    }
  }

  const handleSimulateKeyframe = async () => {
    try {
      await simulateKeyframe(simulationContextNow())
      setShowKeyframeIndicator(true)
    } catch (error) {
      log.error('Error simulating a keyframe:', error)
    }
  }

  const handleSimulateMeasure = async () => {
    try {
      await simulateMeasure(simulationContextNow())
      setShowMeasureIndicator(true)
    } catch (error) {
      log.error('Error simulating a measure:', error)
    }
  }

  const handleSimulateInstrumentNote = async (noteType: string) => {
    try {
      await simulateInstrumentNote(
        instrumentNotePayload(simulationContextNow(), selectedInstrument, noteType),
      )
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
    // RB3 mode hides the post-processing control, so clear the effect it was holding.
    if (selectedPostProcessing !== 'Default') {
      void handlePostProcessingChange('Default')
    }
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
      void fetchGroupInfo()
    }
  }, [selectedGroup, selectedGroupId, selectedRegistryType])

  return (
    <div className="p-6 w-full mx-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Cue Simulation</h1>

      {settingsSaveError && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {settingsSaveError}
        </p>
      )}

      {/* Photonics input/output toggle component as the first thing */}
      <DmxSettingsAccordion startOpen={true} />

      <hr className="my-6 border-gray-200 dark:border-gray-600" />

      <CueSimulationAbout isOpen={isAboutOpen} onToggle={() => setIsAboutOpen(!isAboutOpen)} />

      {advancedModeEnabled && (
        <DmxRigSelector
          rigs={activeRigs}
          selectedRigId={selectedRigId}
          onRigChange={setSelectedRigId}
        />
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
                  onGroupChange={(groupIds) => void handleGroupChange(groupIds)}
                  selectedVenueSize={selectedVenueSize}
                  onVenueSizeChange={setSelectedVenueSize}
                  selectedBpm={selectedBpm}
                  onBpmChange={setSelectedBpm}
                  selectedGroupId={selectedGroupId}
                  selectedRegistryType={selectedRegistryType}
                  ready={settingsRestored}
                />
              </div>
              <div className="lg:w-64">
                <EffectsDropdown
                  onSelect={(effect) => void handleEffectSelect(effect)}
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
          {liveInput && (
            <div className="mb-4 p-3 rounded border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 text-sm text-amber-800 dark:text-amber-300">
              {liveInput} is enabled and owns the lights. Disable {liveInput} to simulate cues.
            </div>
          )}
          <CueSimulationActions
            disabled={!selectedEffect || !selectedGroupId || liveInput !== null}
            onTestEffect={() => void handleTestEffect()}
            onStopTestEffect={() => void handleStopTestEffect()}
            onSimulateBeat={() => void handleSimulateBeat()}
            onSimulateMeasure={() => void handleSimulateMeasure()}
            onSimulateKeyframe={() => void handleSimulateKeyframe()}
            showSongSimulation={selectedRegistryType !== 'RB3E'}
          />
          {selectedRegistryType === 'RB3E' && !liveInput && <StageKitLedPanel />}
          {/* RB3 mode has no instrument-note song events — LED state drives it instead. */}
          {selectedRegistryType !== 'RB3E' && (
            <CueSimulationInstrument
              selectedInstrument={selectedInstrument}
              onInstrumentChange={setSelectedInstrument}
              onSimulateNote={(noteType) => void handleSimulateInstrumentNote(noteType)}
              disabled={!selectedGroupId || liveInput !== null}
            />
          )}
          {/* Post-processing is a YARG venue signal, so RB3 mode has nothing to drive it, and the
              preference being off means output would ignore whatever was picked. */}
          {selectedRegistryType !== 'RB3E' && venuePostProcessingEnabled && (
            <CueSimulationPostProcessing
              selectedState={selectedPostProcessing}
              onStateChange={(state) => void handlePostProcessingChange(state)}
              disabled={liveInput !== null}
            />
          )}
          {advancedModeEnabled && (
            <CueSimulationMotion
              platform={selectedRegistryType === 'RB3E' ? 'rb3' : 'yarg'}
              disabled={liveInput !== null}
            />
          )}
        </>
      )}

      {selectedRig !== null && rigConfig !== null && (
        <>
          <StrobeChannelPreviewNotice lightingConfig={rigConfig} className="mb-3" />
          <LiveLightsDmxPreview lightingConfig={rigConfig} />
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
          <LiveLightsDmxChannelsPreview lightingConfig={rigConfig} />
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
