import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import type { RGBIO } from '../../types'

/** The transition clock origin. Kept under the 3000ms validation interval so frame 1 skips it. */
const T0 = 1000

let now = T0
let frameIndex = 0
let lsm: LightStateManager
let ltc: LightTransitionController
let publishes: Array<ReadonlyMap<string, Readonly<RGBIO>>>

beforeEach(() => {
  now = T0
  frameIndex = 0
  jest.spyOn(performance, 'now').mockImplementation(() => now)
  lsm = new LightStateManager()
  ltc = new LightTransitionController(lsm)
  publishes = []
  lsm.onLightStatesUpdated((states) => {
    publishes.push(states)
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

/**
 * Steps one frame at `at`, moving the transition clock with it so a transition's `startTime` and
 * the frame's `frameStartTime` are read off the same timeline.
 */
function frame(at: number = now): void {
  now = at
  frameIndex += 1
  ltc.advanceFrame({ frameStartTime: at, deltaTime: 16, frameIndex })
}

/** Settles a layer at `state` through the frame loop, leaving no transition behind it. */
function seedLayer(lightId: string, layer: number, state: RGBIO): void {
  ltc.setTransition(lightId, layer, state, state, 0, 'linear')
  frame()
}

function color(overrides: Partial<RGBIO> = {}): RGBIO {
  return {
    red: 0,
    green: 0,
    blue: 0,
    intensity: 255,
    opacity: 1.0,
    blendMode: 'replace',
    ...overrides,
  }
}

function published(lightId: string): RGBIO {
  const state = lsm.getLightState(lightId)
  if (!state) {
    throw new Error(`no published state for ${lightId}`)
  }
  return state
}

describe('LightTransitionController frame loop', () => {
  describe('interpolation', () => {
    it('publishes the start colour on the frame a transition begins', () => {
      ltc.setTransition('l', 1, color({ red: 0 }), color({ red: 200 }), 1000, 'linear')
      frame(T0)
      expect(published('l').red).toBe(0)
    })

    it('publishes the midpoint colour half way through a linear fade', () => {
      ltc.setTransition('l', 1, color({ red: 0 }), color({ red: 200 }), 1000, 'linear')
      frame(T0 + 500)
      expect(published('l').red).toBe(100)
    })

    it('reaches the exact end colour on the frame the duration elapses', () => {
      ltc.setTransition('l', 1, color({ red: 0 }), color({ red: 200 }), 1000, 'linear')
      frame(T0 + 1000)
      expect(published('l').red).toBe(200)
    })

    it('holds the end colour on frames after the transition completes', () => {
      ltc.setTransition('l', 1, color({ red: 0 }), color({ red: 200 }), 1000, 'linear')
      frame(T0 + 1000)
      frame(T0 + 1500)
      expect(published('l').red).toBe(200)
      expect(ltc.getAllLightIds()).not.toContain('l')
    })

    it('follows the named easing curve rather than a straight ramp', () => {
      ltc.setTransition('l', 1, color({ red: 0 }), color({ red: 200 }), 1000, 'quadraticIn')
      frame(T0 + 500)
      expect(published('l').red).toBe(50)
    })

    it('interpolates pan and tilt across the fade', () => {
      ltc.setTransition(
        'mh',
        1,
        color({ pan: 0, tilt: 100 }),
        color({ pan: 80, tilt: 20 }),
        1000,
        'linear',
      )
      frame(T0 + 500)
      expect(published('mh').pan).toBe(40)
      expect(published('mh').tilt).toBe(60)
    })

    it('holds a pan the start state omits at the end value for the whole fade', () => {
      ltc.setTransition('mh', 1, color(), color({ pan: 80 }), 1000, 'linear')
      frame(T0 + 250)
      expect(published('mh').pan).toBe(80)
    })
  })

  describe('layer composition', () => {
    it('blends layers from lowest to highest', () => {
      seedLayer('l', 1, color({ red: 100 }))
      seedLayer('l', 2, color({ green: 100 }))
      seedLayer('l', 3, color({ blue: 100 }))
      const out = published('l')
      expect([out.red, out.green, out.blue]).toEqual([0, 0, 100])
    })

    it('resolves to the highest layer when the layer numbers are sparse', () => {
      seedLayer('l', 1, color({ red: 100 }))
      seedLayer('l', 3, color({ blue: 100 }))
      const out = published('l')
      expect([out.red, out.green, out.blue]).toEqual([0, 0, 100])
    })

    it('carries pan and tilt from a lower layer through a colour-only layer above it', () => {
      seedLayer('mh', 10, color({ intensity: 0, opacity: 0, pan: 42, tilt: 77 }))
      seedLayer('mh', 20, color({ red: 200, green: 100, blue: 50 }))
      expect(published('mh').pan).toBe(42)
      expect(published('mh').tilt).toBe(77)
    })

    it('publishes hard black for a light whose layers have all been removed', () => {
      seedLayer('l', 1, color({ red: 200 }))
      ltc.removeTransitionsByLayer(1)
      frame()
      expect(published('l')).toEqual({
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 1.0,
        blendMode: 'replace',
      })
    })
  })

  describe('publishing', () => {
    it('publishes a frame once, after every light has been blended', () => {
      seedLayer('a', 1, color({ red: 200 }))
      seedLayer('b', 1, color({ blue: 200 }))
      const publishCount = publishes.length

      frame()

      expect(publishes.length).toBe(publishCount + 1)
      const snapshot = publishes[publishes.length - 1]
      expect(snapshot.get('a')?.red).toBe(200)
      expect(snapshot.get('b')?.blue).toBe(200)
    })
  })

  describe('clearing sequence', () => {
    it('makes the frame a no-op and publishes nothing while clearing', () => {
      ltc.setTransition('l', 1, color({ red: 0 }), color({ red: 200 }), 1000, 'linear')
      frame(T0)
      const publishCount = publishes.length

      ltc.beginClearingSequence()
      frame(T0 + 500)

      expect(publishes.length).toBe(publishCount)
      expect(published('l').red).toBe(0)
    })

    it('rejects a new transition while clearing', () => {
      ltc.beginClearingSequence()
      ltc.setTransition('l', 1, color({ red: 200 }), color({ red: 200 }), 0, 'linear')
      expect(ltc.getAllLightIds()).toEqual([])
    })

    it('rejects a generator layer state while clearing', () => {
      ltc.beginClearingSequence()
      ltc.setGeneratorLayerState('mh', 5, color({ pan: 40 }))
      expect(ltc.getLightState('mh', 5).pan).toBeUndefined()
    })

    it('resumes the frame loop once the clearing sequence ends', () => {
      ltc.setTransition('l', 1, color({ red: 0 }), color({ red: 200 }), 1000, 'linear')
      frame(T0)
      ltc.beginClearingSequence()
      frame(T0 + 500)
      ltc.endClearingSequence()
      frame(T0 + 500)

      expect(ltc.isClearing()).toBe(false)
      expect(published('l').red).toBe(100)
    })

    it('reports whether a clear is in progress', () => {
      expect(ltc.isClearing()).toBe(false)
      ltc.beginClearingSequence()
      expect(ltc.isClearing()).toBe(true)
      ltc.endClearingSequence()
      expect(ltc.isClearing()).toBe(false)
    })
  })

  describe('clearAllTransitions', () => {
    it('blacks out and publishes every light either the manager or the controller knows', () => {
      // Only the manager knows this one, and only the controller knows the other.
      lsm.setLightState('manager-only', color({ blue: 200 }))
      ltc.setTransition(
        'controller-only',
        1,
        color({ red: 200 }),
        color({ red: 200 }),
        1000,
        'linear',
      )
      const publishCount = publishes.length

      ltc.clearAllTransitions()

      const black = {
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 1.0,
        blendMode: 'replace',
      }
      expect(published('manager-only')).toEqual(black)
      expect(published('controller-only')).toEqual(black)
      expect(publishes.length).toBe(publishCount + 1)
      expect(ltc.getAllLightIds()).toEqual([])
    })

    it('releases the clearing lock when it returns', () => {
      ltc.clearAllTransitions()
      expect(ltc.isClearing()).toBe(false)
    })

    it('holds the lock while it publishes, so a listener cannot submit into the clear', () => {
      seedLayer('l', 1, color({ red: 200 }))
      lsm.onLightStatesUpdated(() => {
        ltc.setTransition('late', 1, color({ red: 200 }), color({ red: 200 }), 0, 'linear')
      })

      ltc.clearAllTransitions()

      expect(ltc.getAllLightIds()).toEqual([])
    })
  })

  describe('immediateBlackout', () => {
    it('drops a running transition and publishes black', () => {
      ltc.setTransition('l', 1, color({ red: 0 }), color({ red: 200 }), 1000, 'linear')
      frame(T0 + 500)

      ltc.immediateBlackout()

      expect(published('l')).toEqual({
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 0.0,
        blendMode: 'replace',
      })
      expect(ltc.getAllLightIds()).toEqual([])
    })

    it('keeps the last published pan and tilt so a moving head holds its aim', () => {
      seedLayer('mh', 1, color({ red: 200, pan: 42, tilt: 77 }))

      ltc.immediateBlackout()

      expect(published('mh').pan).toBe(42)
      expect(published('mh').tilt).toBe(77)
    })
  })

  describe('occlusion hold', () => {
    it('darkens every tracked light as soon as it is held', () => {
      seedLayer('l', 1, color({ red: 200, green: 100 }))

      ltc.setOcclusionHeld(true)

      expect(ltc.isOcclusionHeld()).toBe(true)
      const out = published('l')
      expect([out.red, out.green, out.blue, out.intensity]).toEqual([0, 0, 0, 0])
    })

    it('keeps pan and tilt behind the hold', () => {
      seedLayer('mh', 1, color({ red: 200, pan: 42, tilt: 77 }))

      ltc.setOcclusionHeld(true)

      expect(published('mh').pan).toBe(42)
      expect(published('mh').tilt).toBe(77)
    })

    it('darkens a light the manager tracks but the controller holds no layers for', () => {
      lsm.setLightState('manager-only', color({ red: 200 }))

      ltc.setOcclusionHeld(true)

      expect(published('manager-only')).toEqual({
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 1.0,
        blendMode: 'replace',
      })
    })

    it('keeps published colour dark on later frames while held', () => {
      ltc.setTransition('l', 1, color({ red: 0 }), color({ red: 200 }), 1000, 'linear')
      frame(T0)
      ltc.setOcclusionHeld(true)

      frame(T0 + 500)

      expect(published('l').red).toBe(0)
    })

    it('restores the blended colour when released', () => {
      seedLayer('l', 1, color({ red: 200 }))
      ltc.setOcclusionHeld(true)

      ltc.setOcclusionHeld(false)

      expect(published('l').red).toBe(200)
    })

    it('does no work when set to the state it already holds', () => {
      seedLayer('l', 1, color({ red: 200 }))
      ltc.setOcclusionHeld(true)
      const publishCount = publishes.length

      ltc.setOcclusionHeld(true)

      expect(publishes.length).toBe(publishCount)
    })
  })

  describe('layer removal and generator layers', () => {
    it('republishes without the removed layer', () => {
      seedLayer('l', 1, color({ red: 200 }))
      seedLayer('l', 2, color({ blue: 200 }))

      ltc.removeLightLayer('l', 2)

      const out = published('l')
      expect([out.red, out.blue]).toEqual([200, 0])
    })

    it('blends a generator layer that has no transition behind it', () => {
      ltc.setGeneratorLayerState('mh', 10, color({ intensity: 0, opacity: 0, pan: 55, tilt: 33 }))
      seedLayer('mh', 20, color({ red: 200 }))

      const out = published('mh')
      expect(out.red).toBe(200)
      expect(out.pan).toBe(55)
      expect(out.tilt).toBe(33)
    })

    it('republishes and publishes when a generator layer is removed', () => {
      ltc.setGeneratorLayerState('mh', 10, color({ intensity: 0, opacity: 0, pan: 55 }))
      seedLayer('mh', 20, color({ red: 200 }))
      const publishCount = publishes.length

      ltc.removeGeneratorLayer('mh', 10)

      expect(published('mh').pan).toBeUndefined()
      expect(publishes.length).toBe(publishCount + 1)
    })

    it('strips pan and tilt from every layer so the publisher falls back to fixture home', () => {
      seedLayer('mh', 10, color({ intensity: 0, opacity: 0, pan: 55, tilt: 33 }))
      seedLayer('mh', 20, color({ red: 200, pan: 90 }))

      ltc.clearPanTilt()

      expect(published('mh').pan).toBeUndefined()
      expect(published('mh').tilt).toBeUndefined()
      expect(published('mh').red).toBe(200)
    })
  })

  describe('a fault in the frame body', () => {
    /**
     * Make the blend throw, which is inside the try the frame body runs in.
     *
     * Only for a lit colour, because the recovery the catch runs writes black through this same
     * method and a throw from there would escape the frame instead of being handled.
     */
    function breakBlending(message = 'blend failed'): jest.SpiedFunction<typeof lsm.setLightState> {
      const real = lsm.setLightState.bind(lsm)
      return jest.spyOn(lsm, 'setLightState').mockImplementation((lightId, state) => {
        if (state.red !== 0) {
          throw new Error(message)
        }
        real(lightId, state)
      })
    }

    it('reports a sustained fault once rather than every frame', () => {
      // The loop runs a hundred times a second by default, and the file log drops everything for
      // the rest of the day once it hits its size cap, so a line per frame takes the diagnostics
      // with it.
      const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
      breakBlending()

      // The recovery drops every transition, so the work has to come back each frame for the fault
      // to repeat. That is what the sequencer does upstream: it submits every frame regardless.
      for (let i = 0; i < 20; i++) {
        ltc.setTransition('light-1', 0, color(), color({ red: 255 }), 100, 'linear')
        frame(T0 + i * 10)
      }

      const reported = errors.mock.calls.filter((c) =>
        String(c[0]).includes('Critical error in transition processing'),
      )
      expect(reported).toHaveLength(1)
      errors.mockRestore()
    })

    it('reports again after a clean frame in between', () => {
      // A fault the user has since fixed should be able to report if it comes back, rather than
      // staying suppressed for the life of the process.
      const errors = jest.spyOn(console, 'error').mockImplementation(() => {})

      ltc.setTransition('light-1', 0, color(), color({ red: 255 }), 100, 'linear')
      const broken = breakBlending()
      frame(T0 + 10)

      // A clean frame with work in it re-arms the report.
      broken.mockRestore()
      ltc.setTransition('light-1', 0, color(), color({ red: 255 }), 100, 'linear')
      frame(T0 + 20)

      ltc.setTransition('light-1', 0, color(), color({ red: 255 }), 100, 'linear')
      breakBlending('blend failed again')
      frame(T0 + 30)

      const reported = errors.mock.calls.filter((c) =>
        String(c[0]).includes('Critical error in transition processing'),
      )
      expect(reported).toHaveLength(2)
      errors.mockRestore()
    })
  })
})
