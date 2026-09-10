import { useAtom } from 'jotai'
import { senderSacnEnabledAtom, sacnConfigAtom } from '../atoms'
import { enableSender } from '../ipcApi'
import SenderToggle from './controls/SenderToggle'

interface SacnToggleProps {
  disabled?: boolean
  /** Smaller label and switch for inline rows (e.g. calibration wizard). */
  compact?: boolean
}

const SacnToggle = ({ disabled = false, compact = false }: SacnToggleProps) => {
  const [sacnConfig] = useAtom(sacnConfigAtom)

  return (
    <SenderToggle
      senderId="sacn"
      label="sACN Out"
      runningAtom={senderSacnEnabledAtom}
      prefsFlag="sacnEnabled"
      disabled={disabled}
      compact={compact}
      enable={() =>
        enableSender({
          sender: 'sacn',
          universe: sacnConfig.universe,
          networkInterface:
            sacnConfig.networkInterface === '' ? undefined : sacnConfig.networkInterface,
          unicastDestination: sacnConfig.unicastDestination || '',
          useUnicast: sacnConfig.useUnicast || false,
          refreshRateHz: sacnConfig.refreshRateHz,
        })
      }
    />
  )
}

export default SacnToggle
