import { describe, expect, it } from '@jest/globals'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { createMockRGBIP } from '../helpers/testFixtures'
import type { RGBIO } from '../../types'

describe('LightStateManager', () => {
  it('publishes the tracked light states to listeners', () => {
    const mgr = new LightStateManager()
    mgr.setLightState('l1', createMockRGBIP({ red: 255 }))
    let received: Map<string, RGBIO> | null = null
    mgr.on('LightStatesUpdated', (states: Map<string, RGBIO>) => {
      received = states
    })
    mgr.publishLightStates()
    expect(received).not.toBeNull()
    expect(received!.get('l1')?.red).toBe(255)
  })

  it('publishes read-only states under test so a mutating listener fails loudly (C-35 contract)', () => {
    const mgr = new LightStateManager()
    mgr.setLightState('l1', createMockRGBIP({ red: 128 }))
    let caught: unknown = null
    mgr.on('LightStatesUpdated', (states: Map<string, RGBIO>) => {
      try {
        const state = states.get('l1')!
        state.red = 0 // listeners must treat published state as read-only
      } catch (err) {
        caught = err
      }
    })
    mgr.publishLightStates()
    // The manager's own state is unchanged, and the offending mutation threw under test.
    expect(caught).toBeInstanceOf(TypeError)
    expect(mgr.getLightState('l1')?.red).toBe(128)
  })
})
