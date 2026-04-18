/**
 * NodeCueLoader: routes cue definitions by platform folder and `kind` into the correct registry maps.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { NodeCueLoader } from '../../../cues/node/loader/NodeCueLoader'
import { YargCueRegistry } from '../../../cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../../../cues/registries/AudioCueRegistry'
import {
  validateAudioNodeCueFile,
  validateYargNodeCueFile,
} from '../../../cues/node/schema/validation'
import type {
  ActionNode,
  AudioEventNodeUnion,
  AudioMotionNodeCueDefinition,
  AudioNodeCueFile,
  YargEventNode,
  YargMotionNodeCueDefinition,
  YargNodeCueFile,
} from '../../../cues/types/nodeCueTypes'

function yargMotionOnlyFile(): YargNodeCueFile {
  const ev: YargEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
  const action: ActionNode = {
    id: 'mp1',
    type: 'action',
    effectType: 'motion-pattern',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    motionPattern: {
      pattern: { source: 'literal', value: 'circle' },
      speed: { source: 'literal', value: 0.5 },
      size: { source: 'literal', value: 30 },
    },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 400 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 120 },
  }
  const cue: YargMotionNodeCueDefinition = {
    kind: 'motion',
    id: 'm1',
    name: 'Motion',
    nodes: { events: [ev], actions: [action], logic: [] },
    connections: [{ from: 'ev-called', to: 'mp1' }],
  }
  return {
    version: 1,
    mode: 'yarg',
    group: { id: 'loader-test-yarg-motion', name: 'Loader test YARG motion' },
    cues: [cue],
  }
}

function audioMotionOnlyFile(): AudioNodeCueFile {
  const ev: AudioEventNodeUnion = {
    id: 'ev-b',
    type: 'event',
    eventType: 'audio-beat',
    threshold: 0.5,
    triggerMode: 'edge',
  }
  const action: ActionNode = {
    id: 'mp1',
    type: 'action',
    effectType: 'motion-pattern',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    motionPattern: {
      pattern: { source: 'literal', value: 'circle' },
      speed: { source: 'literal', value: 0.5 },
      size: { source: 'literal', value: 30 },
    },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 400 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 120 },
  }
  const cue: AudioMotionNodeCueDefinition = {
    kind: 'motion',
    id: 'am1',
    name: 'Audio motion',
    nodes: { events: [ev], actions: [action], logic: [] },
    connections: [{ from: 'ev-b', to: 'mp1' }],
    layout: { nodePositions: {} },
  }
  return {
    version: 1,
    mode: 'audio',
    group: { id: 'loader-test-audio-motion', name: 'Loader test audio motion' },
    cues: [cue],
  }
}

describe('NodeCueLoader', () => {
  let tmpDir: string
  let yargRegistry: YargCueRegistry
  let audioRegistry: AudioCueRegistry
  let loader: NodeCueLoader

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-cue-loader-'))
    yargRegistry = YargCueRegistry.getInstance()
    audioRegistry = AudioCueRegistry.getInstance()
    yargRegistry.reset()
    audioRegistry.reset()

    loader = new NodeCueLoader({
      baseDir: tmpDir,
      yargRegistry,
      audioRegistry,
    })
  })

  afterEach(() => {
    yargRegistry.reset()
    audioRegistry.reset()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('registers YARG kind motion into the group motion map, not lighting cue types', async () => {
    const file = yargMotionOnlyFile()
    const v = validateYargNodeCueFile(file)
    expect(v.valid).toBe(true)

    const yargDir = path.join(tmpDir, 'node-data', 'cues', 'yarg')
    fs.mkdirSync(yargDir, { recursive: true })
    fs.writeFileSync(path.join(yargDir, 'motion-only.json'), JSON.stringify(file), 'utf-8')

    await loader.loadAll()

    const group = yargRegistry.getGroup('loader-test-yarg-motion')
    expect(group).toBeDefined()
    expect(group!.cues.size).toBe(0)
    expect(group!.motionCues?.get('m1')).toBeDefined()

    expect(loader.getAvailableCueTypes('yarg', 'motion')).toEqual([])
  })

  it('registers Audio kind motion into the group motion map', async () => {
    const file = audioMotionOnlyFile()
    const v = validateAudioNodeCueFile(file)
    expect(v.valid).toBe(true)

    const audioDir = path.join(tmpDir, 'node-data', 'cues', 'audio')
    fs.mkdirSync(audioDir, { recursive: true })
    fs.writeFileSync(path.join(audioDir, 'audio-motion-only.json'), JSON.stringify(file), 'utf-8')

    await loader.loadAll()

    const group = audioRegistry.getGroup('loader-test-audio-motion')
    expect(group).toBeDefined()
    expect(group!.cues.size).toBe(0)
    expect(group!.motionCues?.get('am1')).toBeDefined()

    expect(loader.getAvailableCueTypes('audio', 'motion')).toEqual([])
  })
})
