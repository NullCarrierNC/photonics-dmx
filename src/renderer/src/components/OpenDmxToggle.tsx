import { useAtom } from 'jotai'
import { openDmxComPortAtom, senderOpenDmxEnabledAtom, lightingPrefsAtom } from '../atoms'
import { enableSender, disableSender } from '../ipcApi'
import { OPEN_DMX_DEFAULT_REFRESH_RATE_HZ } from '../../../shared/dmxOutputRefresh'
import { RoutedRigsHint } from './RoutedRigsHint'
import { createLogger } from '../../../shared/logger'
const log = createLogger('OpenDmxToggle')

interface OpenDmxToggleProps {
  disabled?: boolean
  compact?: boolean
}

const OpenDmxToggle = ({ disabled = false, compact = false }: OpenDmxToggleProps) => {
  const [isOpenDmxEnabled, setIsOpenDmxEnabled] = useAtom(senderOpenDmxEnabledAtom)
  const [comPort] = useAtom(openDmxComPortAtom)
  const [prefs] = useAtom(lightingPrefsAtom)
  const openDmxSpeed = prefs.openDmxConfig?.dmxSpeed ?? OPEN_DMX_DEFAULT_REFRESH_RATE_HZ

  const handleToggle = () => {
    const newState = !isOpenDmxEnabled
    setIsOpenDmxEnabled(newState)

    if (newState) {
      enableSender({ sender: 'opendmx', devicePath: comPort, dmxSpeed: openDmxSpeed })
      log.info('OpenDMX enabled')
    } else {
      disableSender({ sender: 'opendmx' })
      log.info('OpenDMX disabled')
    }
  }

  if (!prefs.dmxOutputConfig?.openDmxEnabled) {
    return null
  }

  return (
    <div className={compact ? 'flex flex-col gap-1 shrink-0' : 'flex flex-col mb-4 w-[190px]'}>
      <div
        className={
          compact
            ? 'flex items-center gap-2 justify-between'
            : 'flex items-center gap-4 justify-between'
        }>
        <label
          className={`${compact ? 'text-sm font-medium' : 'text-lg font-semibold'} ${
            disabled ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'
          }`}>
          OpenDMX Out
        </label>
        <button
          onClick={handleToggle}
          disabled={comPort.length < 3 || disabled}
          className={`${compact ? 'w-9 h-5' : 'w-12 h-6'} rounded-full transition-colors ${
            isOpenDmxEnabled ? 'bg-green-500' : 'bg-gray-400'
          } relative focus:outline-none ${
            comPort.length < 3 || disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}>
          <div
            className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} bg-white rounded-full shadow-md transform transition-transform duration-200 ${
              isOpenDmxEnabled ? (compact ? 'translate-x-4' : 'translate-x-6') : 'translate-x-0'
            }`}></div>
        </button>
      </div>
      <RoutedRigsHint senderId="opendmx" compact={compact} />
    </div>
  )
}

export default OpenDmxToggle
