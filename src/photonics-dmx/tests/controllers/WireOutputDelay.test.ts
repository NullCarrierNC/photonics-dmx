import { describe, expect, it } from '@jest/globals'
import { WireOutputDelay } from '../../controllers/WireOutputDelay'

/** A sender that records each universe it is handed, with timers on a hand-driven clock. */
function delayedWire(initialDelayMs: number) {
  let nowMs = 0
  let delayMs = initialDelayMs
  let nextId = 1
  const timers = new Map<number, { due: number; run: () => void }>()
  const sent: number[] = []
  const wire = new WireOutputDelay(
    {
      send: (_wireId, buffer) => {
        sent.push(buffer[1])
        return Promise.resolve(true)
      },
    },
    {
      now: () => nowMs,
      setTimer: (run, ms) => {
        const id = nextId++
        timers.set(id, { due: nowMs + ms, run })
        return id as never
      },
      clearTimer: (handle) => {
        timers.delete(handle as unknown as number)
      },
    },
    () => delayMs,
  )
  const advanceTo = (ms: number): void => {
    nowMs = ms
    for (const [id, timer] of [...timers]) {
      if (timer.due <= nowMs) {
        timers.delete(id)
        timer.run()
      }
    }
  }
  return {
    wire,
    sent,
    advanceTo,
    setDelay: (ms: number) => {
      delayMs = ms
    },
  }
}

describe('WireOutputDelay', () => {
  it('holds a frame for the delay', () => {
    const { wire, sent, advanceTo } = delayedWire(100)

    void wire.send('sacn', { 1: 10 })
    expect(sent).toEqual([])
    advanceTo(100)

    expect(sent).toEqual([10])
  })

  it('sends at once with no delay and nothing held', () => {
    const { wire, sent } = delayedWire(0)

    void wire.send('sacn', { 1: 10 })

    expect(sent).toEqual([10])
  })

  it('keeps frames in order when the delay drops to 0 with frames still held', () => {
    const { wire, sent, advanceTo, setDelay } = delayedWire(100)

    void wire.send('sacn', { 1: 10 })
    advanceTo(20)
    setDelay(0)
    void wire.send('sacn', { 1: 20 })
    advanceTo(200)

    expect(sent).toEqual([10, 20])
  })
})
