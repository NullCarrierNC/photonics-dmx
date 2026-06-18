import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

const mockGetPath = jest.fn()
jest.mock('electron', () => ({
  app: { getPath: (n: string) => mockGetPath(n) },
}))

// Wrap fs/promises.rename so individual tests can simulate transient failures,
// while every other call delegates to the real implementation.
jest.mock('fs/promises', () => {
  const actual = jest.requireActual('fs/promises')
  return {
    ...actual,
    rename: jest.fn((from: string, to: string) => actual.rename(from, to)),
  }
})

import { ConfigFile } from '../ConfigFile'

let testAppData: string

type TestData = { versionToken: string }

beforeAll(() => {
  testAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-cfg-'))
  mockGetPath.mockImplementation((name: string) => (name === 'appData' ? testAppData : os.tmpdir()))
})

afterAll(() => {
  fs.rmSync(testAppData, { recursive: true, force: true })
})

describe('ConfigFile.update', () => {
  // `fs.chmod` on a directory is not a reliable no-write signal on Windows; the rollback behaviour is still asserted on macOS / Linux in CI and locally.
  const itUnlessWin32 = process.platform === 'win32' ? it.skip : it

  itUnlessWin32('reverts in-memory data when the save after update fails', async () => {
    const filename = `config-update-rollback-${Date.now()}.json`
    const cf = new ConfigFile<TestData>(filename, { versionToken: 'a' }, 1, {})
    await cf.update({ versionToken: 'b' })
    expect(cf.get().versionToken).toBe('b')

    const configDir = path.join(testAppData, 'Photonics.rocks')
    const prev = fs.statSync(configDir).mode
    try {
      fs.chmodSync(configDir, 0o500)
      await expect(cf.update({ versionToken: 'c' })).rejects.toThrow()
    } finally {
      fs.chmodSync(configDir, prev)
    }

    expect(cf.get().versionToken).toBe('b')
  })
})

describe('ConfigFile rename retry', () => {
  const renameMock = fsPromises.rename as unknown as jest.Mock
  const realRename = jest.requireActual('fs/promises').rename

  const errnoError = (code: string): NodeJS.ErrnoException => {
    const err = new Error(`${code}: simulated`) as NodeJS.ErrnoException
    err.code = code
    return err
  }

  // Seed the file on disk so load() reads it instead of firing a default save —
  // keeps the rename call counts in these tests scoped to the update() under test.
  const seededConfig = (data: TestData): ConfigFile<TestData> => {
    const filename = `config-retry-${data.versionToken}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.json`
    const configDir = path.join(testAppData, 'Photonics.rocks')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(path.join(configDir, filename), JSON.stringify({ version: 1, data }))
    return new ConfigFile<TestData>(filename, data, 1, {})
  }

  afterEach(() => {
    renameMock.mockReset()
    renameMock.mockImplementation((...args: unknown[]) => realRename(...args))
  })

  it('retries transient EPERM rename failures then commits the update', async () => {
    let calls = 0
    renameMock.mockImplementation((from: string, to: string) => {
      calls++
      if (calls <= 2) return Promise.reject(errnoError('EPERM'))
      return realRename(from, to)
    })

    const cf = seededConfig({ versionToken: 'a' })
    await expect(cf.update({ versionToken: 'b' })).resolves.toBeUndefined()

    expect(renameMock).toHaveBeenCalledTimes(3)
    expect(cf.get().versionToken).toBe('b')
  })

  it('rejects and rolls back when EPERM persists past all retries', async () => {
    const cf = seededConfig({ versionToken: 'a' })
    renameMock.mockRejectedValue(errnoError('EPERM'))

    await expect(cf.update({ versionToken: 'b' })).rejects.toThrow('Failed to save configuration')
    expect(cf.get().versionToken).toBe('a')
  })

  it('does not retry non-transient errors (e.g. ENOSPC)', async () => {
    const cf = seededConfig({ versionToken: 'a' })
    renameMock.mockRejectedValue(errnoError('ENOSPC'))

    await expect(cf.update({ versionToken: 'b' })).rejects.toThrow('Failed to save configuration')
    expect(renameMock).toHaveBeenCalledTimes(1)
  })
})
