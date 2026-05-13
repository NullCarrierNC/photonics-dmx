import { FaRegLightbulb, FaLightbulb } from 'react-icons/fa'
import { GiLightningFrequency } from 'react-icons/gi'
import { DmxFixture } from '../../../photonics-dmx/types'
import { IconType } from 'react-icons'

/**
 * Props for the LightIcon component
 */
interface LightIconProps {
  /** The fixture type that determines which icon to display */
  type: DmxFixture
}

/**
 * Component that displays an appropriate icon based on the fixture type
 * Renders different icons for different types of lighting fixtures
 *
 * @param props - Component props
 * @returns A React component rendering the appropriate icon
 */
export const LightIcon = ({ type }: LightIconProps): JSX.Element => {
  let IconComponent: IconType

  switch (type.fixture) {
    case 'rgb':
      IconComponent = FaRegLightbulb // Outline lightbulb icon for RGB
      break
    case 'rgbw':
      IconComponent = FaLightbulb // Solid lightbulb icon for RGBW
      break
    case 'strobe':
      IconComponent = GiLightningFrequency // Lightning frequency icon for Strobe
      break
    default:
      IconComponent = FaRegLightbulb // Default icon if fixture doesn't match any case
  }

  return <IconComponent size={40} className="text-gray-600 dark:text-gray-300" />
}
