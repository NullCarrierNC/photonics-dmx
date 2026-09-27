import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  parseArtDmx,
  parseChannelSpec,
  diffFrame,
  changeRows,
  rebase,
  statesOf,
  renderTable,
  checkExpectations,
  diffRuns,
  countPacket,
  packetRates,
} = require('../../../../tools/dmxLogCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

type Row = { ms: number; u?: number; src?: string; end?: boolean; ch?: Record<string, number> }

/** A 512-slot frame with the given channels set. */
const frame = (values: Record<number, number> = {}): number[] => {
  const dmx = new Array(512).fill(0)
  for (const [ch, value] of Object.entries(values)) {
    dmx[Number(ch) - 1] = value
  }
  return dmx
}

const packet = (ms: number, values: Record<number, number>, src = 'Photonics-DMX @ 127.0.0.1') => ({
  ms,
  u: 1,
  src,
  dmx: frame(values),
})

/** A strobe on channel 2: dark, on at 22 ms, off at 50, on at 110, off at 150, ended at 400. */
const strobeRows = (): Row[] => [
  { ms: 0, u: 1, src: 's', ch: {} },
  { ms: 22, u: 1, src: 's', ch: { 2: 255 } },
  { ms: 50, u: 1, src: 's', ch: { 2: 0 } },
  { ms: 110, u: 1, src: 's', ch: { 2: 255 } },
  { ms: 150, u: 1, src: 's', ch: { 2: 0 } },
  { ms: 400, end: true },
]

/** An Art-Net packet laid out as dmxnet sends it. */
const artNet = (
  values: number[],
  { opcode = 0x5000, net = 0, subuni = 1, sequence = 7 } = {},
): Buffer => {
  const header = Buffer.alloc(18)
  header.write('Art-Net\0', 0, 'latin1')
  header.writeUInt16LE(opcode, 8)
  header.writeUInt16BE(14, 10)
  header[12] = sequence
  header[14] = subuni
  header[15] = net
  header.writeUInt16BE(values.length, 16)
  return Buffer.concat([header, Buffer.from(values)])
}

describe('Art-Net packets', () => {
  it('reads the universe, sequence and channel data of an ArtDmx packet', () => {
    const packet = parseArtDmx(artNet([255, 0, 9]))
    expect(packet.u).toBe(1)
    expect(packet.sequence).toBe(7)
    expect([...packet.dmx]).toEqual([255, 0, 9])
  })

  it('puts Net above SubUni in the Port-Address', () => {
    expect(parseArtDmx(artNet([1], { net: 2, subuni: 0x31 })).u).toBe(0x231)
  })

  it('ignores other Art-Net packets and anything that is not Art-Net', () => {
    expect(parseArtDmx(artNet([1], { opcode: 0x2000 }))).toBeNull()
    expect(parseArtDmx(Buffer.from('not art-net at all, just some bytes'))).toBeNull()
    expect(parseArtDmx(artNet([]).subarray(0, 12))).toBeNull()
  })

  it('reads no further than the stated length', () => {
    const packet = artNet([1, 2, 3, 4])
    packet.writeUInt16BE(2, 16)
    expect([...parseArtDmx(packet).dmx]).toEqual([1, 2])
  })
})

describe('channel spec', () => {
  it('reads single channels and ranges, sorted and unique', () => {
    expect(parseChannelSpec('9,1-3,2')).toEqual([1, 2, 3, 9])
  })

  it('means every channel when empty', () => {
    expect(parseChannelSpec(undefined)).toHaveLength(512)
    expect(parseChannelSpec(' ')).toHaveLength(512)
  })

  it('refuses ranges outside 1-512 and malformed parts', () => {
    expect(() => parseChannelSpec('0-4')).toThrow('outside')
    expect(() => parseChannelSpec('500-513')).toThrow('outside')
    expect(() => parseChannelSpec('5-3')).toThrow('outside')
    expect(() => parseChannelSpec('a')).toThrow('Bad channel range')
  })
})

describe('frame diff', () => {
  it('lists only watched channels that changed', () => {
    expect(diffFrame(frame({ 1: 10, 5: 5 }), frame({ 1: 20, 5: 6 }), [1, 2])).toEqual({ 1: 20 })
  })

  it('returns null for a resend of the same frame', () => {
    expect(diffFrame(frame({ 1: 10 }), frame({ 1: 10 }), [1, 2])).toBeNull()
  })

  it('compares a first packet against a dark frame', () => {
    expect(diffFrame(null, frame({ 3: 7 }), [1, 2, 3])).toEqual({ 3: 7 })
  })

  it('reads channels past a short payload as 0', () => {
    expect(diffFrame([1, 2], [1, 2], [1, 2, 3])).toBeNull()
  })
})

describe('change rows', () => {
  it('keeps the first packet of each source and every change after it', () => {
    const rows = changeRows(
      [
        packet(0, {}),
        packet(23, {}),
        packet(45, { 1: 255 }),
        packet(68, { 1: 255 }),
        packet(70, { 1: 128 }, 'Other @ 10.0.0.2'),
        packet(90, { 1: 0 }),
      ],
      [1, 2],
    )
    expect(rows).toEqual([
      { ms: 0, u: 1, src: 'Photonics-DMX @ 127.0.0.1', ch: {} },
      { ms: 45, u: 1, src: 'Photonics-DMX @ 127.0.0.1', ch: { 1: 255 } },
      { ms: 70, u: 1, src: 'Other @ 10.0.0.2', ch: { 1: 128 } },
      { ms: 90, u: 1, src: 'Photonics-DMX @ 127.0.0.1', ch: { 1: 0 } },
    ])
  })
})

describe('time zero', () => {
  const rows: Row[] = [
    { ms: 100, u: 1, ch: {} },
    { ms: 140, u: 1, ch: { 1: 0 } },
    { ms: 160, u: 1, ch: { 1: 9 } },
    { ms: 300, end: true },
  ]

  it('sits on the first row that lights a channel', () => {
    expect(rebase(rows, 'first-change').map((row: Row) => row.ms)).toEqual([-60, -20, 0, 140])
  })

  it('sits on the first row when asked, or when nothing lights', () => {
    expect(rebase(rows, 'first-packet').map((row: Row) => row.ms)).toEqual([0, 40, 60, 200])
    const dark = rows.slice(0, 2)
    expect(rebase(dark, 'first-change').map((row: Row) => row.ms)).toEqual([0, 40])
  })

  it('leaves a rebased recording where it is', () => {
    const once = rebase(rows, 'first-change')
    expect(rebase(once, 'first-change')).toEqual(once)
  })
})

describe('states', () => {
  it('merges sources on one universe and ignores the others', () => {
    const { states, endMs } = statesOf(
      [
        { ms: 0, u: 1, src: 'a', ch: { 1: 5 } },
        { ms: 5, u: 2, src: 'a', ch: { 1: 99 } },
        { ms: 10, u: 1, src: 'b', ch: { 2: 6 } },
        { ms: 20, end: true },
      ],
      1,
    )
    expect(states.map((state: { ms: number; values: Map<number, number> }) => state.ms)).toEqual([
      0, 10,
    ])
    expect([...states[1].values]).toEqual([
      [1, 5],
      [2, 6],
    ])
    expect(endMs).toBe(20)
  })
})

describe('table', () => {
  it('shows every lit channel after each row, holding values between rows', () => {
    const table = renderTable(
      [
        { ms: 0, u: 1, ch: { 1: 255 } },
        { ms: 22, u: 1, ch: { 3: 10 } },
        { ms: 40, end: true },
      ],
      null,
    )
    expect(table).toBe(
      ['| ms | 1 | 3 |', '|---|---|---|', '| 0 | 255 | 0 |', '| 22 | 255 | 10 |'].join('\n'),
    )
  })

  it('shows the asked channels, and a universe column across universes', () => {
    const table = renderTable(
      [
        { ms: 0, u: 2, ch: { 1: 1 } },
        { ms: 0, u: 1, ch: { 1: 2 } },
      ],
      [1, 2],
    )
    expect(table.split('\n')).toEqual([
      '| ms | u | 1 | 2 |',
      '|---|---|---|---|',
      '| 0 | 1 | 2 | 0 |',
      '| 0 | 2 | 1 | 0 |',
    ])
  })
})

describe('recording diff', () => {
  const before = (): Row[] => [
    { ms: 0, u: 1, ch: { 1: 255 } },
    { ms: 100, u: 1, ch: { 1: 0 } },
    { ms: 200, end: true },
  ]

  it('finds nothing between matching recordings', () => {
    expect(diffRuns(before(), before(), 1)).toEqual({ channels: {}, differMs: 0 })
  })

  it('gives each differing channel its first differing time, and how long any differs', () => {
    const after: Row[] = [
      { ms: 0, u: 1, ch: { 1: 255 } },
      { ms: 50, u: 1, ch: { 1: 0, 2: 9 } },
      { ms: 300, end: true },
    ]
    expect(diffRuns(before(), after, 1)).toEqual({ channels: { 1: 50, 2: 50 }, differMs: 150 })
  })

  it('compares only the time both recordings cover, on the universe asked for', () => {
    const late: Row[] = [
      { ms: 20, u: 1, ch: { 1: 255 } },
      { ms: 20, u: 2, ch: { 1: 7 } },
      { ms: 100, u: 1, ch: { 1: 0 } },
      { ms: 150, end: true },
    ]
    expect(diffRuns(before(), late, 1)).toEqual({ channels: {}, differMs: 0 })
    expect(diffRuns(before(), late, 2).channels).toEqual({ 1: 20 })
  })
})

describe('packet rates', () => {
  it('counts packets from the first lit one', () => {
    let seen = countPacket(undefined, 0, frame())
    seen = countPacket(seen, 1000, frame({ 3: 9 }))
    seen = countPacket(seen, 1023, frame())
    expect(seen).toEqual({ count: 3, firstMs: 0, lastMs: 1023, litMs: 1000, litCount: 2 })
  })

  it('rates each source from its first lit packet, or its first packet when none lit', () => {
    const counts = new Map([
      ['a', { count: 46, firstMs: 0, lastMs: 1100, litMs: 100, litCount: 45 }],
      ['b', { count: 3, firstMs: 0, lastMs: 100, litMs: null, litCount: 0 }],
      ['c', { count: 1, firstMs: 50, lastMs: 50, litMs: 50, litCount: 1 }],
    ])
    expect(packetRates(counts)).toEqual([
      { source: 'a', count: 46, spanMs: 1000, perSecond: 44 },
      { source: 'b', count: 3, spanMs: 100, perSecond: 20 },
      { source: 'c', count: 1, spanMs: 0, perSecond: 0 },
    ])
  })
})

describe('expectations', () => {
  it('passes states that appear in order within the time tolerance', () => {
    const result = checkExpectations(strobeRows(), {
      states: [
        { ch: { 2: 255 }, atMs: 20, label: 'first flash' },
        { ch: { 2: 0 }, atMs: 50 },
        { ch: { 2: 255 }, atMs: 110 },
        { ch: { 2: 0 }, holdMs: 200 },
      ],
    })
    expect(result.lines).toEqual([
      'PASS state 1 (first flash): reached at 22 ms',
      'PASS state 2: reached at 50 ms',
      'PASS state 3: reached at 110 ms',
      'PASS state 4: reached at 150 ms',
    ])
    expect(result.ok).toBe(true)
  })

  it('fails a state that never appears within the time tolerance', () => {
    const result = checkExpectations(
      strobeRows(),
      { states: [{ ch: { 2: 255 }, atMs: 200 }] },
      {
        timeTolMs: 30,
      },
    )
    expect(result.ok).toBe(false)
    expect(result.lines).toEqual(['FAIL state 1: reached at 22 ms, expected 200 ± 30 ms'])
  })

  it('fails a state that never appears after the previous one', () => {
    const result = checkExpectations(strobeRows(), {
      states: [{ ch: { 2: 0 }, atMs: 150 }, { ch: { 2: 255 } }],
    })
    expect(result.ok).toBe(false)
    expect(result.lines[1]).toBe('FAIL state 2: never reached {"2":255}')
  })

  it('fails a hold cut short by a change or by the end of the recording', () => {
    const short = checkExpectations(strobeRows(), { states: [{ ch: { 2: 255 }, holdMs: 40 }] })
    expect(short.lines).toEqual(['FAIL state 1: held 28 ms, expected 40 ms (changed)'])
    const ended = checkExpectations(strobeRows(), {
      states: [
        { ch: { 2: 255 }, atMs: 110 },
        { ch: { 2: 0 }, holdMs: 500 },
      ],
    })
    expect(ended.lines[1]).toBe('FAIL state 2: held 250 ms, expected 500 ms (the recording ended)')
  })

  it('counts a hold across changes on channels the state does not list', () => {
    const rows: Row[] = [
      { ms: 0, u: 1, ch: { 1: 255 } },
      { ms: 30, u: 1, ch: { 2: 9 } },
      { ms: 100, end: true },
    ]
    expect(checkExpectations(rows, { states: [{ ch: { 1: 255 }, holdMs: 100 }] }).ok).toBe(true)
  })

  it('accepts values within the value tolerance', () => {
    const rows: Row[] = [
      { ms: 0, u: 1, ch: { 1: 243 } },
      { ms: 10, end: true },
    ]
    const want = { states: [{ ch: { 1: 245 } }] }
    expect(checkExpectations(rows, want).ok).toBe(false)
    expect(checkExpectations(rows, want, { valueTol: 2 }).ok).toBe(true)
  })

  it('reads the universe the expectations name', () => {
    const rows: Row[] = [
      { ms: 0, u: 1, ch: { 1: 1 } },
      { ms: 0, u: 3, ch: { 1: 3 } },
    ]
    expect(checkExpectations(rows, { states: [{ ch: { 1: 3 } }] }).ok).toBe(false)
    expect(checkExpectations(rows, { universe: 3, states: [{ ch: { 1: 3 } }] }).ok).toBe(true)
  })

  it('reads a range key as every channel in it', () => {
    const rows: Row[] = [
      { ms: 0, u: 1, ch: { 1: 255, 2: 255, 3: 255 } },
      { ms: 10, end: true },
    ]
    expect(checkExpectations(rows, { states: [{ ch: { '1-3': 255, '4-6': 0 } }] }).ok).toBe(true)
    expect(checkExpectations(rows, { states: [{ ch: { '1-4': 255 } }] }).ok).toBe(false)
  })

  it('leaves the walk in place when a state misses its time', () => {
    const result = checkExpectations(strobeRows(), {
      states: [
        { ch: { 2: 255 }, atMs: 300 },
        { ch: { 2: 255 }, atMs: 20 },
      ],
    })
    expect(result.lines).toEqual([
      'FAIL state 1: reached at 22 ms, expected 300 ± 30 ms',
      'PASS state 2: reached at 22 ms',
    ])
  })

  it('fails a never state shown inside its window, and passes one shown only outside it', () => {
    const result = checkExpectations(strobeRows(), {
      states: [
        { never: { 2: 255 }, fromMs: 60, toMs: 100, label: 'dark between flashes' },
        { never: { 2: 255 }, fromMs: 60, toMs: 120 },
        { never: { 2: 128 } },
      ],
    })
    expect(result.lines).toEqual([
      'PASS state 1 (dark between flashes): never shown',
      'FAIL state 2: shown at 110 ms, expected never',
      'PASS state 3: never shown',
    ])
  })

  it('fails an always state that any listed channel leaves inside its window', () => {
    const result = checkExpectations(strobeRows(), {
      states: [
        { always: { '1-3': 0 }, toMs: 22 },
        { always: { '1-3': 0 }, fromMs: 60, toMs: 110 },
        { always: { 2: 0 }, fromMs: 60, toMs: 111 },
      ],
    })
    expect(result.lines).toEqual([
      'PASS state 1: held throughout',
      'PASS state 2: held throughout',
      'FAIL state 3: left at 110 ms with 2=255',
    ])
  })

  it('does not move the walk for never and always states', () => {
    const result = checkExpectations(strobeRows(), {
      states: [{ ch: { 2: 255 }, atMs: 110 }, { never: { 2: 128 } }, { ch: { 2: 0 }, atMs: 150 }],
    })
    expect(result.ok).toBe(true)
  })
})
