import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { NodeCueLoader } from '../../../../cues/node/loader/NodeCueLoader'
import { CueRegistry } from '../../../../cues/registries/CueRegistry'
import { AudioCueRegistry } from '../../../../cues/registries/AudioCueRegistry'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'

const ALT1 = path.join(__dirname, '../../../historical/v0.5.5-alpha.5/yarg-alt1.json')

interface CueJson {
  cueType?: string
  nodes: { actions: Array<{ color: { brightness: { source: string; value: unknown } } }> }
}

interface CueFileJson {
  bundled?: boolean
  group: { id: string; name: string; isDefault?: boolean }
  cues: CueJson[]
}

describe('reporting a cue file that does not load', () => {
  let baseDir: string
  let loader: NodeCueLoader

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-file-load-errors-'))
    AudioCueRegistry.getInstance().reset()
    loader = new NodeCueLoader({
      baseDir,
      registries: {
        yarg: CueRegistry.create(),
        rb3: CueRegistry.create(),
        audio: AudioCueRegistry.getInstance(),
      },
      runtimeBroadcaster: noopRuntimeBroadcaster(),
    })
  })

  afterEach(async () => {
    await loader.dispose()
    AudioCueRegistry.getInstance().reset()
    fs.rmSync(baseDir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  it('names the cue that failed when a file has no cue left to register', async () => {
    const file: CueFileJson = JSON.parse(fs.readFileSync(ALT1, 'utf-8'))
    const dischord = file.cues.find((cue) => cue.cueType === 'Dischord')
    if (!dischord) throw new Error('the library has no Dischord cue')
    dischord.nodes.actions[0].color.brightness = { source: 'literal', value: 'blinding' }
    file.bundled = false
    file.group = { id: 'user-broken', name: 'User broken', isDefault: false }
    file.cues = [dischord]
    const cuesDir = path.join(baseDir, 'node-data', 'cues', 'yarg')
    fs.mkdirSync(cuesDir, { recursive: true })
    fs.writeFileSync(path.join(cuesDir, 'user-broken.json'), JSON.stringify(file, null, 2))

    const result = await loader.loadAll()

    expect(result.failed).toBe(1)
    expect(result.errors).toEqual([
      expect.stringMatching(
        /^user-broken\.json: .*cue 'Dischord'.*'blinding' is not a known Brightness/,
      ),
    ])
  })
})
