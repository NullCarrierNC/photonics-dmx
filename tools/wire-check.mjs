/**
 * Runs wire scenarios headless and holds what the publisher sent to each scenario's expectations,
 * so a review can check a cue's DMX output without a rig or a running app.
 *
 *   npm run wire:check -- path/to/scenario.json --table
 *   npm run wire:check -- path/to/scenarios/ --out out/
 *
 * A scenario (see src/main/wireCheck/wireScenario.ts) gives the config the app loads, the input
 * steps, the channels to watch, where 0 ms sits and the expected states. The run loads the real
 * ConfigurationManager, cue libraries, cue handlers and DmxPublisher on a virtual clock.
 *
 * Flags:
 *   --table        print each scenario's rows as a markdown table
 *   --out <dir>    write each scenario's rows as NDJSON, readable by `npm run dmx:log -- --replay`
 *
 * Exits 1 when a scenario fails or cannot run, and 2 on a usage error.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { renderTable } = require('./dmxLogCore.cjs')
const { evaluate } = require('./wireCheckCore.cjs')
const { runCues } = require('./cueSimWatchdog.cjs')

/** A scenario runs in seconds, so one past this is stuck. */
const SCENARIO_TIMEOUT_MS = 120_000
/** Loading the engine compiles it through ts-node. */
const START_TIMEOUT_MS = 180_000

/** @param {string[]} argv */
function parseArgs(argv) {
  const paths = []
  let table = false
  let out
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--table') {
      table = true
    } else if (arg === '--out') {
      out = argv[++i]
      if (out === undefined) throw new Error('--out needs a folder')
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown flag '${arg}'`)
    } else {
      paths.push(arg)
    }
  }
  if (paths.length === 0) {
    throw new Error('Name at least one scenario file or folder')
  }
  return { paths, table, out }
}

/** @param {string[]} paths @returns {string[]} the scenario files, folders expanded to their .json files */
function scenarioFiles(paths) {
  return paths.flatMap((path) =>
    statSync(path).isDirectory()
      ? readdirSync(path)
          .filter((name) => name.endsWith('.json'))
          .sort()
          .map((name) => join(path, name))
      : [path],
  )
}

async function main() {
  const { paths, table, out } = parseArgs(process.argv.slice(2))
  const scenarios = scenarioFiles(paths).map((file) => ({
    file,
    scenario: JSON.parse(readFileSync(file, 'utf8')),
  }))
  const results = await runCues({
    workerPath: require.resolve('./wire-check-worker.cjs'),
    cues: scenarios.map(({ file, scenario }) => ({ key: file, cue: file, scenario })),
    cueTimeoutMs: SCENARIO_TIMEOUT_MS,
    startTimeoutMs: START_TIMEOUT_MS,
  })

  let failed = 0
  results.forEach((result, index) => {
    const { file, scenario } = scenarios[index]
    console.log(`\n## ${scenario.name ?? basename(file)}`)
    if (result.outcome !== 'done') {
      failed++
      console.log(`ERROR (${result.outcome}): ${result.message}`)
      return
    }
    const { rows, check } = evaluate(scenario, result.value)
    if (out !== undefined) {
      mkdirSync(out, { recursive: true })
      const ndjson = rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
      writeFileSync(join(out, `${basename(file, '.json')}.ndjson`), ndjson)
    }
    if (table) {
      console.log(renderTable(rows, null))
    }
    if (check === null) {
      console.log('No expectations')
      return
    }
    check.lines.forEach((line) => console.log(line))
    if (!check.ok) failed++
  })
  console.log(`\n${results.length - failed} of ${results.length} scenarios passed`)
  process.exitCode = failed > 0 ? 1 : 0
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 2
})
