import { useAtom, useAtomValue } from 'jotai'
import {
  yargListenerEnabledAtom,
  rb3eListenerEnabledAtom,
  audioListenerEnabledAtom,
} from '../atoms'
import { enableYarg, disableYarg, enableRb3, disableRb3 } from '../ipcApi'
import { createLogger } from '../../../shared/logger'
import { ToggleSwitch } from './controls/ToggleSwitch'
import { isRunSwitchHeld } from './controls/runSwitchHold'
const log = createLogger('ListenerToggle')

/** What sets one game listener's switch apart from the other's. */
const LISTENERS = {
  yarg: {
    name: 'YARG',
    enabledAtom: yargListenerEnabledAtom,
    otherAtom: rb3eListenerEnabledAtom,
    enable: enableYarg,
    disable: disableYarg,
  },
  rb3: {
    name: 'RB3E',
    enabledAtom: rb3eListenerEnabledAtom,
    otherAtom: yargListenerEnabledAtom,
    enable: enableRb3,
    disable: disableRb3,
  },
} as const

interface ListenerToggleProps {
  listener: keyof typeof LISTENERS
  /**
   * Holds the switch off for a reason outside this listener. A running listener can still be
   * switched off.
   */
  notReady?: boolean
  disabled?: boolean
}

/**
 * The switch for one game listener. Only one listener runs at a time, so a stopped switch is held
 * while the other game listener or audio runs.
 */
const ListenerToggle = ({ listener, notReady = false, disabled = false }: ListenerToggleProps) => {
  const { name, enabledAtom, otherAtom, enable, disable } = LISTENERS[listener]
  const [isEnabled, setIsEnabled] = useAtom(enabledAtom)
  const isOtherEnabled = useAtomValue(otherAtom)
  const isAudioEnabled = useAtomValue(audioListenerEnabledAtom)
  const held = isRunSwitchHeld(isEnabled, notReady || isOtherEnabled || isAudioEnabled, disabled)

  const handleToggle = () => {
    const newState = !isEnabled
    setIsEnabled(newState)
    if (newState) {
      enable()
    } else {
      disable()
    }
    log.info(`${name} listener ${newState ? 'enabled' : 'disabled'}`)
  }

  return (
    <div className="mb-4 w-[190px]">
      <ToggleSwitch
        label={`Enable ${name}`}
        checked={isEnabled}
        onToggle={handleToggle}
        disabled={held}
      />
    </div>
  )
}

export default ListenerToggle
