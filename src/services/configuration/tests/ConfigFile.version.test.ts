import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockGetPath = jest.fn()
jest.mock('electron', () => ({
  app: { getPath: (n: string) => mockGetPath(n) },
}))

import { ConfigFile } from '../ConfigFile'
import type { ConfigCorruptInfo } from '../configCorruptTypes'

type TestData = { a: number }

const CURRENT_VERSION = 3
/** More migration steps than any version could need, which ends a runaway walk. */
const STEP_LIMIT = 10

let appData: string
let configDir: string

beforeAll(() => {
  appData = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-cfg-version-'))
  configDir = path.join(appData, 'Photonics.rocks')
  fs.mkdirSync(configDir, { recursive: true })
  mockGetPath.mockImplementation((name: string) => (name === 'appData' ? appData : os.tmpdir()))
})

afterAll(() => {
  fs.rmSync(appData, { recursive: true, force: true })
})

/** Records each migration step it is asked for, and refuses to walk past the step limit. */
class StepRecordingConfigFile extends ConfigFile<TestData> {
  static steps: Array<[number, number]> = []
  static runaway = false

  protected override applyMigration(data: TestData, fromVersion: number, toVersion: number) {
    StepRecordingConfigFile.steps.push([fromVersion, toVersion])
    if (StepRecordingConfigFile.steps.length > STEP_LIMIT) {
      StepRecordingConfigFile.runaway = true
      throw new Error('migration walked past the step limit')
    }
    return data
  }
}

type Loaded = {
  file: StepRecordingConfigFile
  recoveries: ConfigCorruptInfo[]
  steps: Array<[number, number]>
  runaway: boolean
  backups: string[]
  filePath: string
}

let fileCounter = 0

function loadStored(text: string): Loaded {
  const filename = `version-${Date.now()}-${fileCounter++}.json`
  const filePath = path.join(configDir, filename)
  fs.writeFileSync(filePath, text)
  StepRecordingConfigFile.steps = []
  StepRecordingConfigFile.runaway = false
  const recoveries: ConfigCorruptInfo[] = []
  const file = new StepRecordingConfigFile(filename, { a: 0 }, CURRENT_VERSION, {
    onCorruptRecovery: (info) => recoveries.push(info),
  })
  const backups = fs
    .readdirSync(configDir)
    .filter((f) => f.startsWith(`${path.basename(filename, '.json')}.corrupt-`))
  return {
    file,
    recoveries,
    steps: [...StepRecordingConfigFile.steps],
    runaway: StepRecordingConfigFile.runaway,
    backups,
    filePath,
  }
}

/** Waits for the write a load queues, so its rename lands inside the test that caused it. */
async function storedVersion(filePath: string, expected: number): Promise<void> {
  for (let i = 0; i < 200; i++) {
    try {
      if (JSON.parse(fs.readFileSync(filePath, 'utf8'))?.version === expected) return
    } catch {
      // Mid-write.
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`${filePath} never held version ${expected}`)
}

describe('ConfigFile envelope version', () => {
  it.each([
    ['-1', '-1'],
    ['-1e10', '-1e10'],
    ['-1e300', '-1e300'],
    ['1.5', '1.5'],
    ['the string "3"', '"3"'],
    ['null', 'null'],
    ['1e300', '1e300'],
  ])('moves a file whose version is %s aside and loads defaults', async (_label, versionText) => {
    const loaded = loadStored(`{"version": ${versionText}, "data": {"a": 7}}`)

    expect(loaded.runaway).toBe(false)
    expect(loaded.steps).toEqual([])
    expect(loaded.recoveries.map((r) => r.reason)).toEqual(['schema'])
    expect(loaded.backups).toHaveLength(1)
    expect(loaded.file.get()).toEqual({ a: 0 })
    await storedVersion(loaded.filePath, CURRENT_VERSION)
  })

  it.each([0, 1, 2])('migrates a version %i file one whole step at a time', async (version) => {
    const loaded = loadStored(JSON.stringify({ version, data: { a: 7 } }))

    expect(loaded.recoveries).toEqual([])
    expect(loaded.file.get()).toEqual({ a: 7 })
    const expectedSteps: Array<[number, number]> = []
    for (let v = version; v < CURRENT_VERSION; v++) expectedSteps.push([v, v + 1])
    expect(loaded.steps).toEqual(expectedSteps)
    await storedVersion(loaded.filePath, CURRENT_VERSION)
  })

  it('loads a current-version file without migrating', () => {
    const loaded = loadStored(JSON.stringify({ version: CURRENT_VERSION, data: { a: 7 } }))

    expect(loaded.recoveries).toEqual([])
    expect(loaded.steps).toEqual([])
    expect(loaded.file.get()).toEqual({ a: 7 })
  })

  it('migrates a legacy file with no envelope from version 0', async () => {
    const loaded = loadStored(JSON.stringify({ a: 7 }))

    expect(loaded.recoveries).toEqual([])
    expect(loaded.file.get()).toEqual({ a: 7 })
    expect(loaded.steps).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ])
    await storedVersion(loaded.filePath, CURRENT_VERSION)
  })
})
