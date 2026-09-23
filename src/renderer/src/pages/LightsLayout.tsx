import { useState, useMemo, useEffect, useCallback, useLayoutEffect, useRef } from 'react'
import LightLayoutPreview from '../components/LightLayoutPreview'
import { findSharedChannelNumbers } from '../components/lightChannelDisplay'
import { useAtom, useSetAtom, useStore } from 'jotai'

import {
  ConfigStrobeType,
  DmxLight,
  FixtureTypes,
  DmxRig,
  LightingConfiguration,
} from '../../../photonics-dmx/types'
import {
  activeDmxLightsConfigAtom,
  myValidDmxLightsAtom,
  myDmxLightsAtom,
  dmxRigsAtom,
  activeRigIdAtom,
  lightsLayoutHasUnsavedChangesAtom,
  lightingPrefsAtom,
} from '@renderer/atoms'
import LightsLayoutRigSection from './LightsLayout/LightsLayoutRigSection'
import LightsLayoutForm from './LightsLayout/LightsLayoutForm'
import LightsLayoutIntro from './LightsLayout/LightsLayoutIntro'
import ImportRigModal from './LightsLayout/components/ImportRigModal'
import { useRigImportExport } from './LightsLayout/useRigImportExport'
import { getDmxRigs, saveDmxRig } from '../ipcApi'
import {
  LIGHT_LAYOUTS,
  isTwoRowPrimaryLayout,
  splitLights,
  createDmxLightInstance,
  buildRigConfigForSave,
  lightingConfigsEqual,
} from './LightsLayout/lightsLayoutHelpers'
import {
  reassignNonStrobeGroups,
  mapDedicatedStrobeGroupRows,
} from './LightsLayout/lightsLayoutState'
import { useLightsLayoutRig } from './LightsLayout/useLightsLayoutRig'
import { useLightsLayoutDrag } from './LightsLayout/useLightsLayoutDrag'
import LightsLayoutCanvas from './LightsLayout/LightsLayoutCanvas'
import { useLightsLayoutActiveConfigSync } from './LightsLayout/useLightsLayoutActiveConfigSync'
import { useToast } from '../hooks/useToast'
import { useTimeout } from '../utils/useTimeout'
import { useConfirm } from '../hooks/useConfirm'
import { createLogger } from '../../../shared/logger'
const log = createLogger('LightsLayout')

/** Compact toolbar button, sized to match the Node/Cue editor's Import/Export buttons. */
const rigToolbarButton =
  'px-3 py-1 text-xs rounded border border-gray-400 dark:border-white bg-gray-200 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'

/**
 * Handles the light layout and channel configuration.
 * @returns React component
 */
