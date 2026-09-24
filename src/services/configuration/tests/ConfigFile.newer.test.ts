import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockGetPath = jest.fn()
jest.mock('electron', () => ({
  app: { getPath: (n: string) => mockGetPath(n) },
}))

import { ConfigFile } from '../ConfigFile'
import type { ConfigCorruptInfo } from '../configCorruptTypes'

type Layout = { strobeType: string }

const KNOWN_STROBES = new Set(['None', 'Dedicated'])

const validateLayout = (data: Layout): { valid: true } | { valid: false; errors: string[] } =>
  KNOWN_STROBES.has(data.strobeType)
    ? { valid: true }
    : { valid: false, errors: [`strobeType not a valid enum, got ${data.strobeType}`] }

let appData: string
let configDir: string
let fileCounter = 0

beforeAll(() => {
  appData = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-cfg-newer-'))
  configDir = path.join(appData, 'Photonics.rocks')
  fs.mkdirSync(configDir, { recursive: true })
  mockGetPath.mockImplementation((name: string) => (name === 'appData' ? appData : os.tmpdir()))
})

afterAll(() => {
  fs.rmSync(appData, { recursive: true, force: true })
})

function storedFile(content: unknown): { filename: string; filePath: string; text: string } {
  const filename = `layout-${Date.now()}-${fileCounter++}.json`
  const filePath = path.join(configDir, filename)
  const text = JSON.stringify(content)
  fs.writeFileSync(filePath, text)
  return { filename, filePath, text }
}

/** Waits for the defaults a recovery writes, so its rename lands inside the test that caused it. */
async function defaultsWritten(filePath: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    try {
      if (JSON.parse(fs.readFileSync(filePath, 'utf8'))?.data?.strobeType === 'None') return
    } catch {
      // Not there yet, or mid-write.
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`${filePath} never held the defaults`)
}

const siblingsOf = (filename: string): string[] =>
  fs
    .readdirSync(configDir)
    .filter((f) => f !== filename && f.startsWith(path.basename(filename, '.json')))

describe('ConfigFile holding a file from a newer build', () => {
  it('holds a newer file this build cannot validate and runs on defaults', async () => {
    const { filename, filePath, text } = storedFile({
      version: 2,
      data: { strobeType: 'FutureStrobeKind' },
    })
    const recoveries: ConfigCorruptInfo[] = []

    const cf = new ConfigFile<Layout>(filename, { strobeType: 'None' }, 1, {
      validate: validateLayout,
      onCorruptRecovery: (info) => recoveries.push(info),
    })

    expect(cf.get()).toEqual({ strobeType: 'None' })
    expect(recoveries.map((r) => r.reason)).toEqual(['newerVersion'])
    expect(recoveries[0].leftInPlace).toBe(true)
    await expect(cf.update({ strobeType: 'Dedicated' })).rejects.toThrow('newer version')
    expect(fs.readFileSync(filePath, 'utf8')).toBe(text)
    expect(siblingsOf(filename)).toEqual([])
  })

  it('uses a newer file this build can validate as it is', async () => {
    const { filename, filePath, text } = storedFile({
      version: 2,
      data: { strobeType: 'Dedicated' },
    })
    const recoveries: ConfigCorruptInfo[] = []

    const cf = new ConfigFile<Layout>(filename, { strobeType: 'None' }, 1, {
      validate: validateLayout,
      onCorruptRecovery: (info) => recoveries.push(info),
    })

    expect(cf.get()).toEqual({ strobeType: 'Dedicated' })
    expect(recoveries.map((r) => r.reason)).toEqual(['newerVersion'])
    expect(recoveries[0].leftInPlace).toBeUndefined()
    await expect(cf.update({ strobeType: 'None' })).rejects.toThrow('newer version')
    expect(fs.readFileSync(filePath, 'utf8')).toBe(text)
  })

  it('moves a current-version file this build cannot validate aside', async () => {
    const { filename, filePath } = storedFile({
      version: 1,
      data: { strobeType: 'FutureStrobeKind' },
    })
    const recoveries: ConfigCorruptInfo[] = []

    new ConfigFile<Layout>(filename, { strobeType: 'None' }, 1, {
      validate: validateLayout,
      onCorruptRecovery: (info) => recoveries.push(info),
    })

    expect(recoveries.map((r) => r.reason)).toEqual(['schema'])
    expect(siblingsOf(filename).filter((f) => f.includes('.corrupt-'))).toHaveLength(1)
    await defaultsWritten(filePath)
  })
})
