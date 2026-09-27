/**
 * Runs wire scenarios and holds what went out to each scenario's expectations, so a review can
 * check a cue's DMX output without a rig or a running app.
 *
 *   npm run wire:check -- path/to/scenario.json --table
 *   npm run wire:check -- path/to/scenarios/ --out out/
 *   npm run wire:check -- path/to/scenario.json --transport sacn --port 5599
 *
 * A scenario (see src/main/wireCheck/wireScenario.ts) gives the config the app loads, the input
 * steps, the channels to watch, where 0 ms sits and the expected states. The run loads the real
 * ConfigurationManager, cue libraries, cue handlers and DmxPublisher on a virtual clock, and checks
 * the buffers the publisher sent.
 *
 * With --transport the run is in real time and each buffer also goes out through a real sACN or
 * Art-Net sender to 127.0.0.1 on --port, where dmx-log listens. The expectations are then held to
 * what dmx-log heard as well, along with the scenario's `wire.rateHz` packet rate. Run it with the
 * app closed or on a port the app is not using.
 *
 * Flags:
 *   --table               print each scenario's rows as a markdown table
 *   --out <dir>           write each scenario's rows as NDJSON, readable by `dmx:log -- --replay`
 *   --transport <name>    sacn or artnet: also send through that sender and listen with dmx-log
 *   --port <n>            the spare UDP port for --transport (default 5599)
 *
 * Exits 1 when a scenario fails or cannot run, and 2 on a usage error.
 */
import { spawn } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { renderTable } = require('./dmxLogCore.cjs')
const { evaluate, evaluateWire } = require('./wireCheckCore.cjs')
const { runCues } = require('./cueSimWatchdog.cjs')

/** A scenario runs in seconds, so one past this is stuck. */
const SCENARIO_TIMEOUT_MS = 120_000
/** Loading the engine compiles it through ts-node. */
const START_TIMEOUT_MS = 180_000
const DEFAULT_PORT = 5599
/** How long dmx-log gets to bind its port before the run gives up. */
const LISTEN_TIMEOUT_MS = 10_000

/** @param {string[]} argv */
function parseArgs(argv) {
  const paths = []
  let table = false
  let out
  let transport
  let port = DEFAULT_PORT
  const value = (i, flag) => {
    if (argv[i] === undefined) throw new Error(`${flag} needs a value`)
    return argv[i]
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--table') {
      table = true
    } else if (arg === '--out') {
      out = value(++i, arg)
    } else if (arg === '--transport') {
      transport = value(++i, arg)
      if (transport !== 'sacn' && transport !== 'artnet') {
        throw new Error(`--transport must be sacn or artnet, not '${transport}'`)
      }
    } else if (arg === '--port') {
      port = Number(value(++i, arg))
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error(`--port must be a whole number from 1024 to 65535`)
      }
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown flag '${arg}'`)
    } else {
      paths.push(arg)
    }
  }
  if (paths.length === 0) {
    throw new Error('Name at least one scenario file or folder')
  }
  return { paths, table, out, transport, port }
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

/**
 * Starts dmx-log on the port and resolves once it has bound it, so it hears the sender that
 * binds the same port after it.
 * @returns {Promise<{ stop: () => Promise<{ rows: object[], stats: object }> }>}
 */
function startLogger({ transport, port, dir }) {
  const rowsFile = join(dir, 'wire.ndjson')
  const statsFile = join(dir, 'stats.json')
  const args = [require.resolve('./dmx-log.mjs'), '--protocol', transport, '--port', String(port)]
  if (transport === 'sacn') args.push('--unicast')
  args.push('--out', rowsFile, '--stats', statsFile)
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  const exited = new Promise((resolve) => child.on('exit', resolve))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`dmx-log did not start listening:\n${stderr}`))
    }, LISTEN_TIMEOUT_MS)
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      if (!stderr.includes('Listening for')) return
      clearTimeout(timer)
      resolve({
        stop: async () => {
          child.kill('SIGINT')
          const code = await exited
          if (code !== 0) throw new Error(`dmx-log exited with ${code}:\n${stderr}`)
          const rows = readFileSync(rowsFile, 'utf8')
            .split('\n')
            .filter((line) => line.trim() !== '')
            .map((line) => JSON.parse(line))
          return { rows, stats: JSON.parse(readFileSync(statsFile, 'utf8')) }
        },
      })
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`dmx-log exited with ${code} before listening:\n${stderr}`))
    })
  })
}

/** Runs scenarios in one worker on the virtual clock. */
function runHeadless(scenarios) {
  return runCues({
    workerPath: require.resolve('./wire-check-worker.cjs'),
    cues: scenarios.map(({ file, scenario }) => ({ key: file, cue: file, scenario })),
    cueTimeoutMs: SCENARIO_TIMEOUT_MS,
    startTimeoutMs: START_TIMEOUT_MS,
  })
}

/** Runs each scenario in real time through a loopback sender, with dmx-log listening. */
async function runLoopback(scenarios, transport, port) {
  const results = []
  for (const { file, scenario } of scenarios) {
    const dir = mkdtempSync(join(tmpdir(), 'wire-check-log-'))
    try {
      const logger = await startLogger({ transport, port, dir })
      const loopback = { protocol: transport, port, universe: scenario.universe }
      const [result] = await runCues({
        workerPath: require.resolve('./wire-check-worker.cjs'),
        cues: [{ key: file, cue: file, scenario, loopback }],
        cueTimeoutMs: SCENARIO_TIMEOUT_MS,
        startTimeoutMs: START_TIMEOUT_MS,
      })
      results.push({ ...result, wire: await logger.stop() })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  return results
}

/** Prints one check's lines under a heading and returns whether it passed. */
function report(heading, rows, check, table) {
  if (heading) console.log(`\n### ${heading}`)
  if (table) console.log(renderTable(rows, null))
  if (check === null) {
    console.log('No expectations')
    return true
  }
  check.lines.forEach((line) => console.log(line))
  return check.ok
}

async function main() {
  const { paths, table, out, transport, port } = parseArgs(process.argv.slice(2))
  const scenarios = scenarioFiles(paths).map((file) => ({
    file,
    scenario: JSON.parse(readFileSync(file, 'utf8')),
  }))
  const results =
    transport === undefined
      ? await runHeadless(scenarios)
      : await runLoopback(scenarios, transport, port)

  let failed = 0
  results.forEach((result, index) => {
    const { file, scenario } = scenarios[index]
    console.log(`\n## ${scenario.name ?? basename(file)}`)
    if (result.outcome !== 'done') {
      failed++
      console.log(`ERROR (${result.outcome}): ${result.message}`)
      return
    }
    const sent = evaluate(scenario, result.value)
    const wire =
      result.wire && evaluateWire(scenario, result.value, result.wire.rows, result.wire.stats)
    if (out !== undefined) {
      mkdirSync(out, { recursive: true })
      const write = (rows, suffix) =>
        writeFileSync(
          join(out, `${basename(file, '.json')}${suffix}.ndjson`),
          rows.map((row) => JSON.stringify(row)).join('\n') + '\n',
        )
      write(sent.rows, '')
      if (wire) write(wire.rows, `.${transport}`)
    }
    let ok = report(wire ? 'Publisher sends' : null, sent.rows, sent.check, table)
    if (wire) ok = report(`${transport} on port ${port}`, wire.rows, wire.check, table) && ok
    if (!ok) failed++
  })
  console.log(`\n${results.length - failed} of ${results.length} scenarios passed`)
  process.exitCode = failed > 0 ? 1 : 0
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 2
})
