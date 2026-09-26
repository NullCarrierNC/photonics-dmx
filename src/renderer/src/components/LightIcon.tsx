import { FaRegLightbulb } from 'react-icons/fa'
import { GiLightningFrequency } from 'react-icons/gi'
import { FixtureTypes, type DmxFixture } from '../../../photonics-dmx/types'

/**
 * Props for the LightIcon component
 */
interface LightIconProps {
  /** The fixture type that determines which icon to display */
  type: DmxFixture
}

/**
 * Component that displays an appropriate icon based on the fixture type: a lightbulb for the
 * colour fixtures and lightning for a strobe.
 *
 * @param props - Component props
 * @returns A React component rendering the appropriate icon
 */
export const LightIcon = ({ type }: LightIconProps): JSX.Element => {
  const className = 'text-gray-600 dark:text-gray-300'
  switch (type.fixture) {
    case FixtureTypes.RGB:
    case FixtureTypes.RGBMH:
      return <FaRegLightbulb size={40} className={className} />
    case FixtureTypes.STROBE:
      return <GiLightningFrequency size={40} className={className} />
  }
}
