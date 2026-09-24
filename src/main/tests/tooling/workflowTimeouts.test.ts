import { describe, expect, it } from '@jest/globals'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const yaml = createRequire(require.resolve('app-builder-lib'))('js-yaml') as {
  load: (text: string) => { jobs?: Record<string, Record<string, unknown>> }
}

const workflows = join(__dirname, '../../../../.github/workflows')
const files = readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))

describe('workflow jobs', () => {
  it('finds the workflows', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s gives every job that runs steps a timeout', (file) => {
    const { jobs = {} } = yaml.load(readFileSync(join(workflows, file), 'utf8'))
    // A job that calls a reusable workflow takes no timeout of its own, and the called
    // workflow's jobs carry theirs.
    const untimed = Object.entries(jobs)
      .filter(([, job]) => job.uses === undefined)
      .filter(
        ([, job]) => !(typeof job['timeout-minutes'] === 'number' && job['timeout-minutes'] > 0),
      )
      .map(([name]) => name)

    expect(untimed).toEqual([])
  })
})
