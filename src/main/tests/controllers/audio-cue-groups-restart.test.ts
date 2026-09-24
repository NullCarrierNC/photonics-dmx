import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { CueDomainPrefs } from '../../../services/configuration/cueDomainTypes'

const audioRegistry = {
  groups: ['audio-a', 'audio-b'],
  enabled: [] as string[],
  getAllGroups: () => audioRegistry.groups,
  setEnabledGroups: (ids: string[]) => {
    audioRegistry.enabled = ids
  },
  setDisabledCues: jest.fn(),
}

jest.mock('../../../photonics-dmx/cues/registries/AudioCueRegistry', () => ({
  AudioCueRegistry: { getInstance: () => audioRegistry },
}))

import { cueDomainBinding, reconcileAndApplyGroups } from '../../controllers/cueDomainBindings'

/** A preferences store holding only the audio cue domain, with its writes recorded. */
function storeWith(audio: { enabledGroups: string[]; knownGroups: string[] }) {
  let stored = { ...audio, disabledCues: {} }
  const updateCueDomain = jest.fn(async (_domain: string, patch: Partial<CueDomainPrefs>) => {
    stored = { ...stored, ...patch }
  })
  const config = {
    getPreference: () => ({ audio: stored }),
    updateCueDomain,
  } as never
  return { config, updateCueDomain, stored: () => stored }
}

/** The controller init: startup settings on the registry, then the reconcile. */
async function initAudioGroups(config: never): Promise<void> {
  const audio = cueDomainBinding('audio')
  await audio.applyStartupSettings?.(config)
  await reconcileAndApplyGroups(audio, config)
}

describe('audio cue groups through a controller init', () => {
  beforeEach(() => {
    audioRegistry.enabled = []
  })

  it('keeps every group unticked across a restart', async () => {
    const { config, updateCueDomain, stored } = storeWith({
      enabledGroups: [],
      knownGroups: ['audio-a', 'audio-b'],
    })

    await initAudioGroups(config)

    expect(audioRegistry.enabled).toEqual([])
    expect(updateCueDomain).not.toHaveBeenCalled()
    expect(stored().enabledGroups).toEqual([])
  })

  it('enables and stores every group on a first run', async () => {
    const { config, stored } = storeWith({ enabledGroups: [], knownGroups: [] })

    await initAudioGroups(config)

    expect(audioRegistry.enabled).toEqual(['audio-a', 'audio-b'])
    expect(stored()).toMatchObject({
      enabledGroups: ['audio-a', 'audio-b'],
      knownGroups: ['audio-a', 'audio-b'],
    })
  })
})
