/**
 * Spec for the loader's cue-kind strategy seam. A build shipping its own cue kind registers one
 * strategy rather than adding a branch to the loader's register, unregister, cue-type and summary
 * paths, so these pin that a claimed file reaches the strategy and an unclaimed one does not.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  NodeCueLoader,
  registerNodeCueKindStrategy,
  __resetNodeCueKindStrategiesForTests,
} from '../../../cues/node/loader/NodeCueLoader'
import type { NodeCueKindStrategy } from '../../../cues/node/loader/NodeCueLoader'
import { CueRegistry } from '../../../cues/registries/CueRegistry'
import { AudioCueRegistry } from '../../../cues/registries/AudioCueRegistry'
import { getCueRegistry } from '../../../cues/registries/cueRegistries'
import { noopRuntimeBroadcaster } from '../../../runtime/broadcaster'
import type { NodeCueFile } from '../../../cues/types/nodeCueTypes'

const CUE_ROOT = path.resolve(__dirname, '../../../../../resources/defaults/node-data/cues')

/** A loader rooted at a temp dir holding one copied bundled yarg file. */
function loaderWithOneYargFile(): { loader: NodeCueLoader; baseDir: string } {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-kind-strategy-'))
  const yargDir = path.join(baseDir, 'node-data', 'cues', 'yarg')
  fs.mkdirSync(yargDir, { recursive: true })
  const source = fs.readdirSync(path.join(CUE_ROOT, 'yarg')).filter((f) => f.endsWith('.json'))[0]
  fs.copyFileSync(path.join(CUE_ROOT, 'yarg', source), path.join(yargDir, source))

  const loader = new NodeCueLoader({
    baseDir,
    registries: {
      yarg: CueRegistry.getInstance(),
      rb3: getCueRegistry('rb3'),
      audio: AudioCueRegistry.getInstance(),
    },
    runtimeBroadcaster: noopRuntimeBroadcaster(),
  })
  return { loader, baseDir }
}

const strategy = (claims: boolean): NodeCueKindStrategy & Record<string, jest.Mock> =>
  ({
    kind: 'test-kind',
    claimsFile: jest.fn(() => claims),
    registerFile: jest.fn(async () => {}),
    unregisterFile: jest.fn(),
    cueTypesFor: jest.fn(() => ['TestType']),
    countCues: jest.fn((file: NodeCueFile) => file.cues.length),
  }) as unknown as NodeCueKindStrategy & Record<string, jest.Mock>

describe('cue kind strategies', () => {
  beforeEach(() => {
    // Registrations are module-level, so a strategy from an earlier case would claim this one's file.
    __resetNodeCueKindStrategiesForTests()
    CueRegistry.getInstance().reset()
    AudioCueRegistry.getInstance().reset()
  })

  it('hands a claimed file to the strategy instead of the built-in path', async () => {
    const s = strategy(true)
    registerNodeCueKindStrategy(s)
    const { loader } = loaderWithOneYargFile()

    await loader.loadAll()

    expect(s.registerFile).toHaveBeenCalledTimes(1)
    // The claimed file went to the strategy, so no group reached the built-in yarg registry.
    expect(CueRegistry.getInstance().getAllGroups()).toHaveLength(0)
  })

  it('answers the editor cue-type question for its own kind', () => {
    registerNodeCueKindStrategy(strategy(false))
    const { loader } = loaderWithOneYargFile()

    expect(loader.getAvailableCueTypes('yarg', 'test-kind')).toEqual(['TestType'])
    // A built-in kind is untouched by the registration.
    expect(loader.getAvailableCueTypes('yarg', 'lighting')).toContain('Chorus')
  })

  it('leaves an unclaimed file to the loader', async () => {
    const s = strategy(false)
    registerNodeCueKindStrategy(s)
    const { loader } = loaderWithOneYargFile()

    await loader.loadAll()

    expect(s.claimsFile).toHaveBeenCalled()
    expect(s.registerFile).not.toHaveBeenCalled()
    expect(CueRegistry.getInstance().getAllGroups().length).toBeGreaterThan(0)
  })
})
