import { getColor } from '../../helpers/dmxHelpers'
import { createSequencerHarness } from '../helpers/sequencerHarness'
import type { Effect } from '../../types'
import type { LightEffectState } from '../../controllers/sequencer/interfaces'

const buildSingleLayerEffect = (
  lights: Effect['transitions'][number]['lights'],
  layer: number,
  color: Effect['transitions'][number]['transform']['color'],
  duration: number,
  easing: Effect['transitions'][number]['transform']['easing'],
): Effect => ({
  id: 'test-effect',
  description: 'test effect',
  transitions: [
    {
      lights,
      layer,
      waitForCondition: 'none',
      waitForTime: 0,
      waitUntilCondition: 'none',
      waitUntilTime: 0,
      transform: {
        color,
        duration,
        easing,
      },
    },
  ],
})

/**
 * Two layer-1 transitions, each targeting one light: 20ms on the first light and 200ms on the
 * second, so the first light finishes while the second is still running.
 */
const buildStaggeredEffect = (
  lights: Effect['transitions'][number]['lights'],
  color: Effect['transitions'][number]['transform']['color'],
): Effect => ({
  id: 'staggered',
  description: 'staggered two-light effect',
  transitions: [
    {
      lights: [lights[0]],
      layer: 1,
      waitForCondition: 'none',
      waitForTime: 0,
      waitUntilCondition: 'none',
      waitUntilTime: 0,
      transform: { color, duration: 20, easing: 'linear' },
    },
    {
      lights: [lights[1]],
      layer: 1,
      waitForCondition: 'none',
      waitForTime: 0,
      waitUntilCondition: 'none',
      waitUntilTime: 0,
      transform: { color, duration: 200, easing: 'linear' },
    },
  ],
})

type Harness = ReturnType<typeof createSequencerHarness>

/** How many lights hold a queued entry on a layer. */
const queuedCount = (harness: Harness, layer = 1): number =>
  (
    harness.sequencer as unknown as {
      layerManager: { getEffectQueue: () => Map<number, Map<string, unknown>> }
    }
  ).layerManager
    .getEffectQueue()
    .get(layer)?.size ?? 0

/** Runs frames until the predicate holds or the budget runs out. */
const advanceUntil = (harness: Harness, done: () => boolean, frames = 60, ms = 10): void => {
  for (let i = 0; i < frames && !done(); i += 1) {
    harness.advanceBy(ms)
  }
}

