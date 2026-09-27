/**
 * The cue-sim check's rules: the fixed run each bundled cue gets, reducing a simulated timeline to
 * a fingerprint, the committed fingerprint list, describing a cue whose fingerprint moved, and the
 * cueVersion guard. cue-sim-check.mjs owns git, the filesystem and the exit code.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the tests require this core
const { createHash } = require('node:crypto')
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a sibling tool core
const { isMissingCommit } = require('./coverageThresholdCore.cjs')

/**
 * The rig, tempo and length every cue runs with, the width of a fingerprint window, and when a row
 * is recorded: at every light-state publish, so a state that holds for one frame shows.
 */
const SETTINGS = {
  durationMs: 4000,
  frontCount: 4,
  backCount: 4,
  strobeCount: 2,
  bpm: 120,
  level: 0.6,
  windowMs: 250,
  sampling: 'publish',
}

/** The CueSimulator options every cue runs with, beside its library and domain. */
const SIMULATOR_OPTIONS = {
  frontCount: SETTINGS.frontCount,
  backCount: SETTINGS.backCount,
  strobeCount: SETTINGS.strobeCount,
  bpm: SETTINGS.bpm,
  level: SETTINGS.level,
  sampling: SETTINGS.sampling,
}

/** One fixed scenario per domain, applied at `at` ms into the run. */
const SCENARIOS = {
  yarg: [
    { at: 300, event: 'keyframe-first' },
    { at: 600, event: 'drum-red' },
    { at: 800, event: 'guitar-blue' },
    { at: 1000, event: 'keyframe-next' },
    { at: 1200, event: 'vocal-note' },
    { at: 1500, event: 'drum-kick' },
    { at: 1800, event: 'keyframe-next' },
    { at: 2100, event: 'bass-green' },
    { at: 2400, event: 'vocal-note-off' },
    { at: 2600, event: 'keyframe-previous' },
    { at: 3000, venue: 'Small' },
    { at: 3200, event: 'keyframe-next' },
  ],
  rb3: [
    { at: 0, ledBanks: { red: 0b00001111, green: 0, blue: 0, yellow: 0 } },
    { at: 700, ledBanks: { red: 0, green: 0b11110000, blue: 0, yellow: 0 } },
    { at: 1400, ledBanks: { red: 0b10101010, green: 0, blue: 0b01010101, yellow: 0 } },
    { at: 2100, ledBanks: { red: 0xff, green: 0xff, blue: 0xff, yellow: 0xff } },
    { at: 2800, ledBanks: { red: 0, green: 0, blue: 0, yellow: 0b00110011 } },
    { at: 3400, ledBanks: { red: 0, green: 0, blue: 0, yellow: 0 } },
  ],
  audio: [
    { at: 0, level: 0.2 },
    { at: 800, level: 0.95 },
    { at: 1600, level: 0.0 },
    { at: 2400, level: 0.6 },
    { at: 3200, level: 0.4 },
  ],
}

const DOMAINS = /** @type {const} */ (['yarg', 'rb3', 'audio'])

/** @param {string} text @returns {number} 32-bit FNV-1a */
function fnv1a(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return hash >>> 0
}

/**
 * @param {string} key a cue key
 * @returns {() => number} a mulberry32 generator seeded from the key
 */
