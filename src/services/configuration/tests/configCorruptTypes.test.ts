import * as path from 'path'
import { corruptBackupFilePath } from '../configCorruptTypes'

describe('configCorruptTypes', () => {
  it('corruptBackupFilePath uses basename, corrupt timestamp, and .json', () => {
    const t = new Date('2020-01-15T10:00:00.000Z')
    const input = path.join('foo', 'bar', 'Pictures', 'Photonics.rocks', 'prefs.json')
    const out = corruptBackupFilePath(input, t)
    expect(path.basename(out)).toBe('prefs.corrupt-2020-01-15T10-00-00.000Z.json')
  })
})
