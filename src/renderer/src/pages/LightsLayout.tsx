import { useState, useMemo, useEffect, useCallback, useLayoutEffect } from 'react'
import LightLayoutPreview from '../components/LightLayoutPreview'
import { useAtom, useSetAtom } from 'jotai'
import ToastContainer from '../components/Toast'

import {
  ConfigStrobeType,
  DmxLight,
  FixtureTypes,
  DmxRig,
  LightingConfiguration,
} from '../../../photonics-dmx/types'
import { castToChannelType } from '../../../photonics-dmx/helpers/dmxHelpers'
import {
  activeDmxLightsConfigAtom,
  myValidDmxLightsAtom,
  myDmxLightsAtom,
  dmxRigsAtom,
  activeRigIdAtom,
  lightsLayoutHasUnsavedChangesAtom,
} from '@renderer/atoms'
import LightsLayoutRigSection from './LightsLayout/LightsLayoutRigSection'
import LightsLayoutForm from './LightsLayout/LightsLayoutForm'
import LightChannelAssignmentSection from './LightsLayout/LightChannelAssignmentSection'
import LightsLayoutIntro from './LightsLayout/LightsLayoutIntro'
import { saveDmxRig } from '../ipcApi'
import {
  LIGHT_LAYOUTS,
  isTwoRowPrimaryLayout,
  splitLights,
  createDmxLightInstance,
  mapLightsToNewIdsForSave,
  lightingConfigsEqual,
} from './LightsLayout/lightsLayoutHelpers'
import {
  reassignNonStrobeGroups,
  mapDedicatedStrobeGroupRows,
} from './LightsLayout/lightsLayoutState'
import { useLightsLayoutRig } from './LightsLayout/useLightsLayoutRig'
import { useLightsLayoutActiveConfigSync } from './LightsLayout/useLightsLayoutActiveConfigSync'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../hooks/useConfirm'

/**
 * Handles the light layout and channel configuration.
 * @returns React component
 */
