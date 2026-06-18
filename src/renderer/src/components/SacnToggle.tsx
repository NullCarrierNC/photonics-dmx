import { useAtom } from 'jotai'
import { senderSacnEnabledAtom, sacnConfigAtom, lightingPrefsAtom } from '../atoms'
import { enableSender, disableSender } from '../ipcApi'
import { RoutedRigsHint } from './RoutedRigsHint'
import { createLogger } from '../../../shared/logger'
const log = createLogger('SacnToggle')

interface SacnToggleProps {
  disabled?: boolean
  /** Smaller label and switch for inline rows (e.g. calibration wizard). */
  compact?: boolean
}

const SacnToggle = ({ disabled = false, compact = false }: SacnToggleProps) => {
  const [isSacnEnabled, setIsSacnEnabled] = useAtom(senderSacnEnabledAtom)
  const [prefs] = useAtom(lightingPrefsAtom)
  const [sacnConfig] = useAtom(sacnConfigAtom)

  const handleToggle = () => {
    const newState = !isSacnEnabled
    setIsSacnEnabled(newState)

    if (newState) {
      const networkInterface = sacnConfig.networkInterface
      enableSender({
        sender: 'sacn',
        universe: sacnConfig.universe,
        networkInterface: networkInterface === '' ? undefined : networkInterface,
        unicastDestination: sacnConfig.unicastDestination || '',
        useUnicast: sacnConfig.useUnicast || false,
        refreshRateHz: sacnConfig.refreshRateHz,
      })
      log.info('sACN enabled with config:', sacnConfig)
    } else {
      disableSender({ sender: 'sacn' })
      log.info('sACN disabled')
    }
  }

  // Only show the toggle if sACN is enabled in preferences
  if (!prefs.dmxOutputConfig?.sacnEnabled) {
    return null
  }

  return (
    <div className={compact ? 'flex flex-col shrink-0' : 'flex flex-col mb-4 w-[190px]'}>
      <div className={compact ? 'flex items-center gap-2' : 'flex items-center justify-between'}>
        <label
          className={`${compact ? 'mr-0 text-sm font-medium' : 'mr-4 text-lg font-semibold'} ${
            disabled ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'
          }`}>
          sACN Out
        </label>
        <button
          onClick={handleToggle}
          disabled={disabled}
          className={`${compact ? 'w-9 h-5' : 'w-12 h-6'} rounded-full ${
            isSacnEnabled ? 'bg-green-500' : 'bg-gray-400'
          } relative focus:outline-none ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}>
          <div
            className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} bg-white rounded-full shadow-md transform transition-transform duration-200 ${
              isSacnEnabled ? (compact ? 'translate-x-4' : 'translate-x-6') : 'translate-x-0'
            }`}></div>
        </button>
      </div>
      <RoutedRigsHint senderId="sacn" compact={compact} />
    </div>
  )
}

export default SacnToggle
