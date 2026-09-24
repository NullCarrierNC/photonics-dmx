import { useAtom, useAtomValue } from 'jotai'
import { useId } from 'react'
import {
  yargListenerEnabledAtom,
  rb3eListenerEnabledAtom,
  audioListenerEnabledAtom,
} from '../atoms'
import { enableYarg, disableYarg, enableRb3, disableRb3 } from '../ipcApi'
import { createLogger } from '../../../shared/logger'
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
  disabled?: boolean
}

/**
 * The switch for one game listener. Only one listener runs at a time, so the switch is held while
 * the other game listener or audio runs.
 */
const ListenerToggle = ({ listener, disabled = false }: ListenerToggleProps) => {
  const { name, enabledAtom, otherAtom, enable, disable } = LISTENERS[listener]
  const [isEnabled, setIsEnabled] = useAtom(enabledAtom)
  const isOtherEnabled = useAtomValue(otherAtom)
  const isAudioEnabled = useAtomValue(audioListenerEnabledAtom)
  const labelId = useId()
  const held = isOtherEnabled || isAudioEnabled || disabled

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
    <div className="flex items-center mb-4 w-[190px] justify-between">
      <label
        id={labelId}
        className={`mr-4 text-lg font-semibold ${
          held ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'
        }`}>
        Enable {name}
      </label>
      <button
        role="switch"
        aria-checked={isEnabled}
        aria-labelledby={labelId}
        onClick={handleToggle}
        disabled={held}
        className={`w-12 h-6 rounded-full ${
          isEnabled ? 'bg-green-500' : 'bg-gray-400'
        } relative focus:outline-none ${held ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
        <div
          className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
            isEnabled ? 'translate-x-6' : 'translate-x-0'
          }`}></div>
      </button>
    </div>
  )
}

export default ListenerToggle
