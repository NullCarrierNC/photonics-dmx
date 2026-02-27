import { useAtom } from 'jotai'
import { openDmxComPortAtom, senderOpenDmxEnabledAtom, lightingPrefsAtom } from '../atoms'
import { enableSender, disableSender } from '../ipcApi'

interface OpenDmxToggleProps {
  disabled?: boolean
}

const OpenDmxToggle = ({ disabled = false }: OpenDmxToggleProps) => {
  const [isOpenDmxEnabled, setIsOpenDmxEnabled] = useAtom(senderOpenDmxEnabledAtom)
  const [comPort] = useAtom(openDmxComPortAtom)
  const [prefs] = useAtom(lightingPrefsAtom)
  const openDmxSpeed = prefs.openDmxConfig?.dmxSpeed ?? 22

  const handleToggle = () => {
    const newState = !isOpenDmxEnabled
    setIsOpenDmxEnabled(newState)

    if (newState) {
      enableSender({ sender: 'opendmx', devicePath: comPort, dmxSpeed: openDmxSpeed })
      console.log('OpenDMX enabled')
    } else {
      disableSender({ sender: 'opendmx' })
      console.log('OpenDMX disabled')
    }
  }

  if (!prefs.dmxOutputConfig?.openDmxEnabled) {
    return null
  }

  return (
    <div className="flex flex-col gap-2 mb-4 w-[190px] justify-between">
      <div className="flex items-center gap-4 justify-between">
        <label
          className={`text-lg font-semibold ${
            disabled ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'
          }`}>
          OpenDMX Out
        </label>
        <button
          onClick={handleToggle}
          disabled={comPort.length < 3 || disabled}
          className={`w-12 h-6 rounded-full transition-colors ${
            isOpenDmxEnabled ? 'bg-green-500' : 'bg-gray-400'
          } relative focus:outline-none ${
            comPort.length < 3 || disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}>
          <div
            className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
              isOpenDmxEnabled ? 'translate-x-6' : 'translate-x-0'
            }`}></div>
        </button>
      </div>
      {isOpenDmxEnabled && (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          *OpenDMX USB adapters aren't recommended. You may experience flickering or other issues.
        </p>
      )}
    </div>
  )
}

export default OpenDmxToggle
