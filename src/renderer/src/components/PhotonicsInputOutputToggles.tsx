import { useEffect, useState, useMemo } from 'react'
import { useAtom } from 'jotai'
import ListenerToggle from './ListenerToggle'
import AudioToggle from './AudioToggle'
import EnttecProToggle from './EnttecProToggle'
import SacnToggle from './SacnToggle'
import ArtNetToggle from './ArtNetToggle'
import OpenDmxToggle from './OpenDmxToggle'
import { FaChevronCircleDown, FaChevronCircleRight } from 'react-icons/fa'
import {
  audioListenerEnabledAtom,
  dmxRigsAtom,
  dmxRigsLoadedAtom,
  lightingPrefsAtom,
  myValidDmxLightsAtom,
} from '../atoms'
import { useLifecyclePhase, isLifecycleBusy } from '../hooks/useLifecyclePhase'

interface DmxSettingsProps {
  startOpen: boolean
}

const DmxSettingsAccordion = ({ startOpen }: DmxSettingsProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [validDmxLights] = useAtom(myValidDmxLightsAtom)
  const [prefs] = useAtom(lightingPrefsAtom)
  const [rigs] = useAtom(dmxRigsAtom)
  const [rigsLoaded] = useAtom(dmxRigsLoadedAtom)
  const advancedModeEnabled = prefs.advancedModeEnabled ?? false
  const [audioEnabled] = useAtom(audioListenerEnabledAtom)
  // Audio lives in Advanced Mode, but running audio holds the game listeners, so its switch stays
  // while it runs.
  const showAudioToggle = advancedModeEnabled || audioEnabled
  const lifecyclePhase = useLifecyclePhase()
  // Lock listener and sender toggles while the controller graph is mid-transition (restart, shutdown, failed, etc.).
  const lifecycleLocked = isLifecycleBusy(lifecyclePhase)

  useEffect(() => {
    setIsOpen(startOpen)
  }, [startOpen])

  const hasInvalidConfig = useMemo(() => validDmxLights.length === 0, [validDmxLights.length])
  const togglesDisabled = hasInvalidConfig || lifecycleLocked
  // With no active rig the controllers run an empty chain, so the switches work and nothing lights.
  const noActiveRig = rigsLoaded && !hasInvalidConfig && !rigs.some((rig) => rig.active)

  return (
    <div className=" rounded-lg shadow-sm mb-4">
      <button
        className="flex flex-row gap-4 items-center text-left font-semibold bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
        onClick={() => setIsOpen(!isOpen)}>
        <span>Input/Output Settings</span>
        {isOpen ? <FaChevronCircleDown size={20} /> : <FaChevronCircleRight size={20} />}
      </button>

      {isOpen && (
        <div className="p-4">
          {/* Game Input Listeners */}
          <div className="mb-6">
            <h3 className="text-md font-medium mb-3 text-gray-700 dark:text-gray-300">Input</h3>
            <div className="flex flex-row gap-8 items-start flex-wrap">
              <ListenerToggle listener="yarg" disabled={togglesDisabled} />
              <ListenerToggle listener="rb3" disabled={togglesDisabled} />
              {showAudioToggle && <AudioToggle disabled={togglesDisabled} />}
            </div>
          </div>

          {/* DMX Output Senders */}
          <div>
            <h3 className="text-md font-medium mb-3 text-gray-700 dark:text-gray-300">
              DMX Output
            </h3>
            <div className="flex flex-row gap-8 items-start flex-wrap">
              <SacnToggle disabled={togglesDisabled} />
              <ArtNetToggle disabled={togglesDisabled} />
              <EnttecProToggle disabled={togglesDisabled} />
              <OpenDmxToggle disabled={togglesDisabled} />
            </div>
          </div>
          {lifecyclePhase === 'failed' && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                The lighting controllers stopped after an error, so these switches are locked. Press
                Retry on the banner to restart them.
              </p>
            </div>
          )}
          {noActiveRig && (
            <div
              role="status"
              className="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                No rig is active, so nothing reaches your lights. Create and activate a rig in
                Lights Layout.
              </p>
            </div>
          )}
          {hasInvalidConfig && (
            <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    You must configure your lights in My Lights and Lights Layout first.
                  </h3>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DmxSettingsAccordion
