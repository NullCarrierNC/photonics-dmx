/**
 * The DMX wire logger's rules: which channels to watch, reducing received packets to change rows,
 * moving time zero, rendering rows as a table, and holding a recording to an ordered list of
 * expected states. dmx-log.mjs owns the socket, the files and the exit code.
 *
 * A row is `{ ms, u, src, ch }`: at `ms` the source `src` changed the listed channels of universe
 * `u` to the listed values. The first packet from each source always makes a row that lists every
 * watched channel above 0, so a channel not yet listed reads 0. A recording ends with one
 * `{ ms, end: true }` row that marks when listening stopped.
 */

const DMX_CHANNELS = 512

/**
 * @param {string | undefined} spec such as "1-12,20"; empty or undefined means all 512
 * @returns {number[]} sorted, unique channel numbers from 1 to 512
 */
function parseChannelSpec(spec) {
  if (spec === undefined || spec.trim() === '') {
    return Array.from({ length: DMX_CHANNELS }, (_, i) => i + 1)
  }
  const channels = new Set()
  for (const part of spec.split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part)
    if (!match) {
      throw new Error(`Bad channel range '${part}'`)
    }
    const from = Number(match[1])
    const to = match[2] === undefined ? from : Number(match[2])
    if (from < 1 || to > DMX_CHANNELS || from > to) {
      throw new Error(`Channel range '${part}' is outside 1-${DMX_CHANNELS}`)
    }
    for (let ch = from; ch <= to; ch++) {
      channels.add(ch)
    }
  }
  return [...channels].sort((a, b) => a - b)
}

/**
 * @param {ArrayLike<number> | null} prev the source's last frame, or null for its first packet
 * @param {ArrayLike<number>} frame index 0 is channel 1
 * @param {number[]} channels
 * @returns {Record<string, number> | null} the watched channels that differ, or null when none do
 */
function diffFrame(prev, frame, channels) {
  /** @type {Record<string, number>} */
  const changed = {}
  let any = false
  for (const ch of channels) {
    const value = frame[ch - 1] ?? 0
    const before = prev === null ? 0 : prev[ch - 1] ?? 0
    if (value !== before) {
      changed[ch] = value
      any = true
    }
  }
  return any ? changed : null
}

/**
 * Turns packets into change rows as they arrive. A packet is `{ ms, u, src, dmx }`.
 * @param {number[]} channels
 */
function createRecorder(channels) {
  /** @type {Map<string, ArrayLike<number>>} */
  const last = new Map()
  return {
    /** @returns {{ ms: number, u: number, src: string, ch: Record<string, number> } | null} */
    push(packet) {
      const key = `${packet.u}|${packet.src}`
      const prev = last.get(key) ?? null
      const changed = diffFrame(prev, packet.dmx, channels)
      last.set(key, Array.from(packet.dmx))
      if (changed === null && prev !== null) {
        return null
      }
      return { ms: packet.ms, u: packet.u, src: packet.src, ch: changed ?? {} }
    },
  }
}

/**
 * @param {Array<{ ms: number, u: number, src: string, dmx: ArrayLike<number> }>} packets
 * @param {number[]} channels
 */
function changeRows(packets, channels) {
  const recorder = createRecorder(channels)
  return packets.map((packet) => recorder.push(packet)).filter((row) => row !== null)
}

/**
 * Moves time zero to the first row that lights any watched channel ('first-change'), or to the
 * first row ('first-packet'). With nothing lit, 'first-change' falls back to the first row.
 * @param {Array<{ ms: number, ch?: Record<string, number> }>} rows
 * @param {'first-change' | 'first-packet'} mode
 */
function rebase(rows, mode) {
  if (rows.length === 0) {
    return []
  }
  const lit = mode === 'first-change' ? rows.find((row) => litRow(row)) : undefined
  const zero = (lit ?? rows[0]).ms
  return rows.map((row) => ({ ...row, ms: row.ms - zero }))
}

/** @param {{ ch?: Record<string, number> }} row */
function litRow(row) {
  return row.ch !== undefined && Object.values(row.ch).some((value) => value > 0)
}

/**
 * The value of every channel after each row, merged across sources, one universe at a time.
 * @param {Array<{ ms: number, u?: number, end?: boolean, ch?: Record<string, number> }>} rows
 * @param {number} universe
 * @returns {{ states: Array<{ ms: number, values: Map<number, number> }>, endMs: number | null }}
 */
function statesOf(rows, universe) {
  /** @type {Map<number, number>} */
  let values = new Map()
  const states = []
  let endMs = null
  for (const row of rows) {
    if (row.end) {
      endMs = row.ms
      continue
    }
    if (row.u !== universe) {
      continue
    }
    values = new Map(values)
    for (const [ch, value] of Object.entries(row.ch ?? {})) {
      values.set(Number(ch), value)
    }
    states.push({ ms: row.ms, values })
  }
  return { states, endMs }
}

