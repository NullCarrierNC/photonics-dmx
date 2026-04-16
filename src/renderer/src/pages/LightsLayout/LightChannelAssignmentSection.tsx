import React from 'react'
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
}) => (
  <div>
    <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">{title}</h2>
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      {lights.map((light, index) => (
        <div key={light.id} className="flex flex-col">
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
      ))}
    </div>
  </div>
)

export default LightChannelAssignmentSection
