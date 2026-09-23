import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

jest.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => appRoot },
}))

let appRoot: string

import { copyDefaultData } from '../utils/copyDefaultData'

/** A project root holding `resources/defaults`, which is where a development run reads from. */
function seedSource(files: Record<string, string>): void {
  const dir = path.join(appRoot, 'resources', 'defaults')
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), contents)
  }
}

describe('copyDefaultData', () => {
  let tmp: string
  let appData: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-defaults-'))
    appRoot = path.join(tmp, 'app')
    appData = path.join(tmp, 'appdata')
    fs.mkdirSync(appData, { recursive: true })
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  it('seeds a bundled file that is not there yet', async () => {
    seedSource({ 'good.json': JSON.stringify({ cueVersion: 1, group: { id: 'g' } }) })

    await copyDefaultData(appRoot, appData)

    const written = JSON.parse(fs.readFileSync(path.join(appData, 'good.json'), 'utf-8'))
    expect(written.bundled).toBe(true)
    expect(written.group.id).toBe('g')
  })

  it('carries on past a bundled file it cannot read', async () => {
    seedSource({
      'broken.json': '{ this is not json',
      'good.json': JSON.stringify({ cueVersion: 1, group: { id: 'g' } }),
    })

    await expect(copyDefaultData(appRoot, appData)).resolves.toBeUndefined()

    expect(fs.existsSync(path.join(appData, 'good.json'))).toBe(true)
    expect(fs.existsSync(path.join(appData, 'broken.json'))).toBe(false)
  })

  it('leaves no temp files behind', async () => {
    seedSource({ 'good.json': JSON.stringify({ cueVersion: 1 }) })

    await copyDefaultData(appRoot, appData)

    expect(fs.readdirSync(appData).filter((f) => f.includes('.tmp.'))).toEqual([])
  })

  it('replaces a bundled file when the shipped version is newer', async () => {
    seedSource({ 'cue.json': JSON.stringify({ cueVersion: 2, marker: 'new' }) })
    fs.writeFileSync(
      path.join(appData, 'cue.json'),
      JSON.stringify({ cueVersion: 1, bundled: true, marker: 'old' }),
    )

    await copyDefaultData(appRoot, appData)

    const written = JSON.parse(fs.readFileSync(path.join(appData, 'cue.json'), 'utf-8'))
    expect(written.marker).toBe('new')
  })

  it('keeps the replaced file beside the newer shipped one', async () => {
    seedSource({ 'cue.json': JSON.stringify({ cueVersion: 2, marker: 'new' }) })
    fs.writeFileSync(
      path.join(appData, 'cue.json'),
      JSON.stringify({ cueVersion: 1, bundled: true, marker: 'edited by hand' }),
    )

    await copyDefaultData(appRoot, appData)

    const kept = fs.readdirSync(appData).filter((f) => f.startsWith('cue.json.v1-'))
    expect(kept).toHaveLength(1)
    const keptFile = JSON.parse(fs.readFileSync(path.join(appData, kept[0]), 'utf-8'))
    expect(keptFile.marker).toBe('edited by hand')
    const written = JSON.parse(fs.readFileSync(path.join(appData, 'cue.json'), 'utf-8'))
    expect(written.marker).toBe('new')
  })

  it('keeps no copy when the shipped version is not newer', async () => {
    seedSource({ 'cue.json': JSON.stringify({ cueVersion: 2, marker: 'shipped' }) })
    fs.writeFileSync(
      path.join(appData, 'cue.json'),
      JSON.stringify({ cueVersion: 2, bundled: true, marker: 'shipped' }),
    )

    await copyDefaultData(appRoot, appData)

    expect(fs.readdirSync(appData)).toEqual(['cue.json'])
  })

  it('leaves a file the user has taken ownership of alone', async () => {
    seedSource({ 'cue.json': JSON.stringify({ cueVersion: 9, marker: 'shipped' }) })
    fs.writeFileSync(path.join(appData, 'cue.json'), JSON.stringify({ marker: 'mine' }))

    await copyDefaultData(appRoot, appData)

    const written = JSON.parse(fs.readFileSync(path.join(appData, 'cue.json'), 'utf-8'))
    expect(written.marker).toBe('mine')
  })

  it('seeds a destination that will not parse again, keeping the old bytes', async () => {
    // A file left truncated by an interrupted write carries no readable version, so the bundled
    // copy is seeded over it and the install keeps that cue.
    seedSource({ 'cue.json': JSON.stringify({ cueVersion: 9, marker: 'shipped' }) })
    fs.writeFileSync(path.join(appData, 'cue.json'), '{ "cueVersion": 3, "marker": "trunc')

    await copyDefaultData(appRoot, appData)

    const written = JSON.parse(fs.readFileSync(path.join(appData, 'cue.json'), 'utf-8'))
    expect(written.marker).toBe('shipped')
    const kept = fs.readdirSync(appData).filter((f) => f.startsWith('cue.json.corrupt-'))
    expect(kept).toHaveLength(1)
    expect(fs.readFileSync(path.join(appData, kept[0]), 'utf-8')).toContain('trunc')
  })
})
