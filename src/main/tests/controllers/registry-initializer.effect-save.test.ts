import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

let mockAppData = ''
jest.mock('electron', () => ({
  app: { getPath: () => mockAppData },
}))

import { RegistryInitializer } from '../../controllers/RegistryInitializer'
import type { NodeCueLoader } from '../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type { EffectLoader } from '../../../photonics-dmx/cues/node/loader/EffectLoader'
import { getCueRegistry } from '../../../photonics-dmx/cues/registries/cueRegistries'
import { AudioCueRegistry } from '../../../photonics-dmx/cues/registries/AudioCueRegistry'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'

const BUNDLED = path.join(__dirname, '../../../../resources/defaults/node-data')

function copyBundled(kind: 'cues' | 'effects', dataDir: string): void {
  const from = path.join(BUNDLED, kind, 'yarg')
  const to = path.join(dataDir, 'node-data', kind, 'yarg')
  fs.mkdirSync(to, { recursive: true })
  for (const file of fs.readdirSync(from).filter((f) => f.endsWith('.json'))) {
    fs.copyFileSync(path.join(from, file), path.join(to, file))
  }
}

describe('RegistryInitializer effect save', () => {
  let nodeCueLoader: NodeCueLoader | null
  let effectLoader: EffectLoader | null

  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-initializer-'))
    const dataDir = path.join(mockAppData, 'Photonics.rocks')
    copyBundled('cues', dataDir)
    copyBundled('effects', dataDir)
    getCueRegistry('yarg').reset()
    getCueRegistry('rb3').reset()
    AudioCueRegistry.getInstance().reset()
    nodeCueLoader = null
    effectLoader = null
    await new RegistryInitializer({
      getConfig: () => {
        throw new Error('not read while loading')
      },
      runtimeBroadcaster: noopRuntimeBroadcaster(),
      sendToAllWindows: () => {},
      pushValidationError: () => {},
      refreshAudioCueSelection: () => {},
      getNodeCueLoader: () => nodeCueLoader,
      setNodeCueLoader: (loader) => {
        nodeCueLoader = loader
      },
      getEffectLoader: () => effectLoader,
      setEffectLoader: (loader) => {
        effectLoader = loader
      },
    }).initializeNodeCueLoader()
  })

  afterEach(async () => {
    await nodeCueLoader?.dispose()
    await effectLoader?.dispose()
    getCueRegistry('yarg').reset()
    getCueRegistry('rb3').reset()
    AudioCueRegistry.getInstance().reset()
    fs.rmSync(mockAppData, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  it('reloads only the cue files that use the saved effect file', async () => {
    const yarg = getCueRegistry('yarg')
    const before = new Map(yarg.getAllGroups().map((id) => [id, yarg.getGroup(id)]))
    const cuesReloaded = new Promise((resolve) => nodeCueLoader!.once('changed', resolve))
    const saved = JSON.parse(
      fs.readFileSync(path.join(BUNDLED, 'effects', 'yarg', 'yarg-fade-effects.json'), 'utf-8'),
    )

    await effectLoader!.saveFile('yarg', 'yarg-fade-effects.json', saved)
    await cuesReloaded

    const rebuilt = [...before].filter(([id, group]) => yarg.getGroup(id) !== group)
    expect(rebuilt.map(([id]) => id)).toEqual(['yarg-fade'])
  })
})
