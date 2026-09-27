/**
 * The cue-sim check's worker: runs the cues cueSimWatchdog.cjs sends it through the real
 * CueSimulator, each with Math.random seeded from its key, and sends back the recorded rows.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- ts-node's hook loads the engine */
const { join } = require('node:path')

require('ts-node').register({
  project: join(__dirname, '..', 'tsconfig.sim.json'),
  transpileOnly: true,
})
const { CueSimulator } = require('../src/photonics-dmx/sim/CueSimulator')
const { SETTINGS, SIMULATOR_OPTIONS, SCENARIOS, seededRandom } = require('./cueSimCore.cjs')

/** @param {{ key: string, domain: 'yarg' | 'rb3' | 'audio', library: string, cue: string }} cue */
async function simulate({ key, domain, library, cue }) {
  const realRandom = Math.random
  Math.random = seededRandom(key)
  try {
    const sim = await CueSimulator.create({ library, domain, ...SIMULATOR_OPTIONS })
    try {
      sim.setCue(cue)
      sim.loadScenario(SCENARIOS[domain])
      const timeline = await sim.run(SETTINGS.durationMs)
      return timeline.samples.map(({ timeMs, lights }) => ({ timeMs, lights }))
    } finally {
      sim.dispose()
    }
  } finally {
    Math.random = realRandom
  }
}

process.on('message', async ({ cues }) => {
  for (const cue of cues) {
    process.send({ type: 'start', key: cue.key })
    try {
      process.send({ type: 'result', key: cue.key, value: await simulate(cue) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.send({ type: 'failed', key: cue.key, message })
    }
  }
  process.send({ type: 'finished' })
})
process.send({ type: 'ready' })
