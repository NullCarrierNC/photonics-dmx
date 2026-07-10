// Controllable monotonic clock (the `mock`-prefixed binding is read on every call).
let mockNowMs = 0
jest.mock('../../../shared/time', () => ({
  monotonicNowMs: () => mockNowMs,
}))

import { Rb3MotionSwitchScheduler } from '../../processors/Rb3MotionSwitchScheduler'

// Deterministic countdown: Math.random() -> 0 makes randomInRange return `min`.
function withRandom(value: number, fn: () => void): void {
  const spy = jest.spyOn(Math, 'random').mockReturnValue(value)
  try {
    fn()
  } finally {
    spy.mockRestore()
  }
}

describe('Rb3MotionSwitchScheduler', () => {
  beforeEach(() => {
    mockNowMs = 0
  })

  it('arms on the countdown then fires on the next Light-1 edge, and re-arms', () => {
    const onSwitchDue = jest.fn()
    // min=max=5s -> deterministic 5000ms countdown regardless of Math.random.
    const scheduler = new Rb3MotionSwitchScheduler(() => ({ min: 5, max: 5 }), onSwitchDue)

    mockNowMs = 1000
    scheduler.start() // deadline = 6000

    // Before the countdown elapses: ticks arm nothing, and a Light-1 edge does not fire.
    mockNowMs = 3000
    scheduler.tick()
    scheduler.notifyLight1Edge()
    expect(onSwitchDue).not.toHaveBeenCalled()

    // Countdown elapsed: a tick arms the pending switch, but it only fires on the NEXT edge.
    mockNowMs = 6500
    scheduler.tick()
    expect(onSwitchDue).not.toHaveBeenCalled()
    scheduler.notifyLight1Edge()
    expect(onSwitchDue).toHaveBeenCalledTimes(1)

    // Re-armed: the next edge does nothing until the new countdown (deadline 11500) elapses.
    mockNowMs = 8000
    scheduler.tick()
    scheduler.notifyLight1Edge()
    expect(onSwitchDue).toHaveBeenCalledTimes(1)
    mockNowMs = 12000
    scheduler.tick()
    scheduler.notifyLight1Edge()
    expect(onSwitchDue).toHaveBeenCalledTimes(2)
  })

  it('fires on a Light-1 edge without a prior tick once the deadline has passed', () => {
    const onSwitchDue = jest.fn()
    const scheduler = new Rb3MotionSwitchScheduler(() => ({ min: 5, max: 5 }), onSwitchDue)
    mockNowMs = 0
    scheduler.start()
    mockNowMs = 6000
    // notifyLight1Edge only fires when pendingSwitch is set (armed by tick), so an edge alone
    // past the deadline does not fire — the ~30Hz keepalive tick always precedes edges in practice.
    scheduler.notifyLight1Edge()
    expect(onSwitchDue).not.toHaveBeenCalled()
    scheduler.tick()
    scheduler.notifyLight1Edge()
    expect(onSwitchDue).toHaveBeenCalledTimes(1)
  })

  it('does nothing before start or after stop', () => {
    const onSwitchDue = jest.fn()
    const scheduler = new Rb3MotionSwitchScheduler(() => ({ min: 0, max: 0 }), onSwitchDue)
    mockNowMs = 100
    scheduler.tick()
    scheduler.notifyLight1Edge()
    expect(onSwitchDue).not.toHaveBeenCalled()

    scheduler.start()
    scheduler.stop()
    mockNowMs = 200
    scheduler.tick()
    scheduler.notifyLight1Edge()
    expect(onSwitchDue).not.toHaveBeenCalled()
  })

  it('draws the countdown from the [min, max] range', () => {
    const onSwitchDue = jest.fn()
    const scheduler = new Rb3MotionSwitchScheduler(() => ({ min: 4, max: 10 }), onSwitchDue)
    // random=0.5 -> 4 + 0.5*(10-4) = 7s countdown.
    withRandom(0.5, () => {
      mockNowMs = 0
      scheduler.start()
    })
    mockNowMs = 6999
    scheduler.tick()
    scheduler.notifyLight1Edge()
    expect(onSwitchDue).not.toHaveBeenCalled()
    mockNowMs = 7000
    scheduler.tick()
    scheduler.notifyLight1Edge()
    expect(onSwitchDue).toHaveBeenCalledTimes(1)
  })
})
