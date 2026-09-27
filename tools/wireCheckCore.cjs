/**
 * The wire check's rules: turning a scenario's recorded publisher sends into dmx-log change rows,
 * moving time zero, and holding the rows to the scenario's expectations. wire-check.mjs owns the
 * files, the worker and the exit code.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- the tests require this module */
const { parseChannelSpec, changeRows, rebase, checkExpectations } = require('./dmxLogCore.cjs')

/** Loopback packets cross a real network stack and a real clock, so their times get more slack. */
const WIRE_TIME_TOL_MS = 60

const DMX_CHANNELS = 512
/** The source name the rows carry, since a recording has one sender. */
const SOURCE = 'publisher'

/**
 * A publisher buffer as a full universe. A channel the buffer leaves out reads 0, as the sACN
 * sender puts it on the wire.
 * @param {Record<string, number>} buffer channel number to value
 * @returns {number[]} index 0 is channel 1
 */
function universeOf(buffer) {
  const dmx = new Array(DMX_CHANNELS).fill(0)
  for (const [ch, value] of Object.entries(buffer)) {
    const channel = Number(ch)
    if (channel >= 1 && channel <= DMX_CHANNELS) {
      dmx[channel - 1] = value
    }
  }
  return dmx
}

/**
 * The change rows of a recording, ending with dmx-log's end marker at the recording's end.
 * @param {{ universe: number, sends: Array<{ ms: number, buffer: Record<string, number> }>, endMs: number }} recording
 * @param {number[]} channels
 */
function recordingRows(recording, channels) {
  const packets = recording.sends.map((send) => ({
    ms: send.ms,
    u: recording.universe,
    src: SOURCE,
    dmx: universeOf(send.buffer),
  }))
  return [...changeRows(packets, channels), { ms: recording.endMs, end: true }]
}

/**
 * Moves time zero to a mark (`mark:<name>`), or as dmx-log's `--t0` does.
 * @param {Array<{ ms: number }>} rows
 * @param {string | undefined} t0
 * @param {Record<string, number>} marks
 */
function rebaseRows(rows, t0, marks) {
  if (t0 === undefined || t0 === 'first-change' || t0 === 'first-packet') {
    return rebase(rows, t0 ?? 'first-change')
  }
  const match = /^mark:(.+)$/.exec(t0)
  if (!match) {
    throw new Error(`t0 must be first-change, first-packet or mark:<name>, not '${t0}'`)
  }
  const zero = marks[match[1]]
  if (zero === undefined) {
    throw new Error(`t0 names mark '${match[1]}', which no step sets`)
  }
  return rows.map((row) => ({ ...row, ms: row.ms - zero }))
}

/**
 * The rows of one scenario's recording, rebased, and the result of its expectations.
 * @param {{ channels?: string, t0?: string, expect?: object, timeTolMs?: number, valueTol?: number }} scenario
 * @param {{ universe: number, sends: Array<{ ms: number, buffer: Record<string, number> }>, endMs: number, marks: Record<string, number> }} recording
 * @returns {{ rows: object[], check: { ok: boolean, lines: string[] } | null }}
 */
function evaluate(scenario, recording) {
  const channels = parseChannelSpec(scenario.channels)
  const rows = rebaseRows(recordingRows(recording, channels), scenario.t0, recording.marks)
  const check =
    scenario.expect === undefined
      ? null
      : checkExpectations(rows, scenario.expect, {
          timeTolMs: scenario.timeTolMs,
          valueTol: scenario.valueTol,
        })
  return { rows, check }
}

/**
 * Puts dmx-log's rows for a loopback run on the scenario's time zero. dmx-log starts them at the
 * first lit packet, which went out as the recording's first lit send, so a mark sits as far before
 * 0 as it sat before that send.
 * @param {Array<{ ms: number }>} wireRows rebased to their first change
 * @param {{ universe: number, sends: Array<{ ms: number, buffer: Record<string, number> }>, endMs: number, marks: Record<string, number> }} recording
 * @param {string | undefined} t0
 */
function alignWireRows(wireRows, recording, t0) {
  const match = t0 === undefined ? null : /^mark:(.+)$/.exec(t0)
  if (match === null) {
    return wireRows
  }
  const rows = recordingRows(recording, parseChannelSpec(undefined))
  const firstLit = rows.find((row) => row.ch && Object.values(row.ch).some((value) => value > 0))
  const sentMs = (firstLit ?? rows[0]).ms
  const markMs = recording.marks[match[1]]
  if (markMs === undefined) {
    throw new Error(`t0 names mark '${match[1]}', which no step sets`)
  }
  return wireRows.map((row) => ({ ...row, ms: row.ms + sentMs - markMs }))
}

/**
 * PASS or FAIL lines for each source's packet rate against `rateHz`, or its rate alone without one.
 * @param {{ sources: Array<{ source: string, perSecond: number }> }} stats
 * @param {{ min?: number, max?: number } | undefined} rateHz
 */
function rateLines(stats, rateHz) {
  if (stats.sources.length === 0) {
    return ['FAIL rate: no packets arrived']
  }
  return stats.sources.map(({ source, perSecond }) => {
    const low = rateHz?.min !== undefined && perSecond < rateHz.min
    const high = rateHz?.max !== undefined && perSecond > rateHz.max
    const sent = `${source} sent ${perSecond.toFixed(1)} per second`
    if (rateHz === undefined) {
      return `PASS rate: ${sent}`
    }
    const range = `${rateHz.min ?? 0}-${rateHz.max ?? 'any'}`
    return `${low || high ? 'FAIL' : 'PASS'} rate: ${sent}, expected ${range}`
  })
}

/**
 * The rows dmx-log heard for a loopback run, on the scenario's time zero, and the result of the
 * scenario's expectations and packet rate against them.
 * @param {{ t0?: string, expect?: object, timeTolMs?: number, valueTol?: number, wire?: { rateHz?: { min?: number, max?: number }, timeTolMs?: number } }} scenario
 * @param {{ universe: number, sends: Array<{ ms: number, buffer: Record<string, number> }>, endMs: number, marks: Record<string, number> }} recording
 * @param {Array<{ ms: number }>} wireRows
 * @param {{ sources: Array<{ source: string, perSecond: number }> }} stats
 * @returns {{ rows: object[], check: { ok: boolean, lines: string[] } }}
 */
function evaluateWire(scenario, recording, wireRows, stats) {
  const rows = alignWireRows(wireRows, recording, scenario.t0)
  const expected =
    scenario.expect === undefined
      ? { ok: true, lines: [] }
      : checkExpectations(
          rows,
          { ...scenario.expect, universe: undefined },
          {
            timeTolMs: scenario.wire?.timeTolMs ?? WIRE_TIME_TOL_MS,
            valueTol: scenario.valueTol,
          },
        )
  const rates = rateLines(stats, scenario.wire?.rateHz)
  const lines = [...expected.lines, ...rates]
  return { rows, check: { ok: lines.every((line) => !line.startsWith('FAIL')), lines } }
}

module.exports = {
  universeOf,
  recordingRows,
  rebaseRows,
  evaluate,
  alignWireRows,
  rateLines,
  evaluateWire,
}
