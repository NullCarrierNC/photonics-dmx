import { describe, expect, it } from '@jest/globals'
import { stepTransition } from '../../controllers/sequencer/transitionStep'
import type { TransitionData } from '../../controllers/sequencer/LightTransitionController'
import type { RGBIO } from '../../types'

const START_TIME = 1000

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

function transition(
  startState: RGBIO,
  endState: RGBIO,
  duration: number,
  easing = 'linear',
): TransitionData {
  return {
    layer: 1,
    startState,
    endState,
    startTime: START_TIME,
    transition: { transform: { color: endState, duration, easing }, layer: 1 },
  }
}

describe('stepTransition', () => {
  it('holds the start colour at the moment the transition begins', () => {
    const { state, complete } = stepTransition(
      transition(color({ red: 0 }), color({ red: 200 }), 1000),
      START_TIME,
    )
    expect(state.red).toBe(0)
    expect(complete).toBe(false)
  })

  it('interpolates every channel at the midpoint', () => {
    const { state } = stepTransition(
      transition(
        color({ red: 0, green: 100, blue: 200, intensity: 0 }),
        color({ red: 200, green: 0, blue: 100, intensity: 100 }),
        1000,
      ),
      START_TIME + 500,
    )
    expect([state.red, state.green, state.blue, state.intensity]).toEqual([100, 50, 150, 50])
  })

  it('holds the start colour when stepped before its start time', () => {
    const { state, complete } = stepTransition(
      transition(color({ red: 100 }), color({ red: 200 }), 100, 'quadraticIn'),
      START_TIME - 40,
    )
    expect(state.red).toBe(100)
    expect(complete).toBe(false)
  })

  it('is not complete a hair before the duration elapses', () => {
    const { complete } = stepTransition(
      transition(color({ red: 0 }), color({ red: 200 }), 1000),
      START_TIME + 999,
    )
    expect(complete).toBe(false)
  })

  it('lands on the end colour and reports complete when the duration elapses', () => {
    const { state, complete } = stepTransition(
      transition(color({ red: 0 }), color({ red: 200 }), 1000),
      START_TIME + 1000,
    )
    expect(state.red).toBe(200)
    expect(complete).toBe(true)
  })

  it('clamps past the duration rather than overshooting the end colour', () => {
    const { state, complete } = stepTransition(
      transition(color({ red: 0 }), color({ red: 200 }), 1000),
      START_TIME + 5000,
    )
    expect(state.red).toBe(200)
    expect(complete).toBe(true)
  })

  it('lands on the end colour at once for a zero duration', () => {
    const { state, complete } = stepTransition(
      transition(color({ red: 0 }), color({ red: 200 }), 0),
      START_TIME,
    )
    expect(state.red).toBe(200)
    expect(complete).toBe(true)
  })

  it('bends the ramp for a named easing curve', () => {
    const { state } = stepTransition(
      transition(color({ red: 0 }), color({ red: 200 }), 1000, 'quadraticIn'),
      START_TIME + 500,
    )
    expect(state.red).toBe(50)
  })

  it('interpolates opacity without rounding it to a whole channel', () => {
    const { state } = stepTransition(
      transition(color({ opacity: 0 }), color({ opacity: 1 }), 1000),
      START_TIME + 250,
    )
    expect(state.opacity).toBe(0.25)
  })

  it('takes the blend mode from the end state', () => {
    const { state } = stepTransition(
      transition(color({ blendMode: 'replace' }), color({ blendMode: 'add' }), 1000),
      START_TIME + 500,
    )
    expect(state.blendMode).toBe('add')
  })

  describe('pan and tilt', () => {
    it('interpolates both when the endpoints define them', () => {
      const { state } = stepTransition(
        transition(color({ pan: 0, tilt: 100 }), color({ pan: 80, tilt: 20 }), 1000),
        START_TIME + 500,
      )
      expect([state.pan, state.tilt]).toEqual([40, 60])
    })

    it('holds the end value throughout when only the end state names one', () => {
      const { state } = stepTransition(
        transition(color(), color({ pan: 80 }), 1000),
        START_TIME + 250,
      )
      expect(state.pan).toBe(80)
    })

    it('holds the start value throughout when only the start state names one', () => {
      const { state } = stepTransition(
        transition(color({ tilt: 30 }), color(), 1000),
        START_TIME + 750,
      )
      expect(state.tilt).toBe(30)
    })

    it('leaves them off when neither endpoint names one', () => {
      const { state } = stepTransition(
        transition(color({ red: 10 }), color({ red: 200 }), 1000),
        START_TIME + 500,
      )
      expect(state.pan).toBeUndefined()
      expect(state.tilt).toBeUndefined()
    })
  })

  it('corrects an out-of-range endpoint back into the channel range', () => {
    const { state } = stepTransition(
      transition(color({ red: 0, pan: 0 }), color({ red: 600, pan: 400 }), 1000),
      START_TIME + 1000,
    )
    expect(state.red).toBe(255)
    expect(state.pan).toBe(100)
  })
})
