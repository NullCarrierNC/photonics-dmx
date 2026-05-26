import { useAtom } from 'jotai'
import { enttecProComPortAtom, senderEnttecProEnabledAtom, lightingPrefsAtom } from '../atoms'
import { enableSender, disableSender } from '../ipcApi'
import { RoutedRigsHint } from './RoutedRigsHint'
import { createLogger } from '../../../shared/logger'
const log = createLogger('EnttecProToggle')

interface EnttecProToggleProps {
  disabled?: boolean
  compact?: boolean
}

const EnttecProToggle = ({ disabled = false, compact = false }: EnttecProToggleProps) => {
  const [isEnttecProEnabled, setIsEnttecProEnabled] = useAtom(senderEnttecProEnabledAtom)
  const [comPort] = useAtom(enttecProComPortAtom)
  const [prefs] = useAtom(lightingPrefsAtom)

  const handleToggle = () => {
    const newState = !isEnttecProEnabled
    setIsEnttecProEnabled(newState)

    if (newState) {
      enableSender({ sender: 'enttecpro', devicePath: comPort })
      log.info('EnttecPro enabled')
    } else {
      disableSender({ sender: 'enttecpro' })
      log.info('EnttecPro disabled')
    }
  }

  // Only show the toggle if Enttec Pro is enabled in preferences
  if (!prefs.dmxOutputConfig?.enttecProEnabled) {
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
          Enttec Pro Out
        </label>
        <button
          onClick={handleToggle}
          disabled={comPort.length < 3 || disabled}
          className={`${compact ? 'w-9 h-5' : 'w-12 h-6'} rounded-full transition-colors ${
            isEnttecProEnabled ? 'bg-green-500' : 'bg-gray-400'
          } relative focus:outline-none ${
            comPort.length < 3 || disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}>
          <div
            className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} bg-white rounded-full shadow-md transform transition-transform duration-200 ${
              isEnttecProEnabled ? (compact ? 'translate-x-4' : 'translate-x-6') : 'translate-x-0'
            }`}></div>
        </button>
      </div>
      <RoutedRigsHint senderId="enttecpro" compact={compact} />
    </div>
  )
}

export default EnttecProToggle
