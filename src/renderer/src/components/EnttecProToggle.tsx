import { useAtom } from 'jotai'
import { senderEnttecProEnabledAtom, enttecProComPortAtom } from '../atoms'
import { enableSender } from '../ipcApi'
import SenderToggle from './controls/SenderToggle'

interface EnttecProToggleProps {
  disabled?: boolean
  compact?: boolean
}

const EnttecProToggle = ({ disabled = false, compact = false }: EnttecProToggleProps) => {
  const [comPort] = useAtom(enttecProComPortAtom)

  return (
    <SenderToggle
      senderId="enttecpro"
      label="Enttec Pro Out"
      runningAtom={senderEnttecProEnabledAtom}
      prefsFlag="enttecProEnabled"
      disabled={disabled}
      compact={compact}
      enable={() => enableSender({ sender: 'enttecpro', devicePath: comPort })}
    />
  )
}

export default EnttecProToggle
