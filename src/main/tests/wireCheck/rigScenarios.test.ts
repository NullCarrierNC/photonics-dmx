/**
 * The rig checks, as wire scenarios. Each runs headless through the app's real config load and
 * publisher, and what reaches the universe is held against the scenario's expectations.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { scenarioProblems, type WireScenario } from '../../wireCheck/wireScenario'

let mockAppData = ''

jest.mock('electron', () => ({
  app: { getPath: () => mockAppData, isPackaged: false },
}))

/* eslint-disable @typescript-eslint/no-require-imports -- imported after the electron mock */
const { runWireScenario } =
  require('../../wireCheck/runWireScenario') as typeof import('../../wireCheck/runWireScenario')
const { evaluate } = require('../../../../tools/wireCheckCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

jest.setTimeout(60000)

const SCENARIOS = path.join(__dirname, 'scenarios')

const scenarioFiles = fs
  .readdirSync(SCENARIOS)
  .filter((name) => name.endsWith('.json'))
  .sort()

describe('the rig check scenarios', () => {
  beforeEach(() => {
    mockAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-scenario-'))
  })

  afterEach(() => {
    fs.rmSync(mockAppData, { recursive: true, force: true })
  })

  it.each(scenarioFiles)('%s holds its expectations', async (name) => {
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(SCENARIOS, name), 'utf-8'))
    expect(scenarioProblems(raw)).toEqual([])
    const scenario = raw as WireScenario

    const recording = await runWireScenario(scenario, mockAppData)
    const { check } = evaluate(scenario, recording)

    expect(check.lines.filter((line: string) => !line.startsWith('PASS'))).toEqual([])
    expect(check.ok).toBe(true)
  })
})
