import * as React from 'react'
import { useBlackoutShortcut } from '../hooks/useBlackoutShortcut'
import { useMasterOutputSync } from '../hooks/useMasterOutputSync'

/**
 * The behaviour every Photonics window carries, whichever root it renders.
 *
 * Wrapping here rather than in each window root means a new window cannot quietly ship without the
 * blackout binding, which is the kind of control that has to be everywhere or it is not a panic
 * key at all.
 */
const WindowShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useMasterOutputSync()
  useBlackoutShortcut()
  return <>{children}</>
}

export default WindowShell