function seededRandom(key) {
  let state = fnv1a(key)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** @typedef {{ key: string, domain: string, library: string, cue: string }} SimCue */

/**
 * @param {string} domain
 * @param {string} fileName the library's file name
 * @param {{ group?: { id?: string }, cues?: Array<Record<string, unknown>> }} library parsed JSON
 * @returns {SimCue[]} its cues, or none for a motion library, which the simulator does not drive
 */
function cuesInLibrary(domain, fileName, library) {
  const id = library.group?.id ?? fileName.replace(/\.json$/, '')
  if (id.includes('motion')) return []
  return (library.cues ?? []).map((entry) => {
    const cue = String(entry.cueType ?? entry.cueTypeId ?? entry.id)
    return { key: `${domain}__${id}__${cue}`, domain, library: id, cue }
  })
}

/**
 * @typedef {{ red: number, green: number, blue: number, intensity: number, opacity: number,
 *   blendMode: string } | null} LightState
 * @typedef {{ timeMs: number, lights: Record<string, LightState> }} Sample
 * @typedef {{ lights: string[], changes: Record<string, Array<[number, string]>> }} Reduced
 */

/** @param {LightState} state @returns {string} */
function stateCode(state) {
  if (!state) return 'off'
  const { red, green, blue, intensity, opacity, blendMode } = state
  return `rgb ${red},${green},${blue} i${intensity} o${opacity} ${blendMode}`
}

/**
 * @param {Sample[]} samples the simulator's rows, in time order
 * @returns {Reduced} each light's states at the times they change, the first at the first row
 */
function reduceTimeline(samples) {
  const lights = samples.length > 0 ? Object.keys(samples[0].lights) : []
  /** @type {Record<string, Array<[number, string]>>} */
  const changes = Object.fromEntries(lights.map((light) => [light, []]))
  for (const { timeMs, lights: states } of samples) {
    for (const light of lights) {
      const code = stateCode(states[light] ?? null)
      const list = changes[light]
      if (list.length === 0 || list[list.length - 1][1] !== code) list.push([timeMs, code])
    }
  }
  return { lights, changes }
}

/** @param {string} text @param {number} length @returns {string} */
function digestOf(text, length) {
  return createHash('sha256').update(text).digest('hex').slice(0, length)
}

/** @typedef {{ digest: string, lights: string[], windows: string[] }} Fingerprint */

/**
 * @param {Reduced} reduced
 * @returns {Fingerprint} a digest of the whole timeline, one per light, and one per window of the
 *   changes that fall in it, so a moved digest can say which lights and when
 */
function fingerprintOf(reduced) {
  const windowCount = Math.ceil(SETTINGS.durationMs / SETTINGS.windowMs) + 1
  /** @type {string[][]} */
  const byWindow = Array.from({ length: windowCount }, () => [])
  for (const light of reduced.lights) {
    for (const [t, code] of reduced.changes[light]) {
      const index = Math.min(windowCount - 1, Math.floor(t / SETTINGS.windowMs))
      byWindow[index].push(`${light}@${t}=${code}`)
    }
  }
  return {
    digest: digestOf(JSON.stringify(reduced), 12),
    lights: reduced.lights.map((light) => digestOf(JSON.stringify(reduced.changes[light]), 6)),
    windows: byWindow.map((entries) => digestOf(entries.join('\n'), 4)),
  }
}

function settingsLine() {
  const s = SETTINGS
  return (
    `duration ${s.durationMs} bpm ${s.bpm} front ${s.frontCount} back ${s.backCount}` +
    ` strobe ${s.strobeCount} level ${s.level} window ${s.windowMs} sampling ${s.sampling}`
  )
}

const NOTES = [
  'Auto-generated: seeded bundled-cue simulations. Each line holds the cue, its timeline digest, a digest per light in rig order and a digest per window.',
  'Rewrite with `npm run cue-sim:check -- --write` in the commit whose cue or engine change moved them.',
]

/**
 * @param {Map<string, Fingerprint>} entries by cue key
 * @returns {string} the committed list, sorted by key
 */
function renderList(entries) {
  const lines = [...entries]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, fp]) => `${key} ${fp.digest} ${fp.lights.join('.')} ${fp.windows.join('.')}`)
  return `${[settingsLine(), ...NOTES, ...lines].join('\n')}\n`
}

/**
 * @param {string} text the committed list
 * @returns {{ settingsMatch: boolean, entries: Map<string, Fingerprint>, malformed: string[] }}
 */
function parseList(text) {
  const lines = text.trim().split(/\r?\n/)
  /** @type {Map<string, Fingerprint>} */
  const entries = new Map()
  /** @type {string[]} */
  const malformed = []
  for (const line of lines.slice(1)) {
    if (line.trim() === '' || NOTES.includes(line)) continue
    const match = /^(\S+) ([0-9a-f]{12}) ([0-9a-f.]+) ([0-9a-f.]+)$/.exec(line)
    if (match) {
      entries.set(match[1], {
        digest: match[2],
        lights: match[3].split('.'),
        windows: match[4].split('.'),
      })
    } else {
      malformed.push(line)
    }
  }
  return { settingsMatch: lines[0] === settingsLine(), entries, malformed }
}

/**
 * @param {Map<string, Fingerprint>} expected the committed list
 * @param {Map<string, Fingerprint>} actual this run
 * @returns {{ moved: string[], added: string[], missing: string[] }} cue keys, sorted
 */
function compareFingerprints(expected, actual) {
  const sorted = (/** @type {string[]} */ keys) => keys.sort()
  return {
    moved: sorted(
      [...actual.keys()].filter(
        (key) => expected.has(key) && expected.get(key)?.digest !== actual.get(key)?.digest,
      ),
    ),
    added: sorted([...actual.keys()].filter((key) => !expected.has(key))),
    missing: sorted([...expected.keys()].filter((key) => !actual.has(key))),
  }
}

/** How many of a light's changes in the first differing window are printed. */
const SHOWN_CHANGES = 6

/**
 * @param {string} key
 * @param {Fingerprint} expected the committed fingerprint
 * @param {Fingerprint} actual this run's fingerprint
 * @param {Reduced} reduced this run's timeline
 * @returns {string[]} where the timeline first differs, and what each changed light shows there now
 */
function describeMove(key, expected, actual, reduced) {
  const window = actual.windows.findIndex((digest, i) => digest !== expected.windows[i])
  const lines = [`${key}:`]
  if (window < 0) {
    lines.push('  the timeline differs, but no window or light digest points to where')
    return lines
  }
  const from = window * SETTINGS.windowMs
  const to = from + SETTINGS.windowMs
  lines.push(`  first differs between ${from} and ${to} ms`)
  const changed = reduced.lights.filter((_, i) => actual.lights[i] !== expected.lights[i])
  if (changed.length === 0) lines.push('  no single light digest moved')
  for (const light of changed) {
    const changes = reduced.changes[light]
    const held = changes.filter(([t]) => t < from).pop()
    const inWindow = changes.filter(([t]) => t >= from && t < to)
    const shown = [
      ...(held ? [`held ${held[1]}`] : []),
      ...inWindow.slice(0, SHOWN_CHANGES).map(([t, code]) => `${t} ms ${code}`),
      ...(inWindow.length > SHOWN_CHANGES ? [`${inWindow.length - SHOWN_CHANGES} more`] : []),
    ]
    lines.push(`  ${light} now: ${shown.join(', ')}`)
  }
  return lines
}

