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
import { noopRuntimeBroadcaster } from '../../../runtime/broadcaster'

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
    eventType: 'beat',
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
      runtimeBroadcaster: noopRuntimeBroadcaster(),
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

  it('surfaces a per-cue compile failure on the file summary (Bug #8)', async () => {
    const file = yargMotionOnlyFile()
    // Second motion cue whose action has no incoming connection: schema-valid but fails
    // compilation (unreachable action). Reachability is a compile-time, not schema, check.
    const goodAction = (file.cues[0] as YargMotionNodeCueDefinition).nodes.actions[0]
    const brokenCue: YargMotionNodeCueDefinition = {
      kind: 'motion',
      id: 'm-broken',
      name: 'Broken',
      nodes: {
        events: [{ id: 'ev-broken', type: 'event', eventType: 'cue-called' }],
        actions: [{ ...goodAction, id: 'mp-broken' }],
        logic: [],
      },
      connections: [],
    }
    file.cues.push(brokenCue)
    expect(validateYargNodeCueFile(file).valid).toBe(true)

    const yargDir = path.join(tmpDir, 'node-data', 'cues', 'yarg')
    fs.mkdirSync(yargDir, { recursive: true })
    fs.writeFileSync(path.join(yargDir, 'partial.json'), JSON.stringify(file), 'utf-8')

    await loader.loadAll()

    // The good cue still registers.
    const group = yargRegistry.getGroup('loader-test-yarg-motion')
    expect(group!.motionCues?.get('m1')).toBeDefined()
    // The failed cue is reported on the summary rather than silently dropped.
    const summary = loader.getSummary().yarg.find((s) => s.path.endsWith('partial.json'))
    expect(summary?.errors?.some((e) => e.includes('m-broken'))).toBe(true)
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

  it('migrates legacy compass bearing literals when loading from disk', async () => {
    const file = yargMotionOnlyFile()
    const cue = file.cues[0] as YargMotionNodeCueDefinition
    const motionAction = cue.nodes.actions[0]
    motionAction.motionPattern = {
      pattern: { source: 'literal', value: 'circle' },
      speed: { source: 'literal', value: 0.5 },
      size: { source: 'literal', value: 30 },
      bearing: { source: 'literal', value: 'se' },
    }

    const yargDir = path.join(tmpDir, 'node-data', 'cues', 'yarg')
    fs.mkdirSync(yargDir, { recursive: true })
    fs.writeFileSync(path.join(yargDir, 'legacy-bearing.json'), JSON.stringify(file), 'utf-8')

    await loader.loadAll()

    const rel = path.join('node-data', 'cues', 'yarg', 'legacy-bearing.json')
    const read = await loader.readFile(rel)
    expect(read.mode).toBe('yarg')
    const motionCue = read.cues[0] as YargMotionNodeCueDefinition
    const bearingLit = motionCue.nodes.actions[0].motionPattern?.bearing
    expect(bearingLit?.source).toBe('literal')
    if (bearingLit?.source === 'literal') {
      expect(bearingLit.value).toBe('downstage-right')
    }
  })

  it('loads an Audio motion cue using cue-called as the entry event', async () => {
    const evCalled: AudioEventNodeUnion = {
      id: 'ev-called',
      type: 'event',
      eventType: 'cue-called',
      threshold: 0,
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
        waitUntilCondition: { source: 'literal', value: 'beat' },
        waitUntilTime: { source: 'literal', value: 0 },
      },
      layer: { source: 'literal', value: 120 },
    }
    const cue: AudioMotionNodeCueDefinition = {
      kind: 'motion',
      id: 'am-cue-called',
      name: 'Audio cue-called motion',
      nodes: { events: [evCalled], actions: [action], logic: [] },
      connections: [{ from: 'ev-called', to: 'mp1' }],
      layout: { nodePositions: {} },
    }
    const file: AudioNodeCueFile = {
      version: 1,
      mode: 'audio',
      group: { id: 'loader-test-audio-cue-called', name: 'Loader test audio cue-called' },
      cues: [cue],
    }

    const v = validateAudioNodeCueFile(file)
    expect(v.valid).toBe(true)

    const audioDir = path.join(tmpDir, 'node-data', 'cues', 'audio')
    fs.mkdirSync(audioDir, { recursive: true })
    fs.writeFileSync(path.join(audioDir, 'audio-cue-called.json'), JSON.stringify(file), 'utf-8')

    await loader.loadAll()

    const group = audioRegistry.getGroup('loader-test-audio-cue-called')
    expect(group).toBeDefined()
    expect(group!.motionCues?.get('am-cue-called')).toBeDefined()
  })

  describe('cue file path resolution', () => {
    it('rejects readFile for paths outside YARG/audio cue directories', async () => {
      await expect(loader.readFile('/etc/passwd')).rejects.toThrow(
        /Node cue file path must be under the YARG or audio cue directories/,
      )
    })

    it('allows readFile with a path relative to baseDir', async () => {
      const file = yargMotionOnlyFile()
      const v = validateYargNodeCueFile(file)
      expect(v.valid).toBe(true)

      const yargDir = path.join(tmpDir, 'node-data', 'cues', 'yarg')
      fs.mkdirSync(yargDir, { recursive: true })
      const filename = 'rel-path-test.json'
      fs.writeFileSync(path.join(yargDir, filename), JSON.stringify(file), 'utf-8')

      const rel = path.join('node-data', 'cues', 'yarg', filename)
      const read = await loader.readFile(rel)
      expect(read.group.id).toBe('loader-test-yarg-motion')
    })
  })

  describe('resolveCueFilePathForIpc (used by EXPORT)', () => {
    it('returns the rooted absolute path for a relative in-root path', () => {
      const yargDir = path.join(tmpDir, 'node-data', 'cues', 'yarg')
      fs.mkdirSync(yargDir, { recursive: true })
      const filename = 'export-target.json'
      fs.writeFileSync(path.join(yargDir, filename), '{}', 'utf-8')
      const rel = path.join('node-data', 'cues', 'yarg', filename)

      const resolved = loader.resolveCueFilePathForIpc(rel)
      expect(resolved).toBe(path.resolve(yargDir, filename))
    })

    it('rejects path traversal escaping the cue roots', () => {
      expect(() => loader.resolveCueFilePathForIpc('../../etc/passwd')).toThrow(
        /must be under the YARG or audio cue directories/,
      )
    })

    it('rejects an absolute path outside the cue roots', () => {
      expect(() => loader.resolveCueFilePathForIpc('/etc/passwd')).toThrow(
        /must be under the YARG or audio cue directories/,
      )
    })

    it('rejects empty input', () => {
      expect(() => loader.resolveCueFilePathForIpc('')).toThrow(/required/)
    })

    it('rejects null-byte injection', () => {
      const yargDir = path.join(tmpDir, 'node-data', 'cues', 'yarg')
      const malicious = path.join(yargDir, 'a.json\0/etc/passwd')
      expect(() => loader.resolveCueFilePathForIpc(malicious)).toThrow(/null bytes/)
    })
  })

  describe('saveFile group id uniqueness', () => {
    it('rejects saving a second cue file with the same group.id on a different path', async () => {
      const file = yargMotionOnlyFile()
      await loader.saveFile('yarg', 'first.json', file)
      await expect(loader.saveFile('yarg', 'second.json', file)).rejects.toThrow(
        /already uses group id/,
      )
    })

    it('allows overwriting the same path with the same group.id', async () => {
      const file = yargMotionOnlyFile()
      await loader.saveFile('yarg', 'only.json', file)
      await expect(loader.saveFile('yarg', 'only.json', file)).resolves.toMatchObject({
        success: true,
      })
    })
  })
})
