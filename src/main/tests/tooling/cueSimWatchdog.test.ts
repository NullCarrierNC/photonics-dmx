import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const { runCues } = require('../../../../tools/cueSimWatchdog.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const worker = require.resolve('./fixtures/cueSimFakeWorker.cjs')
const cue = (name: string): { key: string; cue: string } => ({
  key: `yarg__lib__${name}`,
  cue: name,
})

describe('cue-sim watchdog', () => {
  it('fails a cue that hangs or kills its worker and still runs the cues after it', async () => {
    const results = await runCues({
      workerPath: worker,
      cues: ['Menu', 'spin', 'Intro', 'stall', 'Verse', 'crash', 'fail', 'Chorus'].map(cue),
      cueTimeoutMs: 1000,
      startTimeoutMs: 10000,
    })
    expect(
      results.map((r: { key: string; outcome: string }) => [r.key.split('__')[2], r.outcome]),
    ).toEqual([
      ['Menu', 'done'],
      ['spin', 'hung'],
      ['Intro', 'done'],
      ['stall', 'hung'],
      ['Verse', 'done'],
      ['crash', 'crashed'],
      ['fail', 'failed'],
      ['Chorus', 'done'],
    ])
    expect(results[0].value).toEqual({ cue: 'Menu' })
    expect(results[6].message).toBe('no such cue')
  }, 30000)

  it('fails every cue when the worker never starts', async () => {
    const results = await runCues({
      workerPath: `${__dirname}/fixtures/missingWorker.cjs`,
      cues: ['Menu', 'Intro'].map(cue),
      cueTimeoutMs: 1000,
      startTimeoutMs: 5000,
    })
    expect(results.map((r: { outcome: string }) => r.outcome)).toEqual(['crashed', 'crashed'])
  }, 30000)
})
