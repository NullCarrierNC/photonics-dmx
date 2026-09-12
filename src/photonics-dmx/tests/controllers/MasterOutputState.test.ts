import { describe, expect, it } from '@jest/globals'
import {
  DEFAULT_MASTER_DIMMER_PERCENT,
  MasterOutputState,
} from '../../controllers/MasterOutputState'

describe('MasterOutputState', () => {
  it('starts at full output with strobes enabled and no blackout', () => {
    const state = new MasterOutputState()

    expect(state.getSnapshot()).toEqual({
      dimmerPercent: DEFAULT_MASTER_DIMMER_PERCENT,
      blackout: false,
      strobeOutputEnabled: true,
    })
    expect(state.getOutputPercent()).toBe(100)
  })

  it('clamps and rounds the dimmer level', () => {
    const state = new MasterOutputState()

    state.setDimmerPercent(140)
    expect(state.getDimmerPercent()).toBe(100)

    state.setDimmerPercent(-20)
    expect(state.getDimmerPercent()).toBe(0)

    state.setDimmerPercent(42.6)
    expect(state.getDimmerPercent()).toBe(43)
  })

  it('ignores a non-finite level rather than darkening the rig', () => {
    const state = new MasterOutputState()
    state.setDimmerPercent(60)

    state.setDimmerPercent(Number.NaN)
    state.setDimmerPercent(Number.POSITIVE_INFINITY)

    expect(state.getDimmerPercent()).toBe(60)
  })

  it('overrides the level while blacked out and gives it back on release', () => {
    const state = new MasterOutputState()
    state.setDimmerPercent(70)

    state.setBlackout(true)
    expect(state.getOutputPercent()).toBe(0)
    // The fader itself has not moved, which is what lets the operator come back up where they were.
    expect(state.getDimmerPercent()).toBe(70)

    state.setBlackout(false)
    expect(state.getOutputPercent()).toBe(70)
  })

  it('tracks the strobe output gate independently of the dimmer', () => {
    const state = new MasterOutputState()

    state.setStrobeOutputEnabled(false)
    state.setDimmerPercent(50)

    expect(state.isStrobeOutputEnabled()).toBe(false)
    expect(state.getOutputPercent()).toBe(50)
  })
})
