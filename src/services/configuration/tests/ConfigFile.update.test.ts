import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockGetPath = jest.fn()
jest.mock('electron', () => ({
  app: { getPath: (n: string) => mockGetPath(n) },
}))

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
