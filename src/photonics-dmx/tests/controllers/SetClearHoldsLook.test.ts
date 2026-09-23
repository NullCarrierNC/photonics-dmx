import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  createSequencerHarness,
  ManualTestClock,
  type SequencerHarness,
} from '../helpers/sequencerHarness'
import { getEffectSingleColor } from '../../effects/effectSingleColor'
import { Sequencer } from '../../controllers/sequencer/Sequencer'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxLight,
  type DmxRig,
  type LightingConfiguration,
  type RGBIO,
} from '../../types'

const RED: RGBIO = { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1, blendMode: 'replace' }
const GREEN: RGBIO = {
  red: 0,
  green: 255,
  blue: 0,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
}

type Published = Array<{ id: string; red: number; green: number; intensity: number }>

describe('a set that replaces the look', () => {
  let h: SequencerHarness
  let published: Published[]

  beforeEach(() => {
    h = createSequencerHarness({ frontCount: 2, backCount: 2 })
    published = []
    h.lightStateManager.onLightStatesUpdated((states) => {
      published.push(
        [...states].map(([id, s]) => ({ id, red: s.red, green: s.green, intensity: s.intensity })),
      )
    })
  })

  afterEach(() => h.cleanup())

  const show = (name: string, color: RGBIO, duration = 0, ids = h.allLightIds): void => {
    h.sequencer.setEffect(
      name,
      getEffectSingleColor({
        color,
        duration,
        lights: h.lightManager
          .getLights(['front', 'back'], 'all')
          .filter((l) => ids.includes(l.id)),
        layer: 0,
      }),
    )
  }

  const allDark = (frame: Published): boolean => frame.every((s) => s.intensity === 0)

  it('publishes no frame with every light dark on a hard cut between two lit looks', () => {
    show('red', RED)
    h.advanceBy(50)
    published = []

    show('green', GREEN)
    h.advanceBy(10)
    h.advanceBy(10)

    expect(published.some(allDark)).toBe(false)
    expect(h.getLightState(h.frontLightIds[0])).toMatchObject({ green: 255, red: 0 })
  })

  it('publishes nothing dark when the new look is the colour already showing', () => {
    show('red', RED)
    h.advanceBy(50)
    published = []

    show('red again', RED)
    h.advanceBy(10)

    expect(published.flat().every((s) => s.intensity > 0)).toBe(true)
  })

  it('starts a fade into the new look from the look showing', () => {
    show('red', RED)
    h.advanceBy(50)

    show('green', GREEN, 300)
    h.advanceBy(10)

    const light = h.getLightState(h.frontLightIds[0])
    expect(light?.red ?? 0).toBeGreaterThan(200)
    expect(light?.intensity ?? 0).toBeGreaterThan(200)
  })

  it('darkens a light the new look does not draw after one frame', () => {
    show('red', RED)
    h.advanceBy(50)

    show('green on one', GREEN, 0, [h.frontLightIds[0]])
    h.advanceBy(10)

    expect(h.getLightState(h.frontLightIds[0])).toMatchObject({ green: 255 })
    for (const id of h.allLightIds.slice(1)) {
      expect(h.getLightState(id)?.intensity).toBe(0)
    }
  })

  it('blacks the rig out at once on an explicit clear', () => {
    show('red', RED)
    h.advanceBy(50)

    h.sequencer.removeAllEffects()

    expect(h.allLightIds.every((id) => h.getLightState(id)?.intensity === 0)).toBe(true)
  })
})

function rgbLight(id: string, group: 'front' | 'back', position: number, base: number): DmxLight {
  return {
    id,
    fixtureId: 'rgb',
    position,
    name: id,
    label: id,
    fixture: FixtureTypes.RGB,
    isStrobeEnabled: false,
    group,
    universe: 1,
    mount: 'floor',
    channels: { masterDimmer: base, red: base + 1, green: base + 2, blue: base + 3 },
  } as DmxLight
}

describe('a primary cue change on the wire', () => {
  it('sends no universe with every light dark between two lit looks', async () => {
    const clock = new ManualTestClock(10)
    const nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => clock.getCurrentTimeMs())
    const lights = [1, 2, 3, 4].map((i) =>
      rgbLight(`l${i}`, i <= 2 ? 'front' : 'back', i, (i - 1) * 4 + 1),
    )
    const config: LightingConfiguration = {
      numLights: 4,
      lightLayout: { id: 'front-back', label: 'Front and back' },
      strobeType: ConfigStrobeType.None,
      frontLights: lights.slice(0, 2),
      backLights: lights.slice(2),
      strobeLights: [],
    }
    const rig: DmxRig = { id: 'rig', name: 'rig', active: true, config }
    const lightManager = new DmxLightManager(config, 'rig', 'rig')
    const lightStateManager = new LightStateManager()
    const sequencer = new Sequencer(new LightTransitionController(lightStateManager), clock)

    // The publisher's deferred sends run on the same manual clock as the sequencer.
    let nextTimer = 1
    const timers = new Map<number, { due: number; run: () => void }>()
    const runDueTimers = (): void => {
      for (const [id, timer] of [...timers].sort(([, a], [, b]) => a.due - b.due)) {
        if (timer.due <= clock.getCurrentTimeMs()) {
          timers.delete(id)
          timer.run()
        }
      }
    }
    const sent: Array<Record<number, number>> = []
    const sender = {
      send: (_id: string, universe: Record<number, number>) => {
        sent.push({ ...universe })
        return Promise.resolve(true)
      },
      sendIpc: () => {},
      getEnabledWireSenders: () => ['sacn'],
      isIpcEnabled: () => false,
    }
    const publisher = new DmxPublisher(sender as never, null, new StrobeStateManager(), {
      outputRateHz: 44,
      timing: {
        now: () => clock.getCurrentTimeMs(),
        setTimer: (run, ms) => {
          const id = nextTimer++
          timers.set(id, { due: clock.getCurrentTimeMs() + ms, run })
          return id as never
        },
        clearTimer: (handle) => {
          timers.delete(handle as unknown as number)
        },
      },
    })
    publisher.setRigChains([{ rigId: 'rig', lightStateManager }])
    publisher.updateActiveRigs([rig])
    // The publisher sends each tick's states from a microtask, so each tick lets those run.
    const advance = async (ms: number): Promise<void> => {
      for (let t = 0; t < ms; t += 10) {
        clock.tick(10)
        await Promise.resolve()
        runDueTimers()
        await Promise.resolve()
      }
    }
    const show = (name: string, color: RGBIO): void =>
      sequencer.setEffect(
        name,
        getEffectSingleColor({
          color,
          duration: 0,
          lights: lightManager.getLights(['front', 'back'], 'all'),
          layer: 0,
        }),
      )
    const lit = (universe: Record<number, number>): number =>
      lights.filter((l) => {
        const c = l.channels as { masterDimmer: number; red: number; green: number }
        return (
          (universe[c.masterDimmer] ?? 0) > 0 &&
          Math.max(universe[c.red] ?? 0, universe[c.green] ?? 0) > 0
        )
      }).length

    try {
      show('red', RED)
      await advance(200)
      const cutAt = sent.length
      show('green', GREEN)
      await Promise.resolve()
      await advance(200)

      expect(lit(sent[cutAt - 1])).toBe(4)
      expect(sent.slice(cutAt).map(lit)).not.toContain(0)
    } finally {
      publisher.shutdown()
      sequencer.shutdown()
      nowSpy.mockRestore()
    }
  })
})
