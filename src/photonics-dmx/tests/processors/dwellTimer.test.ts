import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DwellTimer, type DwellSchedulePayload } from '../../processors/dwellTimer'

let mockNowMs = 0
jest.mock('../../../shared/time', () => ({ monotonicNowMs: () => mockNowMs }))

/** A timer with every payload it sends the renderer collected in order. */
function recordingTimer(): { timer: DwellTimer; payloads: DwellSchedulePayload[] } {
  const timer = new DwellTimer()
  const payloads: DwellSchedulePayload[] = []
  timer.setOnChange((payload) => payloads.push(payload))
  return { timer, payloads }
}

describe('DwellTimer', () => {
  beforeEach(() => {
    mockNowMs = 0
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('shows no countdown until one is scheduled', () => {
    const { timer, payloads } = recordingTimer()

    timer.emit()

    expect(timer.isScheduled).toBe(false)
    expect(payloads).toEqual([{ deadlineMs: null, pending: false }])
  })

  it('arms once the countdown drawn from its range has elapsed', () => {
    const { timer } = recordingTimer()
    timer.schedule(4, 8)

    mockNowMs = 5999
    timer.armIfElapsed()
    expect(timer.isPending).toBe(false)

    mockNowMs = 6000
    timer.armIfElapsed()
    expect(timer.isPending).toBe(true)
  })

  it('tells the renderer once when it arms, however often it is asked', () => {
    const { timer, payloads } = recordingTimer()
    timer.schedule(1, 1)

    mockNowMs = 1000
    timer.armIfElapsed()
    timer.armIfElapsed()

    expect(payloads).toEqual([{ deadlineMs: expect.any(Number), pending: true }])
  })

  it('starts a range reaching below zero at zero, so the deadline is never behind the clock', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0)
    const { timer, payloads } = recordingTimer()
    const before = Date.now()

    timer.schedule(-10, -5)
    timer.emit()

    expect(payloads[0].deadlineMs).not.toBeNull()
    expect(payloads[0].deadlineMs as number).toBeGreaterThanOrEqual(before)
  })

  it('collapses an inverted range to its minimum', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99)
    const { timer } = recordingTimer()
    timer.schedule(10, 5)

    mockNowMs = 9999
    timer.armIfElapsed()
    expect(timer.isPending).toBe(false)

    mockNowMs = 10000
    timer.armIfElapsed()
    expect(timer.isPending).toBe(true)
  })

  it('keeps the countdown when a pending switch is dropped', () => {
    const { timer, payloads } = recordingTimer()
    timer.schedule(1, 1)
    mockNowMs = 1000
    timer.armIfElapsed()

    timer.clearPending()
    timer.emit()

    expect(payloads[payloads.length - 1]).toEqual({
      deadlineMs: expect.any(Number),
      pending: false,
    })
  })

  it('tells the renderer there is no countdown when cleared', () => {
    const { timer, payloads } = recordingTimer()
    timer.schedule(5, 5)

    timer.emitCleared()

    expect(payloads).toEqual([{ deadlineMs: null, pending: false }])
  })
})