const LightsLayout = () => {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [activeConfig, setActiveLightsConfig] = useAtom(activeDmxLightsConfigAtom)
  const [myFixtures] = useAtom(myValidDmxLightsAtom)
  const [myFixtureLibrary, setMyFixtureLibrary] = useAtom(myDmxLightsAtom)
  const [rigs, setRigs] = useAtom(dmxRigsAtom)
  const [activeRigId, setActiveRigId] = useAtom(activeRigIdAtom)
  const [prefs] = useAtom(lightingPrefsAtom)
  const advancedModeEnabled = prefs.advancedModeEnabled ?? false
  const setLightsLayoutUnsaved = useSetAtom(lightsLayoutHasUnsavedChangesAtom)

  const [selectedCount, setSelectedCount] = useState<number | null>(() => {
    if (activeConfig?.numLights === 0) return null
    return activeConfig?.numLights || 4
  })
  const [selectedLayout, setSelectedLayout] = useState<string>(
    () => activeConfig?.lightLayout.id || 'front',
  )

  const initialAssignedToBack = useMemo(() => {
    if (activeConfig && isTwoRowPrimaryLayout(activeConfig.lightLayout.id)) {
      return activeConfig.backLights.length > 0 ? activeConfig.backLights.length : 'None'
    }
    return 'None'
  }, [activeConfig])

  const [assignedToBack, setAssignedToBack] = useState<number | 'None'>(initialAssignedToBack)
  const [selectedStrobe, setSelectedStrobe] = useState<ConfigStrobeType>(
    () => activeConfig?.strobeType || ConfigStrobeType.None,
  )

  // Dedicated Strobe Count (0 if strobe effects is not Dedicated)
  const [dedicatedStrobeCount, setDedicatedStrobeCount] = useState<number>(0)

  const [highlightedLight, setHighlightedLight] = useState<number | null>(null)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const store = useStore()
  const hideSuccessMessage = useTimeout(() => setShowSuccessMessage(false), 3000)

  const [allPrimaryLights, setAllPrimaryLights] = useState<DmxLight[]>(() => {
    const front = activeConfig?.frontLights || []
    const back = activeConfig?.backLights || []
    const merged = [
      ...front.map((l) => ({ ...l, group: 'front' as const })),
      ...back.map((l) => ({ ...l, group: 'back' as const })),
    ]
    return merged
  })

  const { rigName, setRigName } = useLightsLayoutRig(
    activeRigId,
    setRigs,
    setActiveRigId,
    setActiveLightsConfig,
  )

  useLightsLayoutActiveConfigSync(
    activeConfig,
    setSelectedCount,
    setSelectedLayout,
    setAssignedToBack,
    setSelectedStrobe,
    setDedicatedStrobeCount,
    setAllPrimaryLights,
  )

  //  Available Layouts
  const availableLayouts = useMemo(() => {
    return LIGHT_LAYOUTS.filter((layout) => {
      if (layout.id === 'front') return true
      if (layout.id === 'two-rows' || layout.id === 'front-back' || layout.id === 'stacked')
        return (selectedCount || 0) >= 2
      return false
    })
  }, [selectedCount])

  /**
   * Adds one light addressed clear of `placed`. Callers pass the list they are building, not the
   * committed state, so several lights added in a single pass each land on their own channels.
   * Reports back when the universe ran out of room, which the caller surfaces once.
   */
  const createLightInstance = useCallback(
    (
      group: 'front' | 'back' | 'strobe',
      placed: DmxLight[],
      fixtures: typeof myFixtures = myFixtures,
    ) => {
      return createDmxLightInstance(group, placed, fixtures)
    },
    [myFixtures],
  )

  /**
   * Raised by the light-adding effects when a fixture would not fit before the end of the universe.
   * A flag rather than a toast at the point of failure: those run inside state updaters, which React
   * may invoke more than once, and a ref read after the render reports it exactly once.
   */
  /**
   * Addresses claimed by more than one light in the rig being edited. Checked across the whole rig
   * because that is the scope the publisher shares a channel buffer over, and because a per-fixture
   * check cannot see two lights overlapping each other.
   */
  const sharedRigChannels = useMemo(
    () => findSharedChannelNumbers(allPrimaryLights),
    [allPrimaryLights],
  )

  const universeFullRef = useRef(false)
  useEffect(() => {
    if (!universeFullRef.current) return
    universeFullRef.current = false
    showToast(
      'No room left in the universe for another fixture. It shares channels with an existing light until you re-address it.',
      'error',
      6000,
    )
  })

  useEffect(() => {
    setAllPrimaryLights((prev) => {
      // Separate non-strobe lights and strobe lights.
      const nonStrobeLights = prev.filter((l) => l.group !== 'strobe')
      const strobeLights = prev.filter((l) => l.group === 'strobe')

      const updated = [...nonStrobeLights]
      if (updated.length === 0) {
        // Bootstrap the first rig from the first fixture template, using footprint-aware placement.
        if (myFixtures.length > 0 && selectedCount) {
          const firstFixture = myFixtures[0]
          for (let i = 0; i < selectedCount; i++) {
            const { light, addressCapped } = createLightInstance('front', updated, [firstFixture])
            if (addressCapped) universeFullRef.current = true
            updated.push(light)
          }
        }
      } else {
        // Adjust the count only for non-strobe lights.
        if (selectedCount) {
          while (updated.length < selectedCount) {
            const { light, addressCapped } = createLightInstance('front', updated)
            if (addressCapped) universeFullRef.current = true
            updated.push(light)
          }
          while (updated.length > selectedCount) {
            updated.pop()
          }
        }
      }
      // Recombine the non-strobe lights with the dedicated strobe lights.
      return [...updated, ...strobeLights]
    })
  }, [selectedCount, createLightInstance, myFixtures])

  //  Front/Back Assignment
  useEffect(() => {
    const { frontCount, backCount } = splitLights(selectedCount || 0, assignedToBack)

    setAllPrimaryLights((prev) => {
      const nonStrobeLights = prev.filter((l) => l.group !== 'strobe')
      const strobeLights = prev.filter((l) => l.group === 'strobe')
      const sorted = [...nonStrobeLights].sort((a, b) => a.position - b.position)
      const reordered = reassignNonStrobeGroups(sorted, frontCount, backCount)
      return [...reordered, ...strobeLights]
    })
  }, [assignedToBack, selectedLayout, selectedCount])

  // Strobe Logic for non-Dedicated lights
  useEffect(() => {
    // If strobe is disabled => turn off strobeMode for non-strobe fixtures
    if (selectedStrobe === ConfigStrobeType.None) {
      setAllPrimaryLights((prev) =>
        prev.map((l) => (l.fixture === FixtureTypes.STROBE ? l : { ...l, strobeMode: 'disabled' })),
      )
    }
    // For AllCapable, we don’t create a separate strobe group,
  }, [selectedStrobe])

  // Handle Dedicated Strobe (using dedicatedStrobeCount)
  useEffect(() => {
    if (selectedStrobe !== ConfigStrobeType.Dedicated) {
      return
    }

    setAllPrimaryLights((prev) => {
      let updated = [...prev]

      // Count current dedicated strobe lights
      const currentStrobes = updated.filter(
        (l) => l.group === 'strobe' && l.fixture === FixtureTypes.STROBE,
      )
      const currentCount = currentStrobes.length

      if (currentCount < dedicatedStrobeCount) {
        // Add the missing strobe lights
        const numToAdd = dedicatedStrobeCount - currentCount
        for (let i = 0; i < numToAdd; i++) {
          const { light: newStrobe, addressCapped } = createLightInstance('strobe', updated)
          if (addressCapped) universeFullRef.current = true
          newStrobe.fixture = FixtureTypes.STROBE
          newStrobe.isStrobeEnabled = true
          newStrobe.group = 'strobe'
          newStrobe.position = updated.length + 1
          updated.push(newStrobe)
        }
      } else if (currentCount > dedicatedStrobeCount) {
        // Remove extra strobe lights
        let toRemove = currentCount - dedicatedStrobeCount
        updated = updated.filter((light) => {
          if (light.group === 'strobe' && light.fixture === FixtureTypes.STROBE && toRemove > 0) {
            toRemove--
            return false
          }
          return true
        })
      }

      return mapDedicatedStrobeGroupRows(updated)
    })
  }, [selectedStrobe, dedicatedStrobeCount, createLightInstance])

  // Validate selectedLayout
  useEffect(() => {
    const isLayoutAvailable = availableLayouts.some((layout) => layout.id === selectedLayout)
    if (!isLayoutAvailable) {
      setSelectedLayout('front')
      setAssignedToBack('None')
    }
  }, [availableLayouts, selectedLayout])

  /** Working rig config for previews (matches save shape). */
  const currentLightingConfig = useMemo<LightingConfiguration>(() => {
    const lightLayout =
      LIGHT_LAYOUTS.find((layout) => layout.id === selectedLayout) || LIGHT_LAYOUTS[0]
    const finalFront = allPrimaryLights.filter((l) => l.group === 'front')
    const finalBack = allPrimaryLights.filter((l) => l.group === 'back')
    let finalStrobe: DmxLight[] = []
    if (selectedStrobe === ConfigStrobeType.AllCapable) {
      finalStrobe = allPrimaryLights.filter((l) => l.isStrobeEnabled && l.group !== 'strobe')
    } else if (selectedStrobe === ConfigStrobeType.Dedicated) {
      finalStrobe = allPrimaryLights.filter((l) => l.group === 'strobe')
    }
    return {
      numLights: selectedCount || 0,
      lightLayout,
      strobeType: selectedStrobe,
      frontLights: finalFront,
      backLights: finalBack,
      strobeLights: finalStrobe,
    }
  }, [allPrimaryLights, selectedCount, selectedLayout, selectedStrobe])

  const savedRig = useMemo(
    () => (activeRigId ? rigs.find((r) => r.id === activeRigId) : undefined),
    [rigs, activeRigId],
  )

  const isDirty = useMemo(() => {
    if (!savedRig) return false
    return (
      !lightingConfigsEqual(currentLightingConfig, savedRig.config) || rigName !== savedRig.name
    )
  }, [savedRig, currentLightingConfig, rigName])

  useLayoutEffect(() => {
    setLightsLayoutUnsaved(isDirty)
  }, [isDirty, setLightsLayoutUnsaved])

  useLayoutEffect(() => {
    return () => {
      setLightsLayoutUnsaved(false)
    }
  }, [setLightsLayoutUnsaved])

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const tryConfirmUnsaved = useCallback(async () => {
    if (!isDirty) return true
    return confirm({
      title: 'Unsaved changes',
      message: 'You have unsaved changes to this layout. Leave without saving?',
      confirmLabel: 'Discard changes',
      danger: true,
    })
  }, [isDirty, confirm])

  const {
    pendingImport,
    handleExport,
    handleImport,
    handleDuplicate,
    handleDelete,
    commitPendingImport,
    clearPendingImport,
  } = useRigImportExport({
    rigs,
    setRigs,
    activeRigId,
    setActiveRigId,
    setRigName,
    setActiveLightsConfig,
    myFixtureLibrary,
    setMyFixtureLibrary,
    onBeforeDiscardingUnsaved: tryConfirmUnsaved,
    isDirty,
    showToast,
    confirm,
  })

  //  Handlers for Updating Lights
  const handleLightChange = (updatedLight: DmxLight) => {
    setAllPrimaryLights((prev) =>
      prev.map((l) => (l.id === updatedLight.id ? { ...updatedLight } : l)),
    )
  }

  const drag = useLightsLayoutDrag(allPrimaryLights, setAllPrimaryLights)

  const handleLightClick = (lightPosition: number) => {
    setHighlightedLight(lightPosition)
  }

  const handleSaveChanges = async () => {
    if (!activeRigId) {
      log.error('No rig selected')
      return
    }

    const updatedConfig = buildRigConfigForSave(
      allPrimaryLights,
      selectedStrobe,
      selectedCount,
      selectedLayout,
    )

    const currentRig = rigs.find((r) => r.id === activeRigId)
    if (!currentRig) {
      showToast('No rig selected to save.', 'error', 4000)
      return
    }

    const updatedRig: DmxRig = {
      ...currentRig,
      name: rigName,
      config: updatedConfig,
    }

    try {
      const result = await saveDmxRig(updatedRig)
      if (!result.success) {
        showToast(result.error, 'error', 5000)
        return
      }

      // getDmxRigs() returns the backend-canonical rigs: migration + template-sync run on read
      // and materialize defaults (e.g. strobeValues/config) and recomputed channels that the
      // editor's raw config omits. Adopt that shape for both atoms so the editor baseline and the
      // saved rig the dirty check compares stay identical; the unsaved indicator then reflects
      // real edits only. Fall back to the local objects if the re-read fails or the rig is gone.
      // The editor takes the answer only while it still shows the saved rig, since the user can
      // pick another rig while main restarts.
      const applyToEditor = (config: LightingConfiguration): void => {
        if (store.get(activeRigIdAtom) === updatedRig.id) setActiveLightsConfig(config)
      }
      try {
        const freshRigs = await getDmxRigs()
        const freshRig = freshRigs.find((r) => r.id === updatedRig.id)
        if (freshRig) {
          setRigs(freshRigs)
          applyToEditor(freshRig.config)
        } else {
          applyToEditor(updatedConfig)
          setRigs((prev) => prev.map((r) => (r.id === updatedRig.id ? updatedRig : r)))
        }
      } catch (err) {
        log.error('Failed to refresh rigs after save, using local config', err)
        applyToEditor(updatedConfig)
        setRigs((prev) => prev.map((r) => (r.id === updatedRig.id ? updatedRig : r)))
      }

      setShowSuccessMessage(true)
      hideSuccessMessage.set()
    } catch (error) {
      log.error('Failed to save rig:', error)
      showToast('Failed to save rig.', 'error', 5000)
    }
  }

  // Build Dropdown Options for Assigned to Back
  const assignedToBackOptions = useMemo(() => {
    const opts = [{ value: 'None', label: 'None' }]
    for (let i = 1; i < (selectedCount || 0); i++) {
      opts.push({ value: i.toString(), label: `${i} Light${i > 1 ? 's' : ''}` })
    }
    return opts
  }, [selectedCount])

  const { frontCount, backCount } = splitLights(selectedCount || 0, assignedToBack)

  return (
    <div className="p-6 w-full mx-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200">
      {pendingImport !== null && (
        <ImportRigModal
          key={pendingImport.sourceBasename}
          isOpen
          sourceBasename={pendingImport.sourceBasename}
          defaultName={pendingImport.defaultName}
          existingRigNamesLower={new Set(rigs.map((r) => r.name.trim().toLowerCase()))}
          summary={pendingImport.summary}
          onCancel={clearPendingImport}
          onSave={(name) => void commitPendingImport(name)}
        />
      )}
      <LightsLayoutIntro
        headerRight={
          advancedModeEnabled ? (
            <>
              <button
                type="button"
                onClick={() => void handleImport()}
                title="Import a rig from a file"
                className={rigToolbarButton}>
                Import Layout
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={!activeRigId}
                title="Export the selected rig to a file"
                className={rigToolbarButton}>
                Export Layout
              </button>
            </>
          ) : undefined
        }
      />

      {/* Check if any lights are configured at all */}
      {myFixtureLibrary.length === 0 ? (
        <div className="mt-8 text-center text-lg font-semibold text-red-600">
          You need to configure some lights first.
        </div>
      ) : myFixtures.length === 0 ? (
        <div className="mt-8 text-center text-lg font-semibold text-orange-600">
          You have configured lights, but they need valid channel assignments. <br />
          Please go to My Lights and assign channel values greater than 0 to all channels for your
          lights.
        </div>
      ) : (
        <>
          {advancedModeEnabled && (
            <LightsLayoutRigSection
              rigs={rigs}
              activeRigId={activeRigId}
              setActiveRigId={setActiveRigId}
              rigName={rigName}
              setRigName={setRigName}
              onRigsChange={setRigs}
              onBeforeDiscardingUnsaved={tryConfirmUnsaved}
              onDuplicate={() => void handleDuplicate()}
              onDelete={() => void handleDelete()}
            />
          )}

          <LightsLayoutForm
            selectedCount={selectedCount}
            setSelectedCount={setSelectedCount}
            selectedLayout={selectedLayout}
            setSelectedLayout={setSelectedLayout}
            assignedToBack={assignedToBack}
            setAssignedToBack={setAssignedToBack}
            assignedToBackOptions={assignedToBackOptions}
            availableLayouts={availableLayouts}
            allPrimaryLightsCountBack={allPrimaryLights.filter((l) => l.group === 'back').length}
            selectedStrobe={selectedStrobe}
            setSelectedStrobe={setSelectedStrobe}
            dedicatedStrobeCount={dedicatedStrobeCount}
            setDedicatedStrobeCount={setDedicatedStrobeCount}
          />

          {/* Light Layout Preview */}
          <LightLayoutPreview
            layoutId={selectedLayout}
            frontCount={frontCount}
            backCount={backCount}
            highlightedLight={highlightedLight}
            selectedStrobe={selectedStrobe}
          />

          <LightsLayoutCanvas
            drag={drag}
            sharedRigChannels={sharedRigChannels}
            rigName={rigName}
            selectedLayout={selectedLayout}
            selectedStrobe={selectedStrobe}
            allPrimaryLights={allPrimaryLights}
            currentLightingConfig={currentLightingConfig}
            myFixtures={myFixtures}
            activeRigId={activeRigId}
            highlightedLight={highlightedLight}
            onLightClick={handleLightClick}
            onLightChange={handleLightChange}
          />

          {/* Success Message */}
          {showSuccessMessage && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-800 rounded">
              Changes saved successfully!
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={() => {
              setIsSaving(true)
              void handleSaveChanges().finally(() => setIsSaving(false))
            }}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 mt-4 mb-10">
            Save Changes
          </button>
        </>
      )}
    </div>
  )
}

export default LightsLayout
