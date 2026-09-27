import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { writeFileAtomic } from './atomicFileWrite'

jest.mock('fs/promises', () => {
  const actual = jest.requireActual<typeof import('fs/promises')>('fs/promises')
  return { ...actual, writeFile: jest.fn(actual.writeFile) }
})

const writeFileMock = jest.mocked(fsPromises.writeFile)
const realWriteFile = jest.requireActual<typeof import('fs/promises')>('fs/promises').writeFile

/** A disk that fills partway through a write: half the contents land, then the write fails. */
function fillDiskPartway(): void {
  writeFileMock.mockImplementationOnce(async (target, data) => {
    await realWriteFile(target, String(data).slice(0, String(data).length / 2))
    throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })
  })
}

describe('writeFileAtomic', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    writeFileMock.mockReset()
    writeFileMock.mockImplementation(realWriteFile)
  })

  it('replaces the file with the new contents whole', async () => {
    const filePath = path.join(dir, 'lib.json')
    fs.writeFileSync(filePath, '{"old":true}')

    await writeFileAtomic(filePath, '{"new":true}')

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('{"new":true}')
    expect(fs.readdirSync(dir)).toEqual(['lib.json'])
  })

  it('leaves the file as it was and no temp file when the disk fills mid-write', async () => {
    const filePath = path.join(dir, 'lib.json')
    fs.writeFileSync(filePath, '{"old":true}')
    fillDiskPartway()

    await expect(writeFileAtomic(filePath, '{"new":true,"more":"data"}')).rejects.toThrow('ENOSPC')

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('{"old":true}')
    expect(fs.readdirSync(dir)).toEqual(['lib.json'])
  })
})
