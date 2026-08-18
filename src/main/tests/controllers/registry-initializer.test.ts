import { afterEach, describe, expect, it, jest } from '@jest/globals'

// ConfigFile and the loaders resolve their base directory from app.getPath('appData').
jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photonics-test') },
}))
import { CueRegistry } from '../../../photonics-dmx/cues/registries/CueRegistry'
import { RegistryInitializer } from '../../controllers/RegistryInitializer'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'

describe('RegistryInitializer', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('initializeCueRegistry applies enabled groups and consistency window from preferences', async () => {
    const registry = {
      setEnabledGroups: jest.fn(),
      getAllGroups: jest.fn().mockReturnValue(['g1', 'g2']),
      setCueConsistencyWindow: jest.fn(),
      setCueGroupSelectionMode: jest.fn(),
      setDisabledCues: jest.fn(),
    }
    const getInstance = jest.spyOn(CueRegistry, 'getInstance').mockReturnValue(registry as never)

    const getPreference = jest.fn((k: string) => {
      if (k === 'cueDomains') {
        return {
          yarg: { enabledGroups: ['a'], knownGroups: [], disabledCues: { m: [] } },
        }
      }
      if (k === 'cueConsistencyWindow') return 120
      throw new Error(`unexpected key ${k}`)
    })
    const getCueGroupSelectionMode = jest.fn().mockReturnValue('oncePerSong' as const)
    const config = { getPreference, getCueGroupSelectionMode } as never
    const init = new RegistryInitializer({
      getConfig: () => config,
      runtimeBroadcaster: noopRuntimeBroadcaster(),
      sendToAllWindows: () => {
        // noop
      },
      pushValidationError: () => {
        // noop
      },
      refreshAudioCueSelection: () => {
        // noop
      },
      getNodeCueLoader: () => null,
      setNodeCueLoader: () => {
        // noop
      },
      getEffectLoader: () => null,
      setEffectLoader: () => {
        // noop
      },
    })

    await init.initializeCueRegistry('yarg')

    expect(getInstance).toHaveBeenCalled()
    expect(registry.setEnabledGroups).toHaveBeenCalledWith(['a'])
    expect(registry.setCueConsistencyWindow).toHaveBeenCalledWith(120)
    expect(registry.setCueGroupSelectionMode).toHaveBeenCalledWith('oncePerSong')
  })
})
