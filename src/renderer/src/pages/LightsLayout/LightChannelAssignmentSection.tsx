import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable'
import LightChannelsConfig from '../../components/LightChannelsConfig'
import type { DmxLight, DmxFixture, LightingConfiguration } from '../../../../photonics-dmx/types'

const MountToggle: React.FC<{
  value: 'floor' | 'ceiling'
  onChange: (mount: 'floor' | 'ceiling') => void
  isStacked: boolean
}> = ({ value, onChange, isStacked }) => {
  const floorLabel = isStacked ? 'Above' : 'Floor'
  const ceilingLabel = isStacked ? 'Below' : 'Ceiling'
  return (
    <div
      className="inline-flex rounded border border-gray-400 dark:border-gray-500 p-0.5 mb-2 mx-auto"
      role="group"
      aria-label={isStacked ? 'Fixture placement on bar' : 'Fixture mount'}>
      <button
        type="button"
        className={`px-2 py-0.5 text-xs rounded ${value === 'floor' ? 'bg-white dark:bg-gray-600' : ''}`}
        onClick={() => onChange('floor')}>
        {floorLabel}
      </button>
      <button
        type="button"
        className={`px-2 py-0.5 text-xs rounded ${value === 'ceiling' ? 'bg-white dark:bg-gray-600' : ''}`}
        onClick={() => onChange('ceiling')}>
        {ceilingLabel}
      </button>
    </div>
  )
}

interface LightCardSharedProps {
  light: DmxLight
  index: number
  myLights: DmxFixture[]
  rigId: string | null
  lightingConfig: LightingConfiguration
  onLightChange: (light: DmxLight) => void
  highlightedLight: number | null
  onLightClick: (position: number) => void
  lightLabel: (light: DmxLight, index: number) => string
  isStacked: boolean
}

/** Non-sortable card (strobe section or lights missing an id). */
const StaticLightCard: React.FC<LightCardSharedProps> = ({
  light,
  index,
  myLights,
  rigId,
  lightingConfig,
  onLightChange,
  highlightedLight,
  onLightClick,
  lightLabel,
  isStacked,
}) => (
  <div className="flex flex-col rounded">
    <div className="text-center mb-2 font-semibold text-gray-800 dark:text-gray-200">
      {lightLabel(light, index)}
    </div>
    <div className="flex justify-center">
      <MountToggle
        value={light.mount ?? 'floor'}
        onChange={(mount) => onLightChange({ ...light, mount })}
        isStacked={isStacked}
      />
    </div>
    <LightChannelsConfig
      light={light}
      myLights={myLights}
      rigId={rigId}
      lightingConfig={lightingConfig}
      onChange={onLightChange}
      isHighlighted={highlightedLight === light.position}
      onClick={() => onLightClick(light.position)}
    />
  </div>
)

interface SortableLightCardProps extends LightCardSharedProps {
  id: string
  sectionGroup: 'front' | 'back'
}

const SortableLightCard: React.FC<SortableLightCardProps> = ({
  id,
  light,
  index,
  sectionGroup,
  myLights,
  rigId,
  lightingConfig,
  onLightChange,
  highlightedLight,
  onLightClick,
  lightLabel,
  isStacked,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: { group: sectionGroup },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const dragHandle = {
    setActivatorRef: setActivatorNodeRef,
    attributes,
    listeners,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col rounded ${isDragging ? 'opacity-50 z-[1]' : ''}`}>
      <div className="text-center mb-2 font-semibold text-gray-800 dark:text-gray-200">
        {lightLabel(light, index)}
      </div>
      <div className="flex justify-center">
        <MountToggle
          value={light.mount ?? 'floor'}
          onChange={(mount) => onLightChange({ ...light, mount })}
          isStacked={isStacked}
        />
      </div>
      <LightChannelsConfig
        light={light}
        myLights={myLights}
        rigId={rigId}
        lightingConfig={lightingConfig}
        onChange={onLightChange}
        isHighlighted={highlightedLight === light.position}
        onClick={() => onLightClick(light.position)}
        dragHandle={dragHandle}
      />
    </div>
  )
}

interface LightChannelAssignmentSectionProps {
  title: string
  lights: DmxLight[]
  myLights: DmxFixture[]
  rigId: string | null
  lightingConfig: LightingConfiguration
  onLightChange: (light: DmxLight) => void
  highlightedLight: number | null
  onLightClick: (position: number) => void
  lightLabel: (light: DmxLight, index: number) => string
  /** When true (stacked bar layout), mount toggle shows Above/Below instead of Floor/Ceiling. */
  isStacked: boolean
  /** When set, primary rows use sortable drag (handle only); requires ancestor `DndContext`. */
  sectionGroup?: 'front' | 'back'
}

const LightChannelAssignmentSection: React.FC<LightChannelAssignmentSectionProps> = ({
  title,
  lights,
  myLights,
  rigId,
  lightingConfig,
  onLightChange,
  highlightedLight,
  onLightClick,
  lightLabel,
  isStacked,
  sectionGroup,
}) => {
  const sortableIds = lights.map((l) => l.id).filter((id): id is string => Boolean(id))

  const shared: Omit<LightCardSharedProps, 'light' | 'index'> = {
    myLights,
    rigId,
    lightingConfig,
    onLightChange,
    highlightedLight,
    onLightClick,
    lightLabel,
    isStacked,
  }

  const grid = (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
      {lights.map((light, index) => {
        const rowKey = light.id ?? `idx-${index}`
        const useSortableRow = Boolean(sectionGroup && light.id)
        return useSortableRow ? (
          <SortableLightCard
            key={rowKey}
            id={light.id as string}
            sectionGroup={sectionGroup as 'front' | 'back'}
            light={light}
            index={index}
            {...shared}
          />
        ) : (
          <StaticLightCard key={rowKey} light={light} index={index} {...shared} />
        )
      })}
    </div>
  )

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">{title}</h2>
      {sectionGroup && sortableIds.length > 0 ? (
        <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
          {grid}
        </SortableContext>
      ) : (
        grid
      )}
    </div>
  )
}

export default LightChannelAssignmentSection
