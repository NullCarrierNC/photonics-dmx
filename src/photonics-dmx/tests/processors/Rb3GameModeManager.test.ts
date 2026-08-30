// Controllable monotonic clock (the `mock`-prefixed binding is read on every call).
let mockNowMs = 0
jest.mock('../../../shared/time', () => ({
  monotonicNowMs: () => mockNowMs,
}))

import { Rb3GameModeManager, Rb3GameModeSchedulePayload } from '../../processors/Rb3GameModeManager'

// Deterministic countdown + picks: Math.random() -> value.
function withRandom(value: number, fn: () => void): void {
  const spy = jest.spyOn(Math, 'random').mockReturnValue(value)
  try {
    fn()
  } finally {
    spy.mockRestore()
  }
}

describe('Rb3GameModeManager', () => {
  beforeEach(() => {
    mockNowMs = 0
  })

  it('never arms a switch when rotation is disabled, but still picks a starting group', () => {
    const onSwitchDue = jest.fn()
    const onPrimaryChange = jest.fn()
    const mgr = new Rb3GameModeManager(
      () => ['g1', 'g2'],
      () => ({ min: 5, max: 5 }),
      onSwitchDue,
      () => false,
    )
    mgr.setOnPrimaryCueChange(onPrimaryChange)

    mockNowMs = 1000
    mgr.start()
    expect(['g1', 'g2']).toContain(mgr.getActivePrimaryGroupId())
    expect(onPrimaryChange).toHaveBeenCalledTimes(1)

    // Well past the countdown: the tick must not arm, so no edge can ever switch the group.
    mockNowMs = 999999
    mgr.tick()
    mgr.notifyLight1Edge()
    expect(onSwitchDue).not.toHaveBeenCalled()
    expect(onPrimaryChange).toHaveBeenCalledTimes(1)
  })

  it('resumes arming when rotation is re-enabled mid-song', () => {
    const onSwitchDue = jest.fn()
    let rotate = false
    const mgr = new Rb3GameModeManager(
      () => ['g1'],
      () => ({ min: 5, max: 5 }),
      onSwitchDue,
      () => rotate,
    )

    mockNowMs = 1000
    mgr.start()
    mockNowMs = 9000
    mgr.tick()
    mgr.notifyLight1Edge()
    expect(onSwitchDue).not.toHaveBeenCalled()

    rotate = true
    mgr.tick()
    mgr.notifyLight1Edge()
    expect(onSwitchDue).toHaveBeenCalledTimes(1)
  })

  it('arms on the countdown then fires on the next Light-1 edge, and re-arms', () => {
    const onSwitchDue = jest.fn()
    const mgr = new Rb3GameModeManager(
      () => ['g1'],
      () => ({ min: 5, max: 5 }),
      onSwitchDue,
    )

    mockNowMs = 1000
    mgr.start() // deadline = 6000

    mockNowMs = 3000
    mgr.tick()
    mgr.notifyLight1Edge()
    expect(onSwitchDue).not.toHaveBeenCalled()

    mockNowMs = 6500
    mgr.tick()
    expect(onSwitchDue).not.toHaveBeenCalled()
    mgr.notifyLight1Edge()
    expect(onSwitchDue).toHaveBeenCalledTimes(1)

    // Re-armed: nothing until the new countdown (deadline 11500) elapses.
    mockNowMs = 8000
    mgr.tick()
    mgr.notifyLight1Edge()
    expect(onSwitchDue).toHaveBeenCalledTimes(1)
    mockNowMs = 12000
    mgr.tick()
    mgr.notifyLight1Edge()
    expect(onSwitchDue).toHaveBeenCalledTimes(2)
  })

  it('does nothing before start or after stop', () => {
    const onSwitchDue = jest.fn()
    const mgr = new Rb3GameModeManager(
      () => ['g1'],
      () => ({ min: 0, max: 0 }),
      onSwitchDue,
    )
    mockNowMs = 100
    mgr.tick()
    mgr.notifyLight1Edge()
    expect(onSwitchDue).not.toHaveBeenCalled()

    mgr.start()
    mgr.stop()
    mockNowMs = 200
    mgr.tick()
    mgr.notifyLight1Edge()
    expect(onSwitchDue).not.toHaveBeenCalled()
  })

  it('with one group: the primary never changes but every dwell still re-rolls motion', () => {
    const onSwitchDue = jest.fn()
    const onPrimary = jest.fn()
    const mgr = new Rb3GameModeManager(
      () => ['only'],
      () => ({ min: 5, max: 5 }),
      onSwitchDue,
    )
    mgr.setOnPrimaryCueChange(onPrimary)

    mockNowMs = 0
    mgr.start()
    expect(onPrimary).toHaveBeenCalledTimes(1)
    expect(onPrimary).toHaveBeenLastCalledWith('only')

    mockNowMs = 6000
    mgr.tick()
    mgr.notifyLight1Edge()
    // Motion re-rolls (onSwitchDue) even though the single group did not change (no extra primary emit).
    expect(onSwitchDue).toHaveBeenCalledTimes(1)
    expect(onPrimary).toHaveBeenCalledTimes(1)
  })

  it('with >=2 groups: rotates to a different group (avoid-repeat) on switch', () => {
    const onPrimary = jest.fn()
    const mgr = new Rb3GameModeManager(
      () => ['a', 'b'],
      () => ({ min: 5, max: 5 }),
      jest.fn(),
    )
    mgr.setOnPrimaryCueChange(onPrimary)

    withRandom(0, () => {
      mockNowMs = 0
      mgr.start() // pickRandom(['a','b']) -> 'a'
    })
    expect(mgr.getActivePrimaryGroupId()).toBe('a')

    mockNowMs = 6000
    mgr.tick()
    mgr.notifyLight1Edge() // others = ['b'] -> 'b' deterministically
    expect(mgr.getActivePrimaryGroupId()).toBe('b')
    expect(onPrimary).toHaveBeenLastCalledWith('b')
  })

  it('emits schedule pending on arm, then a fresh deadline after the switch', () => {
    const schedules: Rb3GameModeSchedulePayload[] = []
    const mgr = new Rb3GameModeManager(
      () => ['g1'],
      () => ({ min: 5, max: 5 }),
      jest.fn(),
    )
    mgr.setOnScheduleChange((p) => schedules.push(p))

    mockNowMs = 0
    mgr.start()
    expect(schedules[0]).toEqual({ deadlineMs: expect.any(Number), pending: false })

    mockNowMs = 6000
    mgr.tick()
    expect(schedules[schedules.length - 1]).toEqual({
      deadlineMs: expect.any(Number),
      pending: true,
    })

    mgr.notifyLight1Edge()
    expect(schedules[schedules.length - 1]).toEqual({
      deadlineMs: expect.any(Number),
      pending: false,
    })
  })

  it('stop() clears the renderer countdown', () => {
    const schedules: Rb3GameModeSchedulePayload[] = []
    const mgr = new Rb3GameModeManager(
      () => ['g1'],
      () => ({ min: 5, max: 5 }),
      jest.fn(),
    )
    mgr.setOnScheduleChange((p) => schedules.push(p))
    mockNowMs = 0
    mgr.start()
    mgr.stop()
    expect(schedules[schedules.length - 1]).toEqual({ deadlineMs: null, pending: false })
  })

  it('emits in order primary -> schedule -> motion on a group-changing switch', () => {
    const log: string[] = []
    const mgr = new Rb3GameModeManager(
      () => ['a', 'b'],
      () => ({ min: 5, max: 5 }),
      () => log.push('motion'),
    )
    mgr.setOnPrimaryCueChange(() => log.push('primary'))
    mgr.setOnScheduleChange(() => log.push('schedule'))

    withRandom(0, () => {
      mockNowMs = 0
      mgr.start()
    })
    log.length = 0 // ignore start emissions

    mockNowMs = 6000
    mgr.tick() // schedule (pending)
    log.length = 0
    mgr.notifyLight1Edge()
    expect(log).toEqual(['primary', 'schedule', 'motion'])
  })

  it('ensureValidPrimary re-rolls only when the active group left the pool', () => {
    let pool = ['a', 'b']
    const onPrimary = jest.fn()
    const mgr = new Rb3GameModeManager(
      () => pool,
      () => ({ min: 5, max: 5 }),
      jest.fn(),
    )
    mgr.setOnPrimaryCueChange(onPrimary)

    withRandom(0, () => {
      mockNowMs = 0
      mgr.start() // -> 'a'
    })
    onPrimary.mockClear()

    // Still valid: no re-pick.
    mgr.ensureValidPrimary()
    expect(onPrimary).not.toHaveBeenCalled()
    expect(mgr.getActivePrimaryGroupId()).toBe('a')

    // 'a' removed: re-picks the remaining group.
    pool = ['b']
    mgr.ensureValidPrimary()
    expect(mgr.getActivePrimaryGroupId()).toBe('b')
    expect(onPrimary).toHaveBeenCalledWith('b')
  })
})
