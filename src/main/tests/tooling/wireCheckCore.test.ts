import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  universeOf,
  recordingRows,
  rebaseRows,
  evaluate,
} = require('../../../../tools/wireCheckCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

/** Four sends: dark, channel 1 up, a repeat, then channel 1 left out and channel 2 up. */
const recording = () => ({
  universe: 2,
  sends: [
    { ms: 10, buffer: { 1: 0, 2: 0 } },
    { ms: 40, buffer: { 1: 255, 2: 0 } },
    { ms: 60, buffer: { 1: 255, 2: 0 } },
    { ms: 80, buffer: { 2: 9 } },
  ],
  endMs: 100,
  marks: { start: 30 },
})

describe('wire check core', () => {
  it('reads a buffer as a full universe with the channels it leaves out at 0', () => {
    const dmx = universeOf({ 1: 5, 512: 7, 513: 9, 0: 3 })
    expect(dmx).toHaveLength(512)
    expect([dmx[0], dmx[1], dmx[511]]).toEqual([5, 0, 7])
  })

  it('turns sends into change rows stamped with the universe, ending at the end marker', () => {
    expect(recordingRows(recording(), [1, 2])).toEqual([
      { ms: 10, u: 2, src: 'publisher', ch: {} },
      { ms: 40, u: 2, src: 'publisher', ch: { 1: 255 } },
      { ms: 80, u: 2, src: 'publisher', ch: { 1: 0, 2: 9 } },
      { ms: 100, end: true },
    ])
  })

  it('moves time zero to a mark, or as dmx-log does', () => {
    const rows = recordingRows(recording(), [1, 2])
    expect(rebaseRows(rows, 'mark:start', { start: 30 })[0].ms).toBe(-20)
    expect(rebaseRows(rows, undefined, {})[0].ms).toBe(-30)
    expect(rebaseRows(rows, 'first-packet', {})[0].ms).toBe(0)
    expect(() => rebaseRows(rows, 'mark:gone', {})).toThrow("t0 names mark 'gone'")
    expect(() => rebaseRows(rows, 'middle', {})).toThrow('t0 must be first-change')
  })

  it('holds the rows to the expectations on the channels asked for', () => {
    const scenario = {
      channels: '1-2',
      t0: 'mark:start',
      expect: { universe: 2, states: [{ ch: { 1: 255 }, atMs: 10, holdMs: 40 }] },
    }
    const { rows, check } = evaluate(scenario, recording())
    expect(rows).toHaveLength(4)
    expect(check).toEqual({ ok: true, lines: ['PASS state 1: reached at 10 ms'] })
    expect(evaluate({ channels: '1' }, recording()).check).toBeNull()
  })
})
