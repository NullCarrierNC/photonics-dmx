import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'
import { getEffectSingleColor } from '../../effects/effectSingleColor'
import type { RGBIO } from '../../types'

const RED: RGBIO = { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1, blendMode: 'replace' }
const GREEN: RGBIO = { ...RED, red: 0, green: 255 }
const MOTION_LAYER = 120

describe('a moving head aim', () => {
  let h: SequencerHarness
  let pans: Array<number | undefined>

  beforeEach(() => {
    h = createSequencerHarness({ frontCount: 2, backCount: 2 })
    pans = []
    h.lightStateManager.onLightStatesUpdated((states) => {
      pans.push(states.get(h.frontLightIds[0])?.pan)
    })
  })

  afterEach(() => h.cleanup())

  const lights = () => h.lightManager.getLights(['front', 'back'], 'all')

  const show = (color: RGBIO): void => {
    h.sequencer.setEffect(
      'look',
      getEffectSingleColor({ color, duration: 0, lights: lights(), layer: 0 }),
    )
  }

  const aim = (name: string, pan: number, duration: number): void => {
    h.sequencer.addEffect(
      name,
      getEffectSingleColor({
        color: { ...RED, intensity: 0, opacity: 0, pan, tilt: 40 },
        duration,
        lights: lights(),
        layer: MOTION_LAYER,
      }),
    )
  }

  const pan = (): number | undefined => h.getLightState(h.frontLightIds[0])?.pan

  /** Runs the clock in 10 ms frames, as the engine's own clock does. */
  const run = (ms: number): void => {
    for (let elapsed = 0; elapsed < ms; elapsed += 10) h.advanceBy(10)
  }

  it('holds the aim a finished move left', () => {
    show(RED)
    aim('aim', 60, 200)
    run(600)

    expect(pan()).toBe(60)
  })

  it('eases the next move from the aim the last one left', () => {
    show(RED)
    aim('first', 20, 100)
    run(300)

    aim('second', 80, 1000)
    run(100)

    expect(pan()).toBeGreaterThan(20)
    expect(pan()).toBeLessThan(40)
  })

  it('keeps the heads aimed through a set that replaces the look', () => {
    show(RED)
    aim('aim', 60, 0)
    run(100)
    pans = []

    show(GREEN)
    run(100)

    expect(pans.length).toBeGreaterThan(0)
    expect(pans.every((p) => p === 60)).toBe(true)
    expect(h.getLightState(h.frontLightIds[0])).toMatchObject({ green: 255, red: 0 })
  })

  it('finishes a move through a set that replaces the look', () => {
    show(RED)
    aim('first', 20, 0)
    run(100)
    aim('second', 80, 1000)
    run(500)

    show(GREEN)
    run(100)
    expect(pan()).toBeGreaterThan(50)
    run(600)

    expect(pan()).toBe(80)
  })

  it('lets the heads go home on an explicit clear', () => {
    show(RED)
    aim('aim', 60, 0)
    run(100)

    h.sequencer.removeAllEffects()
    run(50)

    expect(pan()).toBeUndefined()
  })
})