const LightsLayout = () => {
  const { toasts, showToast, hideToast } = useToast()
  const confirm = useConfirm()
  const [activeConfig, setActiveLightsConfig] = useAtom(activeDmxLightsConfigAtom)
  const [myFixtures] = useAtom(myValidDmxLightsAtom)
  const [myFixtureLibrary] = useAtom(myDmxLightsAtom)
  const [rigs, setRigs] = useAtom(dmxRigsAtom)
  const [activeRigId, setActiveRigId] = useAtom(activeRigIdAtom)
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

  const createLightInstance = useCallback(
    (group: 'front' | 'back' | 'strobe') => {
      return createDmxLightInstance(group, allPrimaryLights.length, myFixtures)
    },
    [allPrimaryLights.length, myFixtures],
  )

  useEffect(() => {
    setAllPrimaryLights((prev) => {
      // Separate non-strobe lights and strobe lights.
      const nonStrobeLights = prev.filter((l) => l.group !== 'strobe')
      const strobeLights = prev.filter((l) => l.group === 'strobe')

      const updated = [...nonStrobeLights]
      if (updated.length === 0) {
        // If no non-strobe lights are assigned, create them using the first fixture.
        if (myFixtures.length > 0 && selectedCount) {
          const firstFixture = myFixtures[0]
          for (let i = 0; i < selectedCount; i++) {
            // Calculate the new master dimmer channel
            const newMasterDimmer = 1 + i * 10

            // Calculate channel offsets from the template
            const templateChannels = firstFixture.channels
            const offsets: { [key: string]: number } = {}
            Object.entries(templateChannels).forEach(([channelName, value]) => {
              if (channelName !== 'masterDimmer') {
                offsets[channelName] = value - templateChannels.masterDimmer
              }
            })

            // Recalculate all channels using the new master dimmer and template offsets
            const recalculatedChannels: { [key: string]: number } = {}
            Object.entries(templateChannels).forEach(([channelName, _]) => {
              if (channelName === 'masterDimmer') {
                recalculatedChannels[channelName] = newMasterDimmer
              } else {
                recalculatedChannels[channelName] = newMasterDimmer + (offsets[channelName] || 0)
              }
            })

            // Cast the channels to the correct type based on the fixture
            const castChannels = castToChannelType(firstFixture.fixture, recalculatedChannels)

            updated.push({
              id: crypto.randomUUID(),
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
              mount: 'floor' as const,
            })
          }
        }
      } else {
        // Adjust the count only for non-strobe lights.
        if (selectedCount) {
          while (updated.length < selectedCount) {
            updated.push(createLightInstance('front'))
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
          const newStrobe = createLightInstance('strobe')
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

  // Memos for Front and Back Columns
  const frontLights = useMemo(() => {
    return allPrimaryLights.filter((l) => l.group === 'front')
  }, [allPrimaryLights])

  const backLights = useMemo(() => {
    return allPrimaryLights.filter((l) => l.group === 'back')
  }, [allPrimaryLights])

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

  // Memo Check for Physical Strobe Fixtures in Source Lights
  const hasPhysicalStrobe = useMemo(() => {
    return true
  }, [])

  //  Handlers for Updating Lights
  const handleLightChange = (updatedLight: DmxLight) => {
    setAllPrimaryLights((prev) =>
      prev.map((l) => (l.id === updatedLight.id ? { ...updatedLight } : l)),
    )
  }

  const handleLightClick = (lightPosition: number) => {
    setHighlightedLight(lightPosition)
  }

  const handleSaveChanges = async () => {
    if (!activeRigId) {
      console.error('No rig selected')
      return
    }

    // Decide final strobe set based on the strobe mode
    let finalStrobe: DmxLight[] = []

    if (selectedStrobe === ConfigStrobeType.AllCapable) {
      // All primary lights that are strobe-enabled
      finalStrobe = allPrimaryLights.filter((l) => l.isStrobeEnabled && l.group !== 'strobe')
    } else if (selectedStrobe === ConfigStrobeType.Dedicated) {
      // Only dedicated strobe group
      finalStrobe = allPrimaryLights.filter((l) => l.group === 'strobe')
    }
    // If "None", finalStrobe remains empty

    const finalFront = allPrimaryLights.filter((l) => l.group === 'front')
    const finalBack = allPrimaryLights.filter((l) => l.group === 'back')

    const idMap: Record<string, string> = {}

    const frontWithNewIds = mapLightsToNewIdsForSave(finalFront, idMap)
    const backWithNewIds = mapLightsToNewIdsForSave(finalBack, idMap)
    const strobeWithNewIds = mapLightsToNewIdsForSave(finalStrobe, idMap)

    const updatedConfig: LightingConfiguration = {
      numLights: selectedCount || 0,
      lightLayout: LIGHT_LAYOUTS.find((layout) => layout.id === selectedLayout) || LIGHT_LAYOUTS[0],
      strobeType: selectedStrobe,
      frontLights: frontWithNewIds,
      backLights: backWithNewIds,
      strobeLights: strobeWithNewIds,
    }

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

      setActiveLightsConfig(updatedConfig)
      setRigs((prev) => prev.map((r) => (r.id === activeRigId ? updatedRig : r)))

      setShowSuccessMessage(true)
      setTimeout(() => setShowSuccessMessage(false), 3000)
    } catch (error) {
      console.error('Failed to save rig:', error)
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
      <ToastContainer toasts={toasts} onDismiss={hideToast} />
      <LightsLayoutIntro />

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
          <LightsLayoutRigSection
            rigs={rigs}
            activeRigId={activeRigId}
            setActiveRigId={setActiveRigId}
            rigName={rigName}
            setRigName={setRigName}
            onRigsChange={setRigs}
            onBeforeDiscardingUnsaved={tryConfirmUnsaved}
          />

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
            hasPhysicalStrobe={hasPhysicalStrobe}
          />

          {/* Light Layout Preview */}
          <LightLayoutPreview
            layoutId={selectedLayout}
            frontCount={frontCount}
            backCount={backCount}
            highlightedLight={highlightedLight}
            selectedStrobe={selectedStrobe}
          />

          <div className="mt-8 space-y-8">
            <LightChannelAssignmentSection
              title={
                selectedLayout === 'stacked'
                  ? rigName
                    ? `${rigName} - Top Lights`
                    : 'Top Lights'
                  : rigName
                    ? `${rigName} - Front Lights`
                    : 'Front Lights'
              }
              lights={frontLights}
              myLights={myFixtures}
              rigId={activeRigId}
              lightingConfig={currentLightingConfig}
              onLightChange={handleLightChange}
              highlightedLight={highlightedLight}
              onLightClick={handleLightClick}
              lightLabel={(light, index) =>
                selectedLayout === 'stacked'
                  ? `Top ${index + 1} (Position ${light.position})`
                  : `Front ${index + 1} (Position ${light.position})`
              }
              isStacked={selectedLayout === 'stacked'}
            />

            {isTwoRowPrimaryLayout(selectedLayout) && backLights.length > 0 && (
              <LightChannelAssignmentSection
                title={
                  selectedLayout === 'stacked'
                    ? rigName
                      ? `${rigName} - Bottom Lights`
                      : 'Bottom Lights'
                    : rigName
                      ? `${rigName} - Back Lights`
                      : 'Back Lights'
                }
                lights={backLights}
                myLights={myFixtures}
                rigId={activeRigId}
                lightingConfig={currentLightingConfig}
                onLightChange={handleLightChange}
                highlightedLight={highlightedLight}
                onLightClick={handleLightClick}
                lightLabel={(light, index) =>
                  selectedLayout === 'stacked'
                    ? `Bottom ${index + 1} (Position ${light.position})`
                    : `Back ${index + 1} (Position ${light.position})`
                }
                isStacked={selectedLayout === 'stacked'}
              />
            )}

            {selectedStrobe === ConfigStrobeType.Dedicated &&
              allPrimaryLights.filter((l) => l.group === 'strobe').length > 0 && (
                <LightChannelAssignmentSection
                  title="Dedicated Strobe Lights"
                  lights={allPrimaryLights.filter((l) => l.group === 'strobe')}
                  myLights={myFixtures}
                  rigId={activeRigId}
                  lightingConfig={currentLightingConfig}
                  onLightChange={handleLightChange}
                  highlightedLight={highlightedLight}
                  onLightClick={handleLightClick}
                  lightLabel={(light) => `Dedicated Strobe (Position ${light.position})`}
                  isStacked={selectedLayout === 'stacked'}
                />
              )}
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
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mt-4 mb-10">
            Save Changes
          </button>
        </>
      )}
    </div>
  )
}

export default LightsLayout
