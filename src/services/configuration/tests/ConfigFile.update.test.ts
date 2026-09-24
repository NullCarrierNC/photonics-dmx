import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

const mockGetPath = jest.fn()
jest.mock('electron', () => ({
  app: { getPath: (n: string) => mockGetPath(n) },
}))

// Wrap the renames so individual tests can simulate transient failures, while every other call
// delegates to the real implementation.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs')
  return {
    ...actual,
    renameSync: jest.fn((from: string, to: string) => actual.renameSync(from, to)),
  }
})
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

describe('ConfigFile corrupt file recovery', () => {
  const renameMock = fsPromises.rename as unknown as jest.Mock
  const realRename = jest.requireActual('fs/promises').rename

  const errnoError = (code: string): NodeJS.ErrnoException => {
    const err = new Error(`${code}: simulated`) as NodeJS.ErrnoException
    err.code = code
    return err
  }

  /** A config file on disk holding text that does not parse, and the directory it sits in. */
  const corruptFile = (): { filename: string; configDir: string; filePath: string } => {
    const filename = `config-corrupt-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    const configDir = path.join(testAppData, 'Photonics.rocks')
    fs.mkdirSync(configDir, { recursive: true })
    const filePath = path.join(configDir, filename)
    fs.writeFileSync(filePath, '{ not json')
    return { filename, configDir, filePath }
  }

  /** Waits for the defaults a recovery writes, so its rename lands before another test counts. */
  const defaultsWritten = async (filePath: string): Promise<void> => {
    for (let i = 0; i < 200; i++) {
      try {
        if (JSON.parse(fs.readFileSync(filePath, 'utf8'))?.data?.versionToken === 'default') return
      } catch {
        // Not there yet, or mid-write.
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error(`${filePath} never held the defaults`)
  }

  const backupsOf = (configDir: string, filename: string): string[] =>
    fs
      .readdirSync(configDir)
      .filter((f) => f.startsWith(`${path.basename(filename, '.json')}.corrupt-`))

  const renameSyncMock = fs.renameSync as unknown as jest.Mock
  const realRenameSync = jest.requireActual<typeof fs>('fs').renameSync

  afterEach(() => {
    renameSyncMock.mockReset()
    renameSyncMock.mockImplementation((from, to) => realRenameSync(from as string, to as string))
    renameMock.mockReset()
    renameMock.mockImplementation((...args: unknown[]) => realRename(...args))
  })

  it('moves a corrupt file aside after a transient rename failure', async () => {
    const { filename, configDir, filePath } = corruptFile()
    let calls = 0
    renameSyncMock.mockImplementation((from, to) => {
      calls++
      if (calls === 1) throw errnoError('EBUSY')
      realRenameSync(from as string, to as string)
    })

    new ConfigFile<TestData>(filename, { versionToken: 'default' }, 1, {})

    expect(backupsOf(configDir, filename)).toHaveLength(1)
    await defaultsWritten(filePath)
  })

  it('keeps a corrupt file it could not move aside when a save comes', async () => {
    const { filename, filePath } = corruptFile()
    renameSyncMock.mockImplementation(() => {
      throw errnoError('EPERM')
    })
    renameMock.mockImplementation((from: string, to: string) =>
      to.includes('.corrupt-') ? Promise.reject(errnoError('EPERM')) : realRename(from, to),
    )
    const cf = new ConfigFile<TestData>(filename, { versionToken: 'default' }, 1, {})

    await expect(cf.update({ versionToken: 'edited' })).rejects.toThrow()

    expect(fs.readFileSync(filePath, 'utf8')).toBe('{ not json')
  })

  it('moves the corrupt file aside before the first save that can', async () => {
    const { filename, configDir, filePath } = corruptFile()
    renameSyncMock.mockImplementation(() => {
      throw errnoError('EPERM')
    })
    const cf = new ConfigFile<TestData>(filename, { versionToken: 'default' }, 1, {})

    await cf.update({ versionToken: 'edited' })

    expect(backupsOf(configDir, filename)).toHaveLength(1)
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8')).data.versionToken).toBe('edited')
  })
})

describe('ConfigFile.mutate', () => {
  type Settings = { a: string; b: string }

  /** Two writers that each read before awaiting, which is what update() alone cannot order. */
  it('keeps both changes when two writers overlap', async () => {
    const filename = `config-mutate-overlap-${Date.now()}.json`
    const cf = new ConfigFile<Settings>(filename, { a: 'default', b: 'default' }, 1, {})

    await Promise.all([
      cf.mutate((current) => ({ ...current, a: 'from-first' })),
      cf.mutate((current) => ({ ...current, b: 'from-second' })),
    ])

    expect(cf.get()).toEqual({ a: 'from-first', b: 'from-second' })
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(testAppData, 'Photonics.rocks', filename), 'utf-8'),
    )
    expect(onDisk.data).toEqual({ a: 'from-first', b: 'from-second' })
  })

  it('runs each turn against the result of the one before it', async () => {
    const filename = `config-mutate-order-${Date.now()}.json`
    const cf = new ConfigFile<Settings>(filename, { a: '', b: '' }, 1, {})

    await Promise.all(
      ['1', '2', '3'].map((n) => cf.mutate((current) => ({ ...current, a: current.a + n }))),
    )

    expect(cf.get().a).toBe('123')
  })

  it('writes nothing when the change returns the value it was given', async () => {
    const filename = `config-mutate-noop-${Date.now()}.json`
    const cf = new ConfigFile<Settings>(filename, { a: 'x', b: 'y' }, 1, {})
    await cf.mutate((current) => ({ ...current, a: 'written' }))
    const filePath = path.join(testAppData, 'Photonics.rocks', filename)
    const before = fs.statSync(filePath).mtimeMs

    await cf.mutate((current) => current)

    expect(fs.statSync(filePath).mtimeMs).toBe(before)
    expect(cf.get().a).toBe('written')
  })

  it('reads the value an update in flight is saving', async () => {
    const filename = `config-mutate-after-update-${Date.now()}.json`
    const cf = new ConfigFile<Settings>(filename, { a: 'start', b: '' }, 1, {})

    await Promise.all([
      cf.update({ a: 'updated', b: '' }),
      cf.mutate((current) => ({ ...current, b: current.a })),
    ])

    expect(cf.get()).toEqual({ a: 'updated', b: 'updated' })
  })

  it('lands an update after a turn queued before it', async () => {
    const filename = `config-update-after-mutate-${Date.now()}.json`
    const cf = new ConfigFile<Settings>(filename, { a: 'start', b: '' }, 1, {})

    await Promise.all([
      cf.mutate((current) => ({ ...current, a: 'mutated' })),
      cf.update({ a: 'replaced', b: 'replaced' }),
    ])

    expect(cf.get()).toEqual({ a: 'replaced', b: 'replaced' })
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(testAppData, 'Photonics.rocks', filename), 'utf-8'),
    )
    expect(onDisk.data).toEqual({ a: 'replaced', b: 'replaced' })
  })

  it('lets the turns behind a failed one continue', async () => {
    const filename = `config-mutate-failure-${Date.now()}.json`
    const cf = new ConfigFile<Settings>(filename, { a: 'start', b: '' }, 1, {})

    const failed = cf.mutate(() => {
      throw new Error('change refused')
    })

    await expect(failed).rejects.toThrow('change refused')
    await cf.mutate((current) => ({ ...current, a: 'after' }))

    expect(cf.get().a).toBe('after')
  })
})