describe('Sequencer blending and queueing (real harness)', () => {
  it('blends add vs replace with opacity', () => {
    const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])

    const baseColor = { ...getColor('blue', 'high', 'replace'), opacity: 1 }
    const addColor = { ...getColor('red', 'high', 'add'), opacity: 0.5 }

    harness.sequencer.addEffect('base', buildSingleLayerEffect(lights, 0, baseColor, 0, 'linear'))
    harness.sequencer.addEffect('overlay', buildSingleLayerEffect(lights, 1, addColor, 0, 'linear'))
    harness.advanceBy(1)

    const state = harness.getLightState(lights[0].id)
    expect(state?.red ?? 0).toBeGreaterThan(0)
    expect(state?.blue ?? 0).toBeGreaterThan(0)

    harness.cleanup()
  })

  it('mix crossfades an overlay over a base (blue base + yellow mix overlay)', () => {
    // Mirrors YARG Alt 1 > Score: steady blue base + yellow flash overlay using 'mix'.
    const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const blueBase = { ...getColor('blue', 'high', 'replace'), opacity: 1 }

    harness.sequencer.addEffect('base', buildSingleLayerEffect(lights, 0, blueBase, 0, 'linear'))

    // Mid-crossfade (opacity 0.5): blue and yellow both present — not pure white, not black.
    harness.sequencer.addEffect(
      'flash',
      buildSingleLayerEffect(
        lights,
        1,
        { ...getColor('yellow', 'high', 'mix'), opacity: 0.5 },
        0,
        'linear',
      ),
    )
    harness.advanceBy(1)
    const mid = harness.getLightState(lights[0].id)
    expect(mid?.red ?? 0).toBeGreaterThan(0) // yellow fading in
    expect(mid?.green ?? 0).toBeGreaterThan(0)
    expect(mid?.blue ?? 0).toBeGreaterThan(0) // blue base still showing through

    // Peak (opacity 1): pure yellow, blue fully replaced.
    harness.sequencer.addEffect(
      'flash',
      buildSingleLayerEffect(
        lights,
        1,
        { ...getColor('yellow', 'high', 'mix'), opacity: 1 },
        0,
        'linear',
      ),
    )
    harness.advanceBy(1)
    const peak = harness.getLightState(lights[0].id)
    expect(peak?.red ?? 0).toBeGreaterThan(0)
    expect(peak?.green ?? 0).toBeGreaterThan(0)
    expect(peak?.blue ?? 0).toBe(0) // pure yellow, not white

    harness.cleanup()
  })

  it('produces different mid-transition values for easing', () => {
    const sampleMidValue = (
      easing: Effect['transitions'][number]['transform']['easing'],
    ): number => {
      const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
      const lights = harness.lightManager.getLights(['front'], ['all'])
      const color = { ...getColor('red', 'high', 'replace'), opacity: 1 }

      harness.sequencer.addEffect('ease', buildSingleLayerEffect(lights, 0, color, 100, easing))
      harness.advanceBy(25)

      const state = harness.getLightState(lights[0].id)
      const value = state?.red ?? 0
      harness.cleanup()
      return value
    }

    const linearMid = sampleMidValue('linear')
    const sinMid = sampleMidValue('sinInOut')
    expect(sinMid).toBeLessThan(linearMid)
  })

  it('queues effects with the same name on a layer', () => {
    const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const colorA = { ...getColor('red', 'high', 'replace'), opacity: 1 }
    const colorB = { ...getColor('blue', 'high', 'replace'), opacity: 1 }

    const effectA = buildSingleLayerEffect(lights, 1, colorA, 50, 'linear')
    const effectB = buildSingleLayerEffect(lights, 1, colorB, 50, 'linear')

    harness.sequencer.addEffect('queue-test', effectA)
    harness.sequencer.addEffect('queue-test', effectB)

    const layerManager = (
      harness.sequencer as unknown as {
        layerManager: { getEffectQueue: () => Map<number, Map<string, unknown>> }
      }
    ).layerManager
    const queue = layerManager.getEffectQueue().get(1)
    expect(queue?.size ?? 0).toBeGreaterThan(0)

    harness.cleanup()
  })

  it('requeues persistent effects after completion', () => {
    const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const color = { ...getColor('green', 'high', 'replace'), opacity: 1 }

    const effect = buildSingleLayerEffect(lights, 1, color, 20, 'linear')
    harness.sequencer.addEffect('persistent-test', effect, true)
    harness.advanceBy(1)

    const lightId = lights[0].id
    expect(harness.sequencer.getActiveEffectsForLight(lightId).has(1)).toBe(true)

    let sawRestart = false
    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(20)
      if (harness.sequencer.getActiveEffectsForLight(lightId).has(1)) {
        sawRestart = true
        break
      }
    }
    expect(sawRestart).toBe(true)

    harness.cleanup()
  })

  it('keeps a queued persistent effect attached to its run when it starts', () => {
    // Re-adding a persistent effect under its own name queues it, and the queued light is already
    // counted in the new run's light total. If it starts without that run id it never reports its
    // completion, leaving the run a light short so it can never restart.
    //
    // Staggered durations let the two lights leave the queue on different frames: the shorter light
    // starts its entry while the other is still running its first pass.
    const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const colorA = { ...getColor('red', 'high', 'replace'), opacity: 1 }
    const colorB = { ...getColor('blue', 'high', 'replace'), opacity: 1 }

    harness.sequencer.addEffect('loop-test', buildStaggeredEffect(lights, colorA), true)
    harness.sequencer.addEffect('loop-test', buildStaggeredEffect(lights, colorB), true)

    const layerManager = (
      harness.sequencer as unknown as {
        layerManager: { getEffectQueue: () => Map<number, Map<string, unknown>> }
      }
    ).layerManager
    const queueSize = (): number => layerManager.getEffectQueue().get(1)?.size ?? 0
    expect(queueSize()).toBe(2)

    // Advance to the moment the short light's entry leaves the queue and starts.
    const shortLightId = lights[0].id
    for (let i = 0; i < 12 && queueSize() === 2; i += 1) {
      harness.advanceBy(10)
    }
    expect(queueSize()).toBe(1)

    const state = harness.sequencer.getActiveEffectsForLight(shortLightId).get(1)
    expect(state?.isPersistent).toBe(true)
    expect(state?.effectRunId).toBeDefined()

    harness.cleanup()
  })

  it('starts a queued staggered effect on both lights, each with only its own transitions', () => {
    const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const colorA = { ...getColor('red', 'high', 'replace'), opacity: 1 }
    const colorB = { ...getColor('blue', 'high', 'replace'), opacity: 1 }
    const queued = buildStaggeredEffect(lights, colorB)

    harness.sequencer.addEffect('stagger-test', buildStaggeredEffect(lights, colorA))
    harness.sequencer.addEffect('stagger-test', queued)

    // The light ids each light's queued start was given transitions for.
    const startedTargets = new Map<string, string[]>()
    for (let i = 0; i < 40 && startedTargets.size < lights.length; i += 1) {
      harness.advanceBy(10)
      for (const light of lights) {
        const state = harness.sequencer.getActiveEffectsForLight(light.id).get(1)
        if (state?.effect === queued && !startedTargets.has(light.id)) {
          startedTargets.set(
            light.id,
            state.transitions.flatMap((t) => t.lights.map((l) => l.id)),
          )
        }
      }
    }

    expect(startedTargets.get(lights[0].id)).toEqual([lights[0].id])
    expect(startedTargets.get(lights[1].id)).toEqual([lights[1].id])

    harness.cleanup()
  })

  it('restarts a persistent staggered run after its queued lights finish', () => {
    // The persistent run is queued behind a one-shot run of the same name, so only its queued
    // entries can start the lights. It restarts once both have reported completion against its id.
    const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const [shortLightId, longLightId] = lights.map((l) => l.id)
    const colorA = { ...getColor('red', 'high', 'replace'), opacity: 1 }
    const colorB = { ...getColor('blue', 'high', 'replace'), opacity: 1 }
    const layer1 = (lightId: string): LightEffectState | undefined =>
      harness.sequencer.getActiveEffectsForLight(lightId).get(1)

    harness.sequencer.addEffect('restart-test', buildStaggeredEffect(lights, colorA))
    harness.sequencer.addEffect('restart-test', buildStaggeredEffect(lights, colorB), true)

    // The short light starts its queued entry first.
    for (let i = 0; i < 12 && layer1(shortLightId)?.effectRunId === undefined; i += 1) {
      harness.advanceBy(10)
    }
    const runId = layer1(shortLightId)?.effectRunId
    expect(runId).toBeDefined()

    // It finishes and stays idle while the long light works through its own run and queued entry.
    for (let i = 0; i < 12 && layer1(shortLightId) !== undefined; i += 1) {
      harness.advanceBy(10)
    }
    expect(layer1(shortLightId)).toBeUndefined()

    for (let i = 0; i < 60 && layer1(shortLightId) === undefined; i += 1) {
      harness.advanceBy(10)
    }
    expect(layer1(shortLightId)?.effectRunId).toBe(runId)
    expect(layer1(longLightId)?.effectRunId).toBe(runId)

    harness.cleanup()
  })

  describe('a later submission of a name supersedes its persistent run', () => {
    const colorA = { ...getColor('red', 'high', 'replace'), opacity: 1 }
    const colorB = { ...getColor('blue', 'high', 'replace'), opacity: 1 }
    const colorC = { ...getColor('green', 'high', 'replace'), opacity: 1 }

    /** The effect running on layer 1 for this light, if any. */
    const layer1Effect = (harness: Harness, lightId: string): Effect | undefined =>
      harness.sequencer.getActiveEffectsForLight(lightId).get(1)?.effect

    it('drains the queue behind a single-light persistent effect', () => {
      const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
      const lights = harness.lightManager.getLights(['front'], ['all'])
      const lightId = lights[0].id
      const first = buildSingleLayerEffect(lights, 1, colorA, 20, 'linear')
      const queued = buildSingleLayerEffect(lights, 1, colorB, 20, 'linear')

      harness.sequencer.addEffect('loop-test', first, true)
      harness.sequencer.addEffect('loop-test', queued, true)
      expect(queuedCount(harness)).toBe(1)

      advanceUntil(harness, () => queuedCount(harness) === 0, 20)
      expect(queuedCount(harness)).toBe(0)

      // Only the queued effect loops from here.
      const seen = new Set<Effect>()
      for (let i = 0; i < 40; i += 1) {
        harness.advanceBy(10)
        const running = layer1Effect(harness, lightId)
        if (running) seen.add(running)
      }
      expect([...seen]).toEqual([queued])

      harness.cleanup()
    })

    it('drains both lights of a staggered persistent effect', () => {
      const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
      const lights = harness.lightManager.getLights(['front'], ['all'])
      const queued = buildStaggeredEffect(lights, colorB)

      harness.sequencer.addEffect('loop-test', buildStaggeredEffect(lights, colorA), true)
      harness.sequencer.addEffect('loop-test', queued, true)
      expect(queuedCount(harness)).toBe(2)

      const ranQueued = new Set<string>()
      advanceUntil(
        harness,
        () => {
          for (const l of lights) {
            if (layer1Effect(harness, l.id) === queued) ranQueued.add(l.id)
          }
          return queuedCount(harness) === 0 && ranQueued.size === lights.length
        },
        120,
      )

      expect(queuedCount(harness)).toBe(0)
      expect([...ranQueued].sort()).toEqual(lights.map((l) => l.id).sort())

      harness.cleanup()
    })

    it('ends the loop when the queued submission is not persistent', () => {
      const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
      const lights = harness.lightManager.getLights(['front'], ['all'])
      const lightId = lights[0].id
      const queued = buildSingleLayerEffect(lights, 1, colorB, 20, 'linear')

      harness.sequencer.addEffect(
        'loop-test',
        buildSingleLayerEffect(lights, 1, colorA, 20, 'linear'),
        true,
      )
      harness.sequencer.addEffect('loop-test', queued)

      let sawQueued = false
      advanceUntil(
        harness,
        () => {
          sawQueued = sawQueued || layer1Effect(harness, lightId) === queued
          return sawQueued && layer1Effect(harness, lightId) === undefined
        },
        40,
      )

      expect(sawQueued).toBe(true)
      // The queued pass was the last one: nothing restarts the light.
      advanceUntil(harness, () => false, 20)
      expect(layer1Effect(harness, lightId)).toBeUndefined()
      expect(queuedCount(harness)).toBe(0)

      harness.cleanup()
    })

    it('lets a completion callback resubmission take over the loop', () => {
      const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
      const lights = harness.lightManager.getLights(['front'], ['all'])
      const lightId = lights[0].id
      const first = buildSingleLayerEffect(lights, 1, colorA, 20, 'linear')
      const replacement = buildSingleLayerEffect(lights, 1, colorB, 20, 'linear')

      let resubmitted = false
      harness.sequencer.addEffectWithCallback(
        'loop-test',
        first,
        () => {
          if (resubmitted) return
          resubmitted = true
          harness.sequencer.addEffect('loop-test', replacement, true)
        },
        true,
      )

      advanceUntil(harness, () => resubmitted, 20)
      expect(resubmitted).toBe(true)

      const seen = new Set<Effect>()
      for (let i = 0; i < 40; i += 1) {
        harness.advanceBy(10)
        const running = layer1Effect(harness, lightId)
        if (running) seen.add(running)
      }
      expect([...seen]).toEqual([replacement])
      expect(queuedCount(harness)).toBe(0)

      harness.cleanup()
    })

    it('drains a higher layer when a repeated set finds layer 0 already finished', async () => {
      const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
      const lights = harness.lightManager.getLights(['front'], ['all'])
      const lightId = lights[0].id
      const multiLayer = (color: typeof colorA): Effect => ({
        id: 'multi-layer',
        description: 'layer 0 short, layer 1 long',
        transitions: [
          {
            ...buildSingleLayerEffect(lights, 0, color, 10, 'linear').transitions[0],
          },
          {
            ...buildSingleLayerEffect(lights, 1, color, 200, 'linear').transitions[0],
          },
        ],
      })
      const queued = multiLayer(colorB)

      await harness.sequencer.setEffect('multi-test', multiLayer(colorA), true)
      // Layer 0 finishes well before layer 1, so the repeated set finds nothing to retire there.
      advanceUntil(harness, () => false, 5)
      await harness.sequencer.setEffect('multi-test', queued, true)
      expect(queuedCount(harness)).toBe(1)

      advanceUntil(harness, () => queuedCount(harness) === 0, 60)

      expect(queuedCount(harness)).toBe(0)
      advanceUntil(harness, () => layer1Effect(harness, lightId) === queued, 30)
      expect(layer1Effect(harness, lightId)).toBe(queued)

      harness.cleanup()
    })

    it('outlasts a submission made by a waiter its own clearing step cancelled', async () => {
      // setEffect clears first, which fires held waiters, and a waiter can submit the name back.
      // The submission that did the clearing is the later one, so it keeps looping.
      const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
      const lights = harness.lightManager.getLights(['front'], ['all'])
      const lightId = lights[0].id
      const fromWaiter = buildSingleLayerEffect(lights, 1, colorB, 20, 'linear')
      const clearing = buildSingleLayerEffect(lights, 1, colorC, 20, 'linear')

      let resubmitted = false
      harness.sequencer.addEffectWithCallback(
        'loop-test',
        buildSingleLayerEffect(lights, 1, colorA, 20, 'linear'),
        () => {
          if (resubmitted) return
          resubmitted = true
          harness.sequencer.addEffect('loop-test', fromWaiter, true)
        },
        true,
      )
      harness.advanceBy(10)

      await harness.sequencer.setEffect('loop-test', clearing, true)
      expect(resubmitted).toBe(true)

      advanceUntil(harness, () => queuedCount(harness) === 0, 40)
      const seen = new Set<Effect>()
      for (let i = 0; i < 40; i += 1) {
        harness.advanceBy(10)
        const running = layer1Effect(harness, lightId)
        if (running) seen.add(running)
      }
      expect([...seen]).toEqual([clearing])

      harness.cleanup()
    })

    it("drops the name's queued entries on lights the new submission does not cover", () => {
      const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
      const lights = harness.lightManager.getLights(['front'], ['all'])
      const [covered, uncovered] = lights
      const superseded = buildStaggeredEffect(lights, colorB)

      harness.sequencer.addEffect('loop-test', buildStaggeredEffect(lights, colorA), true)
      harness.sequencer.addEffect('loop-test', superseded, true)
      expect(queuedCount(harness)).toBe(2)

      // Covers one light of the two, so the other light's entry has nothing to replace it.
      harness.sequencer.addEffect(
        'loop-test',
        buildSingleLayerEffect([covered], 1, colorC, 20, 'linear'),
        true,
      )
      expect(queuedCount(harness)).toBe(1)

      let ranSuperseded = false
      advanceUntil(
        harness,
        () => {
          ranSuperseded =
            ranSuperseded || lights.some((l) => layer1Effect(harness, l.id) === superseded)
          return false
        },
        60,
      )

      expect(ranSuperseded).toBe(false)
      expect(layer1Effect(harness, uncovered.id)).toBeUndefined()

      harness.cleanup()
    })

    it('lets a submission from the displaced waiter supersede a replacement', () => {
      // The waiter hears after the replacement holds the slot, so what it submits is the later
      // submission of the name.
      const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
      const lights = harness.lightManager.getLights(['front'], ['all'])
      const lightId = lights[0].id
      const replacement = buildSingleLayerEffect(lights, 1, colorB, 20, 'linear')
      const fromWaiter = buildSingleLayerEffect(lights, 1, colorC, 20, 'linear')

      let resubmitted = false
      harness.sequencer.replaceEffectWithCallback(
        'loop-test',
        buildSingleLayerEffect(lights, 1, colorA, 20, 'linear'),
        () => {
          if (resubmitted) return
          resubmitted = true
          harness.sequencer.addEffect('loop-test', fromWaiter, true)
        },
        true,
      )
      harness.advanceBy(10)

      harness.sequencer.replaceEffectWithCallback('loop-test', replacement, () => {}, true)
      expect(resubmitted).toBe(true)

      advanceUntil(harness, () => queuedCount(harness) === 0, 40)
      const seen = new Set<Effect>()
      for (let i = 0; i < 40; i += 1) {
        harness.advanceBy(10)
        const running = layer1Effect(harness, lightId)
        if (running) seen.add(running)
      }
      expect([...seen]).toEqual([fromWaiter])

      harness.cleanup()
    })

    it('starts an entry waiting on a slot freed earlier in the same frame', () => {
      // The callback belongs to a light finalized before the queued one, so its submission lands on
      // a slot the removal pass has already emptied.
      const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
      const lights = harness.lightManager.getLights(['front'], ['all'])
      const [callbackLight, queuedLight] = lights
      const running = buildSingleLayerEffect([queuedLight], 1, colorA, 20, 'linear')
      const waiting = buildSingleLayerEffect([queuedLight], 1, colorB, 20, 'linear')
      const fromCallback = buildSingleLayerEffect([queuedLight], 1, colorC, 20, 'linear')

      let resubmitted = false
      harness.sequencer.addEffectWithCallback(
        'callback-effect',
        buildSingleLayerEffect([callbackLight], 1, colorA, 20, 'linear'),
        () => {
          if (resubmitted) return
          resubmitted = true
          harness.sequencer.addEffect('rescue-effect', fromCallback, true)
        },
      )
      const queuedCompletions: boolean[] = []
      harness.sequencer.addEffect('queued-effect', running)
      harness.sequencer.addEffectWithCallback('queued-effect', waiting, (cancelled) =>
        queuedCompletions.push(cancelled),
      )
      expect(queuedCount(harness)).toBe(1)

      advanceUntil(harness, () => resubmitted && queuedCount(harness) === 0, 60)

      expect(resubmitted).toBe(true)
      expect(queuedCount(harness)).toBe(0)
      // The waiting entry started and was then evicted through the normal path, which tells its
      // waiter.
      expect(queuedCompletions).toContain(true)
      advanceUntil(harness, () => layer1Effect(harness, queuedLight.id) === fromCallback, 30)
      expect(layer1Effect(harness, queuedLight.id)).toBe(fromCallback)

      harness.cleanup()
    })
  })

  it('fires completion callback after all lights finish', () => {
    const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const color = { ...getColor('red', 'high', 'replace'), opacity: 1 }
    const effect = buildSingleLayerEffect(lights, 1, color, 30, 'linear')

    const onComplete = jest.fn()
    harness.sequencer.addEffectWithCallback('callback-test', effect, onComplete)
    harness.advanceBy(10)
    expect(onComplete).not.toHaveBeenCalled()

    let fired = false
    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(10)
      if (onComplete.mock.calls.length > 0) {
        fired = true
        break
      }
    }
    expect(fired).toBe(true)
    expect(onComplete).toHaveBeenCalledTimes(1)

    harness.cleanup()
  })

  it('fires a queued run callback on the frame that run ends, not when the run ahead of it ends', () => {
    const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const lightId = lights[0].id
    const colorA = { ...getColor('blue', 'high', 'replace'), opacity: 1 }
    const colorB = { ...getColor('green', 'high', 'replace'), opacity: 1 }
    const effectA = buildSingleLayerEffect(lights, 1, colorA, 20, 'linear')
    const effectB = buildSingleLayerEffect(lights, 1, colorB, 20, 'linear')

    const layerManager = (
      harness.sequencer as unknown as {
        layerManager: { getEffectQueue: () => Map<number, Map<string, unknown>> }
      }
    ).layerManager
    const queued = (): number => layerManager.getEffectQueue().get(1)?.size ?? 0
    const running = (): boolean => harness.sequencer.getActiveEffectsForLight(lightId).has(1)

    const firstWaiter = jest.fn()
    const queuedWaiter = jest.fn()
    harness.sequencer.addEffectWithCallback('queue-callback', effectA, firstWaiter)
    harness.sequencer.addEffectWithCallback('queue-callback', effectB, queuedWaiter)
    expect(queued()).toBe(1)

    // Step to the frame where A finishes and hands the slot to the queued B.
    for (let i = 0; i < 40 && queued() > 0; i += 1) {
      harness.advanceBy(5)
    }
    expect(queued()).toBe(0)
    expect(running()).toBe(true)
    expect(firstWaiter).not.toHaveBeenCalled()
    expect(queuedWaiter).not.toHaveBeenCalled()

    // Step to the frame where B finishes. Neither waiter hears before it.
    for (let i = 0; i < 40 && running(); i += 1) {
      expect(queuedWaiter).not.toHaveBeenCalled()
      harness.advanceBy(5)
    }
    expect(running()).toBe(false)
    expect(firstWaiter).toHaveBeenCalledTimes(1)
    expect(firstWaiter).toHaveBeenCalledWith(false)
    expect(queuedWaiter).toHaveBeenCalledTimes(1)
    expect(queuedWaiter).toHaveBeenCalledWith(false)

    harness.cleanup()
  })
})