/** @param {Array<{ u?: number, end?: boolean }>} rows */
function universesOf(rows) {
  return [...new Set(rows.filter((row) => !row.end).map((row) => row.u))].sort((a, b) => a - b)
}

/**
 * A markdown table of the watched channels after every row. Channels default to the ones that
 * are ever above 0, and a universe column appears when the rows span more than one.
 * @param {Array<{ ms: number, u?: number, end?: boolean, ch?: Record<string, number> }>} rows
 * @param {number[] | null} channels
 */
function renderTable(rows, channels) {
  const universes = universesOf(rows)
  const shown =
    channels ??
    [
      ...new Set(
        rows.flatMap((row) =>
          Object.entries(row.ch ?? {})
            .filter(([, value]) => value > 0)
            .map(([ch]) => Number(ch)),
        ),
      ),
    ].sort((a, b) => a - b)
  const multi = universes.length > 1
  const head = ['ms', ...(multi ? ['u'] : []), ...shown.map(String)]
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`]
  const merged = universes
    .flatMap((u) => statesOf(rows, u).states.map((state) => ({ ...state, u })))
    .sort((a, b) => a.ms - b.ms || a.u - b.u)
  for (const state of merged) {
    const cells = shown.map((ch) => String(state.values.get(ch) ?? 0))
    lines.push(`| ${[state.ms, ...(multi ? [state.u] : []), ...cells].join(' | ')} |`)
  }
  return lines.join('\n')
}

/**
 * @param {Map<number, number>} values
 * @param {Record<string, number>} want
 * @param {number} valueTol
 */
function matches(values, want, valueTol) {
  return Object.entries(want).every(
    ([ch, value]) => Math.abs((values.get(Number(ch)) ?? 0) - value) <= valueTol,
  )
}

/**
 * Walks the expected states in order. Each must appear at or after the previous one. `atMs`, when
 * given, must be within `timeTolMs` of when the state appears, and picks that occurrence when the
 * state appears more than once. `holdMs`, when given, is how long the state must then last before
 * any listed channel leaves it.
 * @param {Array<{ ms: number, u?: number, end?: boolean, ch?: Record<string, number> }>} rows
 * @param {{ universe?: number, states: Array<{ ch: Record<string, number>, atMs?: number, holdMs?: number, label?: string }> }} expect
 * @param {{ timeTolMs?: number, valueTol?: number }} [options]
 * @returns {{ ok: boolean, lines: string[] }}
 */
function checkExpectations(rows, expect, options = {}) {
  const timeTolMs = options.timeTolMs ?? 30
  const valueTol = options.valueTol ?? 0
  const universe = expect.universe ?? universesOf(rows)[0] ?? 1
  const { states, endMs } = statesOf(rows, universe)
  const lines = []
  let ok = true
  let from = 0
  expect.states.forEach((want, index) => {
    const name = `state ${index + 1}${want.label ? ` (${want.label})` : ''}`
    const reached = states
      .map((state, i) => i)
      .filter((i) => i >= from && matches(states[i].values, want.ch, valueTol))
    const onTime = reached.find(
      (i) => want.atMs === undefined || Math.abs(states[i].ms - want.atMs) <= timeTolMs,
    )
    const at = onTime ?? reached[0] ?? -1
    if (at < 0) {
      ok = false
      lines.push(`FAIL ${name}: never reached ${JSON.stringify(want.ch)}`)
      return
    }
    from = at
    const reachedMs = states[at].ms
    const problems = []
    if (want.atMs !== undefined && Math.abs(reachedMs - want.atMs) > timeTolMs) {
      problems.push(`reached at ${reachedMs} ms, expected ${want.atMs} ± ${timeTolMs} ms`)
    }
    if (want.holdMs !== undefined) {
      const left = states.findIndex(
        (state, i) => i > at && !matches(state.values, want.ch, valueTol),
      )
      const untilMs = left >= 0 ? states[left].ms : endMs
      const heldMs = untilMs === null ? null : untilMs - reachedMs
      if (heldMs === null) {
        problems.push('the recording has no end marker, so the hold cannot be measured')
      } else if (heldMs < want.holdMs) {
        const why = left >= 0 ? 'changed' : 'the recording ended'
        problems.push(`held ${heldMs} ms, expected ${want.holdMs} ms (${why})`)
      }
    }
    if (problems.length > 0) {
      ok = false
      lines.push(`FAIL ${name}: ${problems.join(', ')}`)
    } else {
      lines.push(`PASS ${name}: reached at ${reachedMs} ms`)
    }
  })
  return { ok, lines }
}

module.exports = {
  parseChannelSpec,
  diffFrame,
  createRecorder,
  changeRows,
  rebase,
  statesOf,
  renderTable,
  checkExpectations,
}
