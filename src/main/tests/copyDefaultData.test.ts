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
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), contents)
  }
}

const retiredCopies = (dir: string, name: string): string[] =>
  fs.readdirSync(dir).filter((f) => f.startsWith(`${name}.retired-`))

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

  it('seeds a destination whose body is not an object again, keeping the old bytes', async () => {
    seedSource({
      'a-cue.json': JSON.stringify({ cueVersion: 2, marker: 'shipped' }),
      'b-cue.json': JSON.stringify({ cueVersion: 1, marker: 'sibling' }),
    })
    fs.writeFileSync(path.join(appData, 'a-cue.json'), 'null')

    await expect(copyDefaultData(appRoot, appData)).resolves.toBeUndefined()

    const written = JSON.parse(fs.readFileSync(path.join(appData, 'a-cue.json'), 'utf-8'))
    expect(written.marker).toBe('shipped')
    const kept = fs.readdirSync(appData).filter((f) => f.startsWith('a-cue.json.corrupt-'))
    expect(kept).toHaveLength(1)
    expect(fs.readFileSync(path.join(appData, kept[0]), 'utf-8')).toBe('null')
    expect(fs.existsSync(path.join(appData, 'b-cue.json'))).toBe(true)
  })

  it('carries on past a bundled file whose body is not an object', async () => {
    seedSource({
      'a-cue.json': 'null',
      'b-cue.json': JSON.stringify({ cueVersion: 1, marker: 'sibling' }),
    })

    await expect(copyDefaultData(appRoot, appData)).resolves.toBeUndefined()

    expect(fs.existsSync(path.join(appData, 'a-cue.json'))).toBe(false)
    expect(fs.existsSync(path.join(appData, 'b-cue.json'))).toBe(true)
  })

  it('sets aside a seeded file the build does not ship, keeping its bytes', async () => {
    seedSource({ 'kept.json': JSON.stringify({ cueVersion: 1 }) })
    const gone = JSON.stringify({ cueVersion: 3, bundled: true, marker: 'edited' })
    fs.writeFileSync(path.join(appData, 'gone.json'), gone)

    await copyDefaultData(appRoot, appData)

    expect(fs.existsSync(path.join(appData, 'gone.json'))).toBe(false)
    const [copy] = retiredCopies(appData, 'gone.json')
    expect(fs.readFileSync(path.join(appData, copy), 'utf-8')).toBe(gone)
  })

  it("leaves a file that is the user's, unreadable or still shipped", async () => {
    seedSource({ 'broken.json': '{ this is not json', 'kept.json': JSON.stringify({}) })
    const files = {
      'mine.json': JSON.stringify({ bundled: false }),
      'unmarked.json': JSON.stringify({ group: { id: 'g' } }),
      'garbled.json': '{ not json',
      'broken.json': JSON.stringify({ bundled: true }),
    }
    for (const [name, contents] of Object.entries(files)) {
      fs.writeFileSync(path.join(appData, name), contents)
    }

    await copyDefaultData(appRoot, appData)

    for (const [name, contents] of Object.entries(files)) {
      expect(fs.readFileSync(path.join(appData, name), 'utf-8')).toBe(contents)
    }
    expect(fs.readdirSync(appData).filter((f) => f.includes('.retired-'))).toEqual([])
  })

  it('retires nothing in a folder the build seeds no files into', async () => {
    seedSource({ 'cues/kept.json': JSON.stringify({}) })
    fs.mkdirSync(path.join(appData, 'cues'), { recursive: true })
    fs.writeFileSync(path.join(appData, 'root.json'), JSON.stringify({ bundled: true }))
    fs.writeFileSync(path.join(appData, 'cues', 'gone.json'), JSON.stringify({ bundled: true }))

    await copyDefaultData(appRoot, appData)

    expect(fs.existsSync(path.join(appData, 'root.json'))).toBe(true)
    expect(retiredCopies(path.join(appData, 'cues'), 'gone.json')).toHaveLength(1)
  })
})
