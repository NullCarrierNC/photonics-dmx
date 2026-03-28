import React from 'react'
import LightChannelsConfig from '../../components/LightChannelsConfig'
import type { DmxLight, DmxFixture } from '../../../../photonics-dmx/types'

interface LightChannelAssignmentSectionProps {
  title: string
  lights: DmxLight[]
  myLights: DmxFixture[]
  onLightChange: (light: DmxLight) => void
  highlightedLight: number | null
  onLightClick: (position: number) => void
  lightLabel: (light: DmxLight, index: number) => string
}

const LightChannelAssignmentSection: React.FC<LightChannelAssignmentSectionProps> = ({
  title,
  lights,
  myLights,
  onLightChange,
  highlightedLight,
  onLightClick,
  lightLabel,
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
          <LightChannelsConfig
            light={light}
            myLights={myLights}
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
