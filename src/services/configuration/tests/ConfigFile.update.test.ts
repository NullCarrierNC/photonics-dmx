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

describe('ConfigFile.update write-time validation', () => {
  const configDir = (): string => path.join(testAppData, 'Photonics.rocks')

  // Seed a valid file on disk so load() reads it rather than firing a default save, letting each
  // test compare the exact bytes before and after a rejected update.
  const seeded = (
    filename: string,
    data: TestData,
    validate?: (d: TestData) => { valid: true } | { valid: false; errors: string[] },
  ): ConfigFile<TestData> => {
    fs.mkdirSync(configDir(), { recursive: true })
    fs.writeFileSync(path.join(configDir(), filename), JSON.stringify({ version: 1, data }))
    return new ConfigFile<TestData>(filename, data, 1, validate ? { validate } : {})
  }

  const rejectsB = (d: TestData): { valid: true } | { valid: false; errors: string[] } =>
    d.versionToken === 'b'
      ? { valid: false, errors: ['versionToken must not be b'] }
      : { valid: true }

  // `applyLoadMigration` and `recoverToDefault` both write via an un-awaited `save()`, so a test
  // that reads straight after them races the write — and an unsettled write also leaks a rename
  // into the next describe's call counts. Poll for the expected token rather than for the file to
  // exist: these files are seeded before the call, so existence is true from the start.
  const readWhenToken = async (filename: string, token: string): Promise<{ data: TestData }> => {
    const filePath = path.join(configDir(), filename)
    for (let i = 0; i < 100; i++) {
      if (fs.existsSync(filePath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
          if (parsed?.data?.versionToken === token) return parsed
        } catch {
          // Mid-write; fall through and retry.
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error(`Timed out waiting for ${filePath} to hold versionToken "${token}"`)
  }

  it('rejects an invalid update and leaves the file untouched', async () => {
    const filename = `config-validate-reject-${Date.now()}.json`
    const cf = seeded(filename, { versionToken: 'a' }, rejectsB)
    const filePath = path.join(configDir(), filename)
    const before = fs.readFileSync(filePath, 'utf8')

    await expect(cf.update({ versionToken: 'b' })).rejects.toThrow('versionToken must not be b')

    expect(fs.readFileSync(filePath, 'utf8')).toBe(before)
    expect(cf.get().versionToken).toBe('a')
  })

  it('still saves an update the validator accepts', async () => {
    const filename = `config-validate-accept-${Date.now()}.json`
    const cf = seeded(filename, { versionToken: 'a' }, rejectsB)

    await expect(cf.update({ versionToken: 'c' })).resolves.toBeUndefined()

    expect(cf.get().versionToken).toBe('c')
    const onDisk = JSON.parse(fs.readFileSync(path.join(configDir(), filename), 'utf8'))
    expect(onDisk.data.versionToken).toBe('c')
  })

  it('does not gate applyLoadMigration', async () => {
    // A migration's output must publish even if it trips a validator edge, or the app runs on a
    // shape the rest of the code no longer understands.
    const filename = `config-validate-migration-${Date.now()}.json`
    const cf = seeded(filename, { versionToken: 'a' }, rejectsB)

    cf.applyLoadMigration({ versionToken: 'b' })

    expect(cf.get().versionToken).toBe('b')
    const onDisk = await readWhenToken(filename, 'b')
    expect(onDisk.data.versionToken).toBe('b')
  })

  it('still writes defaults during corruption recovery when the validator always fails', async () => {
    // The gate must never be able to block recovery: that would leave the corrupt file renamed
    // aside with nothing written back, which is worse than the corruption.
    const filename = `config-validate-recovery-${Date.now()}.json`
    fs.mkdirSync(configDir(), { recursive: true })
    fs.writeFileSync(path.join(configDir(), filename), '{ not valid json')

    const recoveries: string[] = []
    const cf = new ConfigFile<TestData>(filename, { versionToken: 'default' }, 1, {
      validate: () => ({ valid: false, errors: ['always invalid'] }),
      onCorruptRecovery: (info) => recoveries.push(info.reason),
    })

    expect(cf.get().versionToken).toBe('default')
    expect(recoveries).toContain('parse')
    const onDisk = await readWhenToken(filename, 'default')
    expect(onDisk.data.versionToken).toBe('default')
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
