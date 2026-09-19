/**
 * The queue takes `now` as an option, so fake timers drive it by injecting `Date.now()` rather than
 * patching `perf_hooks`.
 */
import { DelayedDispatchQueue } from '../../controllers/DelayedDispatchQueue'

describe('DelayedDispatchQueue', () => {
  let delivered: string[]
  let delayMs: number

  const build = (options?: { maxPending?: number; deliver?: (item: string) => void }) =>
    new DelayedDispatchQueue<string>(
      options?.deliver ?? ((item) => delivered.push(item)),
      () => delayMs,
      { now: () => Date.now(), maxPending: options?.maxPending },
    )

  beforeEach(() => {
    delivered = []
    delayMs = 0
    jest.useFakeTimers()
    jest.setSystemTime(0)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  describe('with no delay', () => {
    it('delivers as it is handed the item, without arming a timer', () => {
      const queue = build()

      queue.enqueue('a')

      expect(delivered).toEqual(['a'])
      expect(queue.pending).toBe(0)
      expect(jest.getTimerCount()).toBe(0)
    })

    it('lets items already waiting through first', () => {
      const queue = build()
      delayMs = 200
      queue.enqueue('held')

      delayMs = 0
      queue.enqueue('now')

      expect(delivered).toEqual(['held', 'now'])
      expect(jest.getTimerCount()).toBe(0)
    })

    it.each([
      ['negative', -50],
      ['not a number', Number.NaN],
      ['infinite', Number.POSITIVE_INFINITY],
    ])('treats a %s delay as off', (_label, value) => {
      const queue = build()
      delayMs = value as number

      queue.enqueue('a')

      expect(delivered).toEqual(['a'])
      expect(queue.pending).toBe(0)
    })
  })

  describe('with a delay', () => {
    it('holds an item for the delay and then delivers it', () => {
      const queue = build()
      delayMs = 250

      queue.enqueue('a')
      expect(delivered).toEqual([])

      jest.advanceTimersByTime(249)
      expect(delivered).toEqual([])

      jest.advanceTimersByTime(1)
      expect(delivered).toEqual(['a'])
      expect(queue.pending).toBe(0)
    })

    it('keeps the spacing the items arrived with', () => {
      const queue = build()
      delayMs = 100

      queue.enqueue('a')
      jest.advanceTimersByTime(30)
      queue.enqueue('b')

      jest.advanceTimersByTime(70)
      expect(delivered).toEqual(['a'])

      jest.advanceTimersByTime(30)
      expect(delivered).toEqual(['a', 'b'])
    })

    it('runs one timer however many items are waiting', () => {
      const queue = build()
      delayMs = 100

      for (let i = 0; i < 20; i++) {
        queue.enqueue(`item-${i}`)
        jest.advanceTimersByTime(1)
      }

      expect(queue.pending).toBe(20)
      expect(jest.getTimerCount()).toBe(1)
    })

    it('leaves no timer armed once the queue empties', () => {
      const queue = build()
      delayMs = 100

      queue.enqueue('a')
      jest.advanceTimersByTime(100)

      expect(delivered).toEqual(['a'])
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  describe('when the delay changes under it', () => {
    it('lets newly due items through on the next arrival, oldest first', () => {
      const queue = build()
      delayMs = 400
      queue.enqueue('a')
      jest.advanceTimersByTime(10)
      queue.enqueue('b')

      delayMs = 5
      jest.advanceTimersByTime(1)
      queue.enqueue('c')

      // Only what the lowered delay has actually made due: 'a' waited past 5 ms, 'b' has not.
      expect(delivered).toEqual(['a'])

      jest.advanceTimersByTime(5)
      expect(delivered).toEqual(['a', 'b', 'c'])
    })

    it('waits out the standing timer when the delay drops with nothing arriving', () => {
      const queue = build()
      delayMs = 400
      queue.enqueue('a')

      delayMs = 50
      jest.advanceTimersByTime(60)
      // The delay is re-read on enqueue or timer fire, and neither has happened.
      expect(delivered).toEqual([])

      jest.advanceTimersByTime(340)
      expect(delivered).toEqual(['a'])
    })

    it('holds output when the delay grows, then resumes in order', () => {
      const queue = build()
      delayMs = 100
      queue.enqueue('a')
      jest.advanceTimersByTime(10)
      queue.enqueue('b')

      delayMs = 300
      jest.advanceTimersByTime(200)
      expect(delivered).toEqual([])

      jest.advanceTimersByTime(200)
      expect(delivered).toEqual(['a', 'b'])
    })
  })

  describe('clear', () => {
    it('drops what is waiting and stops the timer', () => {
      const queue = build()
      delayMs = 200
      queue.enqueue('a')
      queue.enqueue('b')

      queue.clear()

      expect(queue.pending).toBe(0)
      expect(jest.getTimerCount()).toBe(0)

      jest.advanceTimersByTime(1000)
      expect(delivered).toEqual([])
    })

    it('stops a drain that is under way, so nothing lands after a teardown', () => {
      const queue: DelayedDispatchQueue<string> = build({
        deliver: (item: string) => {
          delivered.push(item)
          // A listener shutting down on the first delivered packet: everything behind it is dropped.
          queue.clear()
        },
      })
      delayMs = 100

      queue.enqueue('a')
      queue.enqueue('b')
      queue.enqueue('c')
      jest.advanceTimersByTime(100)

      expect(delivered).toEqual(['a'])
      expect(queue.pending).toBe(0)
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  it('carries on past an item that throws', () => {
    const queue = build({
      deliver: (item) => {
        if (item === 'bad') {
          throw new Error('unreadable packet')
        }
        delivered.push(item)
      },
    })
    delayMs = 100

    queue.enqueue('bad')
    queue.enqueue('good')
    jest.advanceTimersByTime(100)

    expect(delivered).toEqual(['good'])
    expect(queue.pending).toBe(0)
  })

  it('lets the oldest through early rather than dropping it when it fills up', () => {
    const queue = build({ maxPending: 3 })
    delayMs = 1000

    queue.enqueue('a')
    queue.enqueue('b')
    queue.enqueue('c')
    expect(delivered).toEqual([])

    queue.enqueue('d')
    expect(delivered).toEqual(['a'])

    queue.enqueue('e')
    expect(delivered).toEqual(['a', 'b'])

    jest.advanceTimersByTime(1000)
    expect(delivered).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})
