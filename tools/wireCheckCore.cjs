/**
 * The wire check's rules: turning a scenario's recorded publisher sends into dmx-log change rows,
 * moving time zero, and holding the rows to the scenario's expectations. wire-check.mjs owns the
 * files, the worker and the exit code.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- the tests require this module */
const { parseChannelSpec, changeRows, rebase, checkExpectations } = require('./dmxLogCore.cjs')

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

module.exports = { universeOf, recordingRows, rebaseRows, evaluate }
