import { useAtom } from 'jotai'
import { ENTTEC_PRO_DEFAULT_REFRESH_RATE_HZ } from '../../../shared/dmxOutputRefresh'
import { senderEnttecProEnabledAtom, enttecProComPortAtom, lightingPrefsAtom } from '../atoms'
import { enableSender } from '../ipcApi'
import SenderToggle from './controls/SenderToggle'

interface EnttecProToggleProps {
  disabled?: boolean
  compact?: boolean
}

const EnttecProToggle = ({ disabled = false, compact = false }: EnttecProToggleProps) => {
  const [comPort] = useAtom(enttecProComPortAtom)
  const [prefs] = useAtom(lightingPrefsAtom)
  const dmxSpeed = prefs.enttecProConfig?.dmxSpeed ?? ENTTEC_PRO_DEFAULT_REFRESH_RATE_HZ

  return (
    <SenderToggle
      senderId="enttecpro"
      label="Enttec Pro Out"
      runningAtom={senderEnttecProEnabledAtom}
      prefsFlag="enttecProEnabled"
      // Nothing to open until a COM port or device path is set.
      notReady={comPort.length < 3}
      disabled={disabled}
      compact={compact}
      enable={() => enableSender({ sender: 'enttecpro', devicePath: comPort, dmxSpeed })}
    />
  )
}

export default EnttecProToggle
