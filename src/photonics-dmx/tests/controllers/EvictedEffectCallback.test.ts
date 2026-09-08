/**
 * What happens to a completion callback when its effect is evicted rather than finishing.
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'
import { getEffectSingleColor } from '../../effects/effectSingleColor'
import type { RGBIO } from '../../types'

const RED: RGBIO = {
  red: 255,
  green: 0,
  blue: 0,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
}

const BLUE: RGBIO = {
  red: 0,
  green: 0,
  blue: 255,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
}

describe('an effect evicted from its layer slot', () => {
  let harness: SequencerHarness

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
  })

  afterEach(() => harness.cleanup())

  const look = (color: RGBIO, layer: number): ReturnType<typeof getEffectSingleColor> =>
    getEffectSingleColor({
      color,
      duration: 2000,
      lights: harness.lightManager.getLights(['front'], 'all'),
      layer,
    })

  it('is told its run ended rather than left waiting', () => {
    const completions: boolean[] = []
    harness.sequencer.addEffectUnblockedNameWithCallback(
      'held',
      look(RED, 1),
      (cancelled) => completions.push(cancelled),
      false,
    )
    harness.advanceBy(50)

    // A differently named effect takes the same layer slot, which evicts the one holding it.
    harness.sequencer.addEffect('usurper', look(BLUE, 1))
    harness.advanceBy(50)

    expect(completions).toEqual([true])
  })

  it('stays waiting while the same name still runs on another layer', () => {
    const completions: boolean[] = []
    // One effect occupying two layers, so evicting one leaves the other running.
    const acrossTwoLayers = {
      ...look(RED, 1),
      transitions: [...look(RED, 1).transitions, ...look(RED, 2).transitions],
    }
    harness.sequencer.addEffectUnblockedNameWithCallback(
      'held',
      acrossTwoLayers,
      (cancelled) => completions.push(cancelled),
      false,
    )
    harness.advanceBy(50)

    harness.sequencer.addEffect('usurper', look(BLUE, 1))
    harness.advanceBy(50)

    expect(completions).toEqual([])
  })

  it('is told its run ended when a blackout wipes the rig', () => {
    const completions: boolean[] = []
    harness.sequencer.addEffectUnblockedNameWithCallback(
      'held',
      look(RED, 1),
      (cancelled) => completions.push(cancelled),
      false,
    )
    harness.advanceBy(50)

    void harness.sequencer.blackout(0)
    harness.advanceBy(50)

    expect(completions).toEqual([true])
  })

  it('stays waiting while a queued run of the same name takes over', () => {
    const completions: boolean[] = []
    harness.sequencer.addEffectUnblockedNameWithCallback(
      'held',
      look(RED, 1),
      (cancelled) => completions.push(cancelled),
      false,
    )
    harness.advanceBy(50)

    // Same name queues behind itself rather than evicting, so the run is not over.
    harness.sequencer.addEffect('held', look(BLUE, 1))
    harness.advanceBy(50)

    expect(completions).toEqual([])
  })
})
