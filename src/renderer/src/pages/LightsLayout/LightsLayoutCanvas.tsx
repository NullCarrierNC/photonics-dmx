/**
 * The layout canvas: the rows of lights, the shared-channel warning above them, and the overlay
 * that follows a light while it is dragged.
 */
import React, { useMemo } from 'react'
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core'
import LightChannelAssignmentSection from './LightChannelAssignmentSection'
import { isTwoRowPrimaryLayout } from './lightsLayoutHelpers'
import type { LightsLayoutDrag } from './useLightsLayoutDrag'
import { ConfigStrobeType } from '../../../../photonics-dmx/types'
import type { DmxLight, LightingConfiguration, SavedFixture } from '../../../../photonics-dmx/types'

interface LightsLayoutCanvasProps {
  drag: LightsLayoutDrag
  /** Channel numbers claimed by more than one light, which the rig warns about. */
  sharedRigChannels: number[]
  rigName: string
  selectedLayout: string
  selectedStrobe: ConfigStrobeType
  allPrimaryLights: DmxLight[]
  currentLightingConfig: LightingConfiguration
  myFixtures: SavedFixture[]
  activeRigId: string | null
  highlightedLight: number | null
  onLightClick: (position: number) => void
  onLightChange: (light: DmxLight) => void
}

const LightsLayoutCanvas: React.FC<LightsLayoutCanvasProps> = ({
  drag: {
    sensors,
    dropAnimation,
    activeDragLight,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  },
  sharedRigChannels,
  rigName,
  selectedLayout,
  selectedStrobe,
  allPrimaryLights,
  currentLightingConfig,
  myFixtures,
  activeRigId,
  highlightedLight,
  onLightClick: handleLightClick,
  onLightChange: handleLightChange,
}) => {
  // Sorted by global position so the grid order stays stable after a swap.
  const frontLights = useMemo(
    () =>
      allPrimaryLights.filter((l) => l.group === 'front').sort((a, b) => a.position - b.position),
    [allPrimaryLights],
  )
  const backLights = useMemo(
    () =>
      allPrimaryLights.filter((l) => l.group === 'back').sort((a, b) => a.position - b.position),
    [allPrimaryLights],
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}>
      <div className="mt-8 space-y-8">
        {sharedRigChannels.length > 0 && (
          <div
            role="status"
            className="rounded border border-amber-500 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {sharedRigChannels.length === 1
              ? `DMX channel ${sharedRigChannels[0]} is used by more than one light in this rig.`
              : `DMX channels ${sharedRigChannels.join(', ')} are each used by more than one light in this rig.`}{' '}
            This will cause a conflict between the lights and incorrect lighting output.
          </div>
        )}
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
          sectionGroup="front"
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
            sectionGroup="back"
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
      <DragOverlay dropAnimation={dropAnimation}>
        {activeDragLight ? (
          <div className="max-w-[440px] rounded-lg shadow-2xl border-2 border-blue-500 bg-gray-300 dark:bg-[#303548] p-4 pointer-events-none">
            <div className="text-center font-semibold text-gray-800 dark:text-gray-200">
              {activeDragLight.label} (Position {activeDragLight.position})
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

export default LightsLayoutCanvas
