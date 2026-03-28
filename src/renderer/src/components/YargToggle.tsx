import { useAtom } from 'jotai'
import { useEffect } from 'react'
import {
  yargListenerEnabledAtom,
  rb3eListenerEnabledAtom,
  audioListenerEnabledAtom,
} from '../atoms'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { getSystemStatus, enableYarg, disableYarg, setAudioEnabled } from '../ipcApi'

interface YargToggleProps {
  disabled?: boolean
}

const YargToggle = ({ disabled = false }: YargToggleProps) => {
  const [isYargEnabled, setIsYargEnabled] = useAtom(yargListenerEnabledAtom)
  const [isRb3Enabled] = useAtom(rb3eListenerEnabledAtom)
  const [isAudioEnabled, setIsAudioEnabled] = useAtom(audioListenerEnabledAtom)

  useEffect(() => {
    // Initialize toggle state from system status
    const initializeState = async () => {
      try {
        const response = await getSystemStatus()
        if (response.success) {
          setIsYargEnabled(response.isYargEnabled)
        }
      } catch (error) {
        console.error('Error initializing YARG toggle state:', error)
      }
    }

    // Handle controllers restarted event
    const handleControllersRestarted = () => {
      console.log('Controllers restarted, refreshing YARG toggle state')
      initializeState()
    }

    const cleanup = registerIpcListener(
      RENDERER_RECEIVE.CONTROLLERS_RESTARTED,
      handleControllersRestarted,
    )

    // Initialize on mount
    initializeState()

    return cleanup
  }, [setIsYargEnabled])

  const handleToggle = () => {
    const newState = !isYargEnabled
    setIsYargEnabled(newState)

    if (newState) {
      enableYarg()
      console.log('YARG Listener enabled')
      // Disable Audio when YARG is enabled (mutual exclusion)
      if (isAudioEnabled) {
        setIsAudioEnabled(false)
        setAudioEnabled(false)
      }
    } else {
      disableYarg()
      console.log('YARG Listener disabled')
    }
  }

  return (
    <div className="flex items-center mb-4 w-[190px] justify-between">
      <label
        className={`mr-4 text-lg font-semibold ${
          isRb3Enabled || isAudioEnabled || disabled
            ? 'text-gray-500'
            : 'text-gray-900 dark:text-gray-100'
        }`}>
        Enable YARG
      </label>
      <button
        onClick={handleToggle}
        disabled={isRb3Enabled || isAudioEnabled || disabled}
        className={`w-12 h-6 rounded-full ${
          isYargEnabled ? 'bg-green-500' : 'bg-gray-400'
        } relative focus:outline-none ${
          isRb3Enabled || isAudioEnabled || disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer'
        }`}>
        <div
          className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
            isYargEnabled ? 'translate-x-6' : 'translate-x-0'
          }`}></div>
      </button>
    </div>
  )
}

export default YargToggle
