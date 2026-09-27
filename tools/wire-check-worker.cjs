/**
 * The wire check's worker: runs the scenarios cueSimWatchdog.cjs sends it through the real
 * ConfigurationManager, cue handlers and DmxPublisher, each in a fresh app-data folder with
 * Math.random seeded, and sends back the recorded publisher sends.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- ts-node's hook loads the engine */
const { join } = require('node:path')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const Module = require('node:module')

const root = join(__dirname, '..')
/** The app-data folder electron's `app.getPath('appData')` answers with for the current run. */
let appDataDir = tmpdir()

// The config store reads its folder from electron, which plain Node cannot load.
const electronStub = {
  app: {
    getPath: () => appDataDir,
    getAppPath: () => root,
    getVersion: () => '0.0.0-wire-check',
    isPackaged: false,
  },
}
const load = Module._load
Module._load = function loadWithElectronStub(request, ...rest) {
  return request === 'electron' ? electronStub : load.call(this, request, ...rest)
}

require('ts-node').register({ project: join(root, 'tsconfig.sim.json'), transpileOnly: true })
const { runWireScenario } = require('../src/main/wireCheck/runWireScenario')
const { seededRandom } = require('./cueSimCore.cjs')

/**
 * A seeded Math.random that leaves config file writes on the real one. The app saves its config
 * files as it loads them, and each save names its temp file from Math.random once the disk lets it
 * run, so those draws would land at a different point in the seeded stream from run to run.
 * @param {string} key
 * @param {() => number} realRandom
 */
function seededOutsideFileWrites(key, realRandom) {
  const seeded = seededRandom(key)
  return () =>
    /writeAtomic|writeFileAtomic/.test(new Error().stack ?? '') ? realRandom() : seeded()
}

/** @param {{ name: string, seed?: string }} scenario */
async function run(scenario) {
  appDataDir = mkdtempSync(join(tmpdir(), 'wire-check-'))
  const realRandom = Math.random
  Math.random = seededOutsideFileWrites(scenario.seed ?? scenario.name, realRandom)
  try {
    return await runWireScenario(scenario, appDataDir)
  } finally {
    Math.random = realRandom
    rmSync(appDataDir, { recursive: true, force: true })
  }
}

process.on('message', async ({ cues }) => {
  for (const { key, scenario } of cues) {
    process.send({ type: 'start', key })
    try {
      process.send({ type: 'result', key, value: await run(scenario) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.send({ type: 'failed', key, message })
    }
  }
  process.send({ type: 'finished' })
})
process.send({ type: 'ready' })
