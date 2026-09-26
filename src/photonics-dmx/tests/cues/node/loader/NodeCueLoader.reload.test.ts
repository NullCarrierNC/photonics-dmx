import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { NodeCueLoader } from '../../../../cues/node/loader/NodeCueLoader'
import { EffectLoader } from '../../../../cues/node/loader/EffectLoader'
import { LightingNodeCue } from '../../../../cues/node/runtime/LightingNodeCue'
import { CueRegistry } from '../../../../cues/registries/CueRegistry'
import { AudioCueRegistry } from '../../../../cues/registries/AudioCueRegistry'
import { CueHandler } from '../../../../cueHandlers/CueHandler'
import { CueType, defaultCueData } from '../../../../cues/types/cueTypes'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'
import { rgbLight, createMockLightingConfig } from '../../../helpers/testFixtures'
import { fakeLightingController } from '../../../helpers/fakeLightingController'

const BUNDLED = path.join(__dirname, '../../../../../../resources/defaults/node-data')
const KEEPALIVE_MS = 33

// Each case loads the whole bundled YARG library from disk, and two then play cues in real time.
jest.setTimeout(20_000)

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function copyBundled(kind: 'cues' | 'effects', baseDir: string): void {
  const from = path.join(BUNDLED, kind, 'yarg')
  const to = path.join(baseDir, 'node-data', kind, 'yarg')
  fs.mkdirSync(to, { recursive: true })
  for (const file of fs.readdirSync(from).filter((f) => f.endsWith('.json'))) {
    fs.copyFileSync(path.join(from, file), path.join(to, file))
  }
}

describe('NodeCueLoader reload', () => {
  let baseDir: string
  let yarg: CueRegistry
  let loader: NodeCueLoader
  let effectLoader: EffectLoader
  let handler: CueHandler
  let timer: ReturnType<typeof setInterval> | null

  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    // Every roll after the first lands on a different group from the first.
    let rolls = 0
    jest.spyOn(Math, 'random').mockImplementation(() => (rolls++ === 0 ? 0 : 0.99))

    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-cue-reload-'))
    copyBundled('cues', baseDir)
    copyBundled('effects', baseDir)
    yarg = CueRegistry.create()
    AudioCueRegistry.getInstance().reset()
    effectLoader = new EffectLoader({ baseDir })
    await effectLoader.loadAll()
    loader = new NodeCueLoader({
      baseDir,
      registries: { yarg, rb3: CueRegistry.create(), audio: AudioCueRegistry.getInstance() },
      effectLoader,
      runtimeBroadcaster: noopRuntimeBroadcaster(),
    })
    await loader.loadAll()
    const groups = yarg.getAllGroups()
    yarg.setEnabledGroups(groups)
    yarg.setActiveGroups(groups)
    yarg.setCueConsistencyWindow(10000)

    const front = Array.from({ length: 8 }, (_, i) =>
      rgbLight({ id: `f${i + 1}`, position: i + 1, fixtureId: `f${i + 1}` }),
    )
    handler = new CueHandler(
      new DmxLightManager(createMockLightingConfig({ numLights: 8, frontLights: front })),
      fakeLightingController(),
      { registry: yarg },
    )
    timer = null
  })

  afterEach(async () => {
    if (timer) clearInterval(timer)
    handler.shutdown()
    await loader.dispose()
    await effectLoader.dispose()
    AudioCueRegistry.getInstance().reset()
    fs.rmSync(baseDir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  it.each(['random', 'prefer-for-tracked'] as const)(
    'keeps the held cue on its group through a reload at %s priority',
    async (priority) => {
      yarg.setStageKitPriority(priority)
      const heldGroups: string[] = []
      yarg.setCueStateUpdateCallback((state) => {
        if (state.cueType === CueType.Harmony) heldGroups.push(state.groupId)
      })
      const execute = jest.spyOn(LightingNodeCue.prototype, 'execute')
      const frame = {
        ...defaultCueData,
        currentScene: 'Gameplay' as const,
        trackMode: 'tracked' as const,
      }
      timer = setInterval(() => {
        void handler.handleCue(CueType.Harmony, { ...frame, lightingCue: CueType.Harmony })
      }, KEEPALIVE_MS)

      await sleep(10 * KEEPALIVE_MS)
      const held = heldGroups[0]
      const heldBefore = yarg.getGroup(held)?.cues.get(CueType.Harmony)
      await loader.reload()
      const heldAfter = yarg.getGroup(held)?.cues.get(CueType.Harmony)
      await sleep(10 * KEEPALIVE_MS)
      clearInterval(timer)
      timer = null

      expect(new Set(heldGroups)).toEqual(new Set([held]))
      expect(heldAfter).not.toBe(heldBefore)
      const ran = new Set(execute.mock.contexts)
      expect([...ran].every((cue) => cue === heldBefore || cue === heldAfter)).toBe(true)
      expect(execute.mock.contexts[execute.mock.contexts.length - 1]).toBe(heldAfter)
    },
  )

  it('reads each effect file once for the whole reload', async () => {
    const reads = jest.spyOn(effectLoader, 'readFile')

    await loader.reload()

    const effectFiles = fs.readdirSync(path.join(baseDir, 'node-data', 'effects', 'yarg'))
    expect(reads).toHaveBeenCalledTimes(effectFiles.length)
  })
})
