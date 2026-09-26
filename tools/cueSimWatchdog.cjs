/**
 * Runs cues through a forked worker, one at a time, and kills the worker when a cue outlives its
 * timeout or the worker dies. That cue fails, and a fresh worker picks up the cues after it.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the tests require this module
const { fork } = require('node:child_process')

/**
 * @typedef {{ key: string, cue: string }} WorkerCue
 * @typedef {{ key: string, outcome: 'done' | 'failed' | 'hung' | 'crashed', value?: unknown,
 *   message?: string }} CueResult
 * @typedef {{ type: 'ready' | 'start' | 'result' | 'failed' | 'finished', key: string,
 *   value?: unknown, message?: string }} WorkerMessage
 */

/** How much of a dead worker's stderr is kept for its report. */
const STDERR_TAIL = 2000

/**
 * @template {WorkerCue} T
 * @param {{ workerPath: string, cues: T[], cueTimeoutMs: number, startTimeoutMs: number,
 *   execArgv?: string[] }} options
 * @returns {Promise<CueResult[]>} one result per cue, in order
 */
async function runCues({ workerPath, cues, cueTimeoutMs, startTimeoutMs, execArgv = [] }) {
  /** @type {Map<string, CueResult>} */
  const results = new Map()
  let next = 0
  while (next < cues.length) {
    const batch = cues.slice(next)
    await runBatch(workerPath, execArgv, batch, cueTimeoutMs, startTimeoutMs, results)
    const unfinished = batch.findIndex(({ key }) => !results.has(key))
    next = unfinished < 0 ? cues.length : next + unfinished
  }
  return cues.map(({ key }) => /** @type {CueResult} */ (results.get(key)))
}

/**
 * Runs cues in one worker until they finish, one hangs or the worker dies. A worker that never
 * starts fails every cue in the batch.
 * @param {string} workerPath
 * @param {string[]} execArgv
 * @param {WorkerCue[]} batch
 * @param {number} cueTimeoutMs
 * @param {number} startTimeoutMs
 * @param {Map<string, CueResult>} results
 * @returns {Promise<void>}
 */
function runBatch(workerPath, execArgv, batch, cueTimeoutMs, startTimeoutMs, results) {
  return new Promise((resolve) => {
    const child = fork(workerPath, [], { execArgv, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-STDERR_TAIL)
    })
    /** @type {string | null} */
    let running = null
    let started = false
    let settled = false

    /** @param {CueResult['outcome']} outcome @param {string} message */
    const failRunning = (outcome, message) => {
      if (!started) {
        for (const { key } of batch) results.set(key, { key, outcome, message })
        return
      }
      const key = running ?? batch.find((cue) => !results.has(cue.key))?.key
      if (key !== undefined) results.set(key, { key, outcome, message })
    }
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill('SIGKILL')
      resolve()
    }
    let timer = setTimeout(() => {
      failRunning('crashed', `the simulation worker did not start within ${startTimeoutMs} ms`)
      finish()
    }, startTimeoutMs)
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        failRunning('hung', `did not finish within ${cueTimeoutMs} ms`)
        finish()
      }, cueTimeoutMs)
    }

    child.on('message', (/** @type {WorkerMessage} */ message) => {
      if (message.type === 'ready') {
        started = true
        child.send({ cues: batch })
      } else if (message.type === 'start') {
        running = message.key
        arm()
      } else if (message.type === 'result' || message.type === 'failed') {
        results.set(message.key, {
          key: message.key,
          outcome: message.type === 'result' ? 'done' : 'failed',
          ...(message.type === 'result' ? { value: message.value } : { message: message.message }),
        })
        running = null
      } else if (message.type === 'finished') {
        finish()
      }
    })
    child.on('exit', (code, signal) => {
      if (settled) return
      const tail = stderr.trim().split('\n').slice(-5).join('\n')
      failRunning('crashed', `the worker exited (${signal ?? code})${tail ? `\n${tail}` : ''}`)
      finish()
    })
  })
}

module.exports = { runCues }
