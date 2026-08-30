import { describe, it, expect } from '@jest/globals'
import { shuffle } from '../../helpers/utils'

describe('shuffle', () => {
  it('preserves the elements and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5]
    const copy = [...input]
    const out = shuffle(input)
    expect(out).toHaveLength(input.length)
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
    expect(input).toEqual(copy) // input untouched
  })

  it('handles empty and single-element arrays', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle([42])).toEqual([42])
  })

  it('is uniform: every element lands in every position at close to equal frequency', () => {
    // A Fisher-Yates shuffle is uniform; sort(() => Math.random() - 0.5) is not and would fail this.
    const N = 6
    const RUNS = 60000
    const items = Array.from({ length: N }, (_, i) => i)
    const counts = Array.from({ length: N }, () => new Array<number>(N).fill(0))
    for (let r = 0; r < RUNS; r++) {
      const out = shuffle(items)
      for (let pos = 0; pos < N; pos++) {
        counts[out[pos]][pos]++
      }
    }
    const expected = RUNS / N // each element should land in each slot ~1/N of the time
    const tolerance = expected * 0.1 // 10% band (about 11 std devs, so not flaky)
    for (let element = 0; element < N; element++) {
      for (let pos = 0; pos < N; pos++) {
        expect(Math.abs(counts[element][pos] - expected)).toBeLessThan(tolerance)
      }
    }
  })
})
