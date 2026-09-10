import { useAtom } from 'jotai'
import { openDmxComPortAtom, senderOpenDmxEnabledAtom, lightingPrefsAtom } from '../atoms'
import { enableSender } from '../ipcApi'
import { OPEN_DMX_DEFAULT_REFRESH_RATE_HZ } from '../../../shared/dmxOutputRefresh'
import SenderToggle from './controls/SenderToggle'

interface OpenDmxToggleProps {
  disabled?: boolean
  compact?: boolean
}

const OpenDmxToggle = ({ disabled = false, compact = false }: OpenDmxToggleProps) => {
  const [comPort] = useAtom(openDmxComPortAtom)
  const [prefs] = useAtom(lightingPrefsAtom)
  const dmxSpeed = prefs.openDmxConfig?.dmxSpeed ?? OPEN_DMX_DEFAULT_REFRESH_RATE_HZ

  return (
    <SenderToggle
      senderId="opendmx"
      label="OpenDMX Out"
      runningAtom={senderOpenDmxEnabledAtom}
      prefsFlag="openDmxEnabled"
      disabled={disabled}
      compact={compact}
      enable={() => enableSender({ sender: 'opendmx', devicePath: comPort, dmxSpeed })}
    />
  )
}

export default OpenDmxToggle
