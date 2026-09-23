import { useAtom } from 'jotai'
import { useId } from 'react'
import {
  rb3eListenerEnabledAtom,
  yargListenerEnabledAtom,
  audioListenerEnabledAtom,
} from '../atoms'
import { enableRb3, disableRb3, setAudioEnabled } from '../ipcApi'
import { createLogger } from '../../../shared/logger'
const log = createLogger('Rb3Toggle')

interface Rb3ToggleProps {
  disabled?: boolean
}

const Rb3Toggle = ({ disabled = false }: Rb3ToggleProps) => {
  const [isRb3Enabled, setIsRb3Enabled] = useAtom(rb3eListenerEnabledAtom)
  const [isYargEnabled] = useAtom(yargListenerEnabledAtom)
  const [isAudioEnabled, setIsAudioEnabled] = useAtom(audioListenerEnabledAtom)
  const labelId = useId()

  const handleToggle = () => {
    const newState = !isRb3Enabled
    setIsRb3Enabled(newState)

    if (newState) {
      enableRb3()
      log.info('RB3E Listener enabled')
      // Disable Audio when RB3E is enabled (mutual exclusion)
      if (isAudioEnabled) {
        setIsAudioEnabled(false)
        setAudioEnabled(false).catch((error) =>
          log.error('Failed to disable audio alongside RB3:', error),
        )
      }
    } else {
      disableRb3()
      log.info('rb3e Listener disabled')
    }
  }

  return (
    <div className="flex items-center mb-4  w-[190px] justify-between">
      <label
        id={labelId}
        className={`mr-4 text-lg font-semibold ${
          isYargEnabled || isAudioEnabled || disabled
            ? 'text-gray-500'
            : 'text-gray-900 dark:text-gray-100'
        }`}>
        Enable RB3E
      </label>
      <button
        role="switch"
        aria-checked={isRb3Enabled}
        aria-labelledby={labelId}
        onClick={handleToggle}
        disabled={isYargEnabled || isAudioEnabled || disabled}
        className={`w-12 h-6 rounded-full ${
          isRb3Enabled ? 'bg-green-500' : 'bg-gray-400'
        } relative focus:outline-none ${
          isYargEnabled || isAudioEnabled || disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer'
        }`}>
        <div
          className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
            isRb3Enabled ? 'translate-x-6' : 'translate-x-0'
          }`}></div>
      </button>
    </div>
  )
}

export default Rb3Toggle
