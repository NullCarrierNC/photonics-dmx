/**
 * The cue consistency window is the one preference two lighting registries share. Startup reaches
 * each registry through its own binding and a preference change reaches all of them through
 * applyCueConsistencyWindow, so these pin the two paths to the same set of registries.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const yargRegistry = {
  getAllGroups: jest.fn(() => ['stagekit']),
  setEnabledGroups: jest.fn(),
  setCueConsistencyWindow: jest.fn(),
  setCueGroupSelectionMode: jest.fn(),
  setDisabledCues: jest.fn(),
  setStageKitPriority: jest.fn(),
}

const rb3Registry = {
  setCueConsistencyWindow: jest.fn(),
  setCueGroupSelectionMode: jest.fn(),
}

jest.mock('../../../photonics-dmx/cues/registries/CueRegistry', () => ({
  CueRegistry: { getInstance: () => yargRegistry },
}))
jest.mock('../../../photonics-dmx/cues/registries/cueRegistries', () => ({
  getCueRegistry: (domain: string) => (domain === 'rb3' ? rb3Registry : yargRegistry),
}))

import {
  CUE_DOMAIN_BINDINGS,
  applyCueConsistencyWindow,
  cueDomainBinding,
} from '../../controllers/cueDomainBindings'

const STORED_WINDOW = 7500

const config = {
  getPreference: (key: string) => {
    if (key === 'cueConsistencyWindow') return STORED_WINDOW
    if (key === 'stageKitPrefs') return { yargPriority: 'random' }
    if (key === 'cueDomains') {
      return {
        yarg: { enabledGroups: ['stagekit'], knownGroups: ['stagekit'], disabledCues: {} },
        rb3: { enabledGroups: [], knownGroups: [], disabledCues: {}, selectionMode: 'withinSong' },
      }
    }
    throw new Error(`unexpected key ${key}`)
  },
  getCueGroupSelectionMode: () => 'withinSong' as const,
} as never

/** Which mocked registry a binding's applier writes to, discovered rather than assumed. */
function registryBehind(applier: (windowMs: number) => void): {
  setCueConsistencyWindow: jest.Mock
} {
  const probe = -1
  applier(probe)
  const target = [yargRegistry, rb3Registry].find((r) =>
    r.setCueConsistencyWindow.mock.calls.some(([ms]) => ms === probe),
  )
  if (!target) {
    throw new Error('binding applied the window to neither registry')
  }
  return target as never
}

describe('cue consistency window', () => {
  beforeEach(() => {
    yargRegistry.setCueConsistencyWindow.mockClear()
    rb3Registry.setCueConsistencyWindow.mockClear()
  })

  it('reaches both lighting registries on a preference change', () => {
    applyCueConsistencyWindow(4200)
    expect(yargRegistry.setCueConsistencyWindow).toHaveBeenCalledWith(4200)
    expect(rb3Registry.setCueConsistencyWindow).toHaveBeenCalledWith(4200)
  })

  it('declares the applier on exactly the domains whose startup hook applies the window', async () => {
    const declaring = CUE_DOMAIN_BINDINGS.filter((b) => b.applyConsistencyWindow)
    // Pins the declaring set, so the loop below always has both domains to check.
    expect(declaring.map((b) => b.domain)).toEqual(['yarg', 'rb3'])
    for (const binding of declaring) {
      const target = registryBehind(binding.applyConsistencyWindow!)
      target.setCueConsistencyWindow.mockClear()
      await binding.applyStartupSettings?.(config)
      expect(target.setCueConsistencyWindow).toHaveBeenCalledWith(STORED_WINDOW)
    }
  })

  it('applies the stored window to the RB3 registry at startup', async () => {
    await cueDomainBinding('rb3').applyStartupSettings?.(config)
    expect(rb3Registry.setCueConsistencyWindow).toHaveBeenCalledWith(STORED_WINDOW)
  })
})