/** @param {string} text @returns {{ version: number, body: string }} */
function versioned(text) {
  const { cueVersion, ...rest } = JSON.parse(text)
  return { version: typeof cueVersion === 'number' ? cueVersion : 0, body: JSON.stringify(rest) }
}

/**
 * @param {Array<{ path: string, base: string | null, current: string | null }>} files a bundled
 *   cue or effect file at the base and in the working tree, null where it does not exist
 * @returns {string[]} one problem per file whose content changed without its cueVersion rising
 */
function cueVersionProblems(files) {
  /** @type {string[]} */
  const problems = []
  for (const { path, base, current } of files) {
    if (base === null || current === null) continue
    let before
    let after
    try {
      before = versioned(base)
      after = versioned(current)
    } catch (error) {
      problems.push(`${path}: not valid JSON (${error instanceof Error ? error.message : error})`)
      continue
    }
    if (before.body !== after.body && after.version <= before.version) {
      problems.push(
        `${path}: content changed but cueVersion is ${after.version}, not above the base's ${before.version}`,
      )
    }
  }
  return problems
}

/**
 * @typedef {{ localRef: string, localSha: string, remoteRef: string, remoteSha: string }} PushedRef
 * @typedef {{ what: string, commit: string | null, base: string, against: string }} VersionBase
 *   `commit` is the commit whose files are compared, or null for the working tree
 * @typedef {{
 *   pushed: PushedRef[] | null,
 *   namedBase: string | undefined,
 *   hasCommit: (sha: string) => boolean,
 *   branchBase: (commit: string, ref: string) => string | null,
 *   mergeBase: (commit: string, other: string) => string | null,
 * }} VersionBaseInput
 */

/**
 * What the cueVersion guard compares bundled files against. Without the refs of a push, the
 * working tree is held to where HEAD meets its upstream or development. With them, as the pre-push
 * hook gives them, each pushed commit is held to what the remote already has, or to where it meets
 * its upstream or development when the remote has nothing for it yet. A named base, which CI gives
 * as the commit a push or pull request starts from, also holds the working tree to where HEAD meets
 * it. A base that cannot be found is a problem, so the guard never passes having compared nothing.
 * @param {VersionBaseInput} input
 * @returns {{ bases: VersionBase[], problems: string[] }}
 */
function cueVersionBases({ pushed, namedBase, hasCommit, branchBase, mergeBase }) {
  /** @type {VersionBase[]} */
  const bases = []
  /** @type {string[]} */
  const problems = []
  const noBranchBase = (/** @type {string} */ what) =>
    `${what}: no commit where it meets its upstream or development to compare bundled files with`
  if (pushed === null) {
    const base = branchBase('HEAD', 'HEAD')
    if (base)
      bases.push({ what: 'the working tree', commit: null, base, against: 'the branch base' })
    else problems.push(noBranchBase('the working tree'))
  } else {
    for (const ref of pushed) {
      if (!isMissingCommit(ref.remoteSha)) {
        if (hasCommit(ref.remoteSha)) {
          bases.push({
            what: ref.localRef,
            commit: ref.localSha,
            base: ref.remoteSha,
            against: `${ref.remoteRef} on the remote`,
          })
        } else {
          problems.push(
            `${ref.localRef}: ${ref.remoteRef} on the remote is at ${ref.remoteSha.slice(0, 8)}, which this clone does not have. Fetch it and push again.`,
          )
        }
        continue
      }
      const base = branchBase(ref.localSha, ref.localRef)
      if (base) {
        bases.push({ what: ref.localRef, commit: ref.localSha, base, against: 'its branch base' })
      } else {
        problems.push(noBranchBase(ref.localRef))
      }
    }
  }
  if (namedBase && !isMissingCommit(namedBase)) {
    const base = hasCommit(namedBase) ? mergeBase('HEAD', namedBase) : null
    if (base) {
      bases.push({
        what: 'the working tree',
        commit: null,
        base,
        against: 'where HEAD meets CUE_VERSION_BASE_REF',
      })
    } else {
      problems.push(
        `CUE_VERSION_BASE_REF names ${namedBase.slice(0, 8)}, which this clone does not have in HEAD's history`,
      )
    }
  }
  return { bases, problems }
}

module.exports = {
  SETTINGS,
  SIMULATOR_OPTIONS,
  SCENARIOS,
  DOMAINS,
  seededRandom,
  cuesInLibrary,
  reduceTimeline,
  fingerprintOf,
  renderList,
  parseList,
  compareFingerprints,
  describeMove,
  cueVersionProblems,
  cueVersionBases,
}
