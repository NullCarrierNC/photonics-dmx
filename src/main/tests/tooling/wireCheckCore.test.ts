import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  universeOf,
  recordingRows,
  rebaseRows,
  evaluate,
  alignWireRows,
  rateLines,
  evaluateWire,
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

  it("puts wire rows on a mark's time zero through the first lit send", () => {
    const wireRows = [
      { ms: 0, u: 1, ch: { 1: 255 } },
      { ms: 42, u: 1, ch: { 1: 0 } },
    ]
    expect(
      alignWireRows(wireRows, recording(), 'mark:start').map((row: { ms: number }) => row.ms),
    ).toEqual([10, 52])
    expect(alignWireRows(wireRows, recording(), undefined)).toBe(wireRows)
    expect(() => alignWireRows(wireRows, recording(), 'mark:gone')).toThrow("names mark 'gone'")
  })

  it('checks each source rate against the range, or reports it alone', () => {
    const stats = { sources: [{ source: 's', perSecond: 42.04 }] }
    expect(rateLines(stats, { min: 38, max: 46 })).toEqual([
      'PASS rate: s sent 42.0 per second, expected 38-46',
    ])
    expect(rateLines(stats, { max: 30 })).toEqual([
      'FAIL rate: s sent 42.0 per second, expected 0-30',
    ])
    expect(rateLines(stats, undefined)).toEqual(['PASS rate: s sent 42.0 per second'])
    expect(rateLines({ sources: [] }, undefined)).toEqual(['FAIL rate: no packets arrived'])
  })

  it('holds wire rows to the expectations with the wider wire tolerance and the rate', () => {
    const scenario = {
      t0: 'mark:start',
      expect: { universe: 2, states: [{ ch: { 1: 255 }, atMs: 60 }] },
      wire: { rateHz: { min: 40 } },
    }
    const wireRows = [{ ms: 0, u: 0, ch: { 1: 255 } }]
    const stats = { sources: [{ source: 's', perSecond: 42 }] }
    const { check } = evaluateWire(scenario, recording(), wireRows, stats)
    expect(check).toEqual({
      ok: true,
      lines: [
        'PASS state 1: reached at 10 ms',
        'PASS rate: s sent 42.0 per second, expected 40-any',
      ],
    })
    const slow = evaluateWire(scenario, recording(), wireRows, {
      sources: [{ source: 's', perSecond: 21 }],
    })
    expect(slow.check.ok).toBe(false)
  })
})
