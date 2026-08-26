import { jest } from '@jest/globals'

/**
 * Wire the collaborator getters the IPC setup functions call onto a flat mock manager.
 *
 * The IPC layer reaches console, test-effect, listener and sender surfaces through
 * `getConsoleModeController()`, `getTestEffectRunner(domain)`, `getListenerLifecycle()` and
 * `getSenderLifecycle()`. The mocks in these suites are flat objects with jest.fn members named
 * after the old delegate methods; this maps each collaborator method back onto the flat member
 * (when the suite defined one, so its assertions keep observing calls) or a fresh jest.fn.
 */
export function withCollaboratorGetters<T extends Record<string, unknown>>(mock: T): T {
  const m = mock as Record<string, unknown>
  const flat = (name: string): unknown => m[name] ?? jest.fn()

  if (!('getConsoleModeController' in m)) {
    m.getConsoleModeController = () => ({
      setOnConsoleEnter: flat('setOnConsoleEnter'),
      sendConsoleDmx: flat('sendConsoleDmx'),
      updateConsoleChannel: flat('updateConsoleChannel'),
      setConsoleHome: flat('setConsoleHome'),
      setConsoleFixtureConfig: flat('setConsoleFixtureConfig'),
    })
  }
  if (!('getTestEffectRunner' in m)) {
    m.getTestEffectRunner = (domain: 'yarg' | 'rb3') =>
      domain === 'rb3'
        ? {
            startTestEffect: flat('startRb3TestEffect'),
            setRb3LedState: flat('setRb3SimulationLedState'),
          }
        : { startTestEffect: flat('startTestEffect'), setRb3LedState: jest.fn() }
  }
  if (!('getListenerLifecycle' in m)) {
    m.getListenerLifecycle = () => ({
      yargRb3: {
        getRb3Mode: flat('getRb3Mode'),
        getRb3ProcessorStats: flat('getRb3ProcessorStats'),
      },
      audio: {
        getAudioCueOptions: flat('getAudioCueOptions'),
        getActiveAudioCueType: flat('getActiveAudioCueType'),
        getActiveSecondaryCueType: flat('getActiveSecondaryCueType'),
        setActiveAudioCueType: flat('setActiveAudioCueType'),
        getAudioGameModeConfig: flat('getAudioGameModeConfig'),
        setAudioGameModeConfig: flat('setAudioGameModeConfig'),
        setActiveAudioMotionCueRef: flat('setActiveAudioMotionCueRef'),
        updateAudioConfig: flat('updateAudioConfig'),
        setBroadcastAudioMirror: flat('setAudioMirrorBroadcaster'),
      },
    })
  }
  if (!('getSenderLifecycle' in m)) {
    m.getSenderLifecycle = () => ({
      setSenderErrorTrackingCallback: flat('setSenderErrorTrackingCallback'),
    })
  }
  return mock
}
