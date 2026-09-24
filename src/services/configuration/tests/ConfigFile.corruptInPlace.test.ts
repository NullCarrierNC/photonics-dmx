import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockGetPath = jest.fn()
jest.mock('electron', () => ({
  app: { getPath: (n: string) => mockGetPath(n) },
}))

// The load's move-aside is refused the way a lock held past the retries refuses it.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs')
  return {
    ...actual,
    renameSync: jest.fn((from: string, to: string) => actual.renameSync(from, to)),
  }
})

import { ConfigFile } from '../ConfigFile'
import type { ConfigCorruptInfo } from '../configCorruptTypes'

type Lights = { lights: Array<{ id: string }> }

const renameSyncMock = jest.mocked(fs.renameSync)
const realRenameSync = jest.requireActual<typeof fs>('fs').renameSync

let appData: string
let configDir: string
let fileCounter = 0

beforeAll(() => {
  appData = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-cfg-in-place-'))
  configDir = path.join(appData, 'Photonics.rocks')
  fs.mkdirSync(configDir, { recursive: true })
  mockGetPath.mockImplementation((name: string) => (name === 'appData' ? appData : os.tmpdir()))
})

afterAll(() => {
  fs.rmSync(appData, { recursive: true, force: true })
})

afterEach(() => {
  renameSyncMock.mockReset()
  renameSyncMock.mockImplementation((from, to) => realRenameSync(from, to))
})

const REPAIRED: Lights = { lights: [{ id: 'hand-repaired' }] }

/** A corrupt file the load could not move aside, then repaired by hand while the app runs. */
function repairedInPlace(): {
  cf: ConfigFile<Lights>
  filename: string
  filePath: string
  recoveries: ConfigCorruptInfo[]
} {
  const filename = `lights-${Date.now()}-${fileCounter++}.json`
  const filePath = path.join(configDir, filename)
  fs.writeFileSync(filePath, '{ "version": 1, "data": { not json')
  renameSyncMock.mockImplementation(() => {
    throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
  })
  const recoveries: ConfigCorruptInfo[] = []
  const cf = new ConfigFile<Lights>(filename, { lights: [] }, 1, {
    onCorruptRecovery: (info) => recoveries.push(info),
  })
  renameSyncMock.mockImplementation((from, to) => realRenameSync(from, to))
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, data: REPAIRED }))
  return { cf, filename, filePath, recoveries }
}

const copiesOf = (filename: string): string[] =>
  fs
    .readdirSync(configDir)
    .filter((f) => f.startsWith(`${path.basename(filename, '.json')}.repaired-`))

const readData = (filePath: string): Lights => JSON.parse(fs.readFileSync(filePath, 'utf8')).data

describe('ConfigFile hand repair of a corrupt file left in place', () => {
  it('keeps a copy of the repair before an update replaces it', async () => {
    const { cf, filename, filePath, recoveries } = repairedInPlace()
    expect(recoveries.map((r) => r.leftInPlace)).toEqual([true])
    const heldBeforeRepair = cf.get()

    await cf.update({ lights: [...heldBeforeRepair.lights, { id: 'added-on-page' }] })

    expect(readData(filePath)).toEqual({ lights: [{ id: 'added-on-page' }] })
    const copies = copiesOf(filename)
    expect(copies).toHaveLength(1)
    expect(readData(path.join(configDir, copies[0]))).toEqual(REPAIRED)
    const reported = recoveries.find((r) => r.reason === 'repairCopied')
    expect(reported?.fileName).toBe(filename)
    expect(reported?.message).toContain(copies[0])
  })

  it('copies the repair once, on the first replacement', async () => {
    const { cf, filename } = repairedInPlace()

    await cf.update({ lights: [{ id: 'first' }] })
    await cf.update({ lights: [{ id: 'second' }] })

    expect(copiesOf(filename)).toHaveLength(1)
  })

  it('applies a mutate turn over the repair without a copy', async () => {
    const { cf, filename, filePath } = repairedInPlace()

    await cf.mutate((current) => ({ lights: [...current.lights, { id: 'added' }] }))

    expect(readData(filePath)).toEqual({ lights: [{ id: 'hand-repaired' }, { id: 'added' }] })
    expect(copiesOf(filename)).toEqual([])
  })

  it('keeps a copy for an update that follows a mutate turn over the repair', async () => {
    const { cf, filename } = repairedInPlace()

    await cf.mutate((current) => ({ lights: [...current.lights, { id: 'added' }] }))
    await cf.update({ lights: [] })

    const copies = copiesOf(filename)
    expect(copies).toHaveLength(1)
    expect(readData(path.join(configDir, copies[0]))).toEqual({
      lights: [{ id: 'hand-repaired' }, { id: 'added' }],
    })
  })
})
