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
import { getRb3CueRegistry } from '../../../cues/registries/Rb3CueRegistry'
import {
  validateAudioNodeCueFile,
  validateRb3NodeCueFile,
  validateYargNodeCueFile,
} from '../../../cues/node/schema/validation'
import type {
  ActionNode,
  AudioEventNodeUnion,
  AudioMotionNodeCueDefinition,
  AudioNodeCueFile,
  Rb3NodeCueFile,
  YargEventNode,
  YargLightingNodeCueDefinition,
  YargMotionNodeCueDefinition,
  YargNodeCueFile,
} from '../../../cues/types/nodeCueTypes'
import { CueType } from '../../../cues/types/cueTypes'
import { noopRuntimeBroadcaster } from '../../../runtime/broadcaster'

/** A minimal RB3 lighting cue file (YARG-shaped, mode 'rb3') keyed to a real CueType. */
function rb3LightingFile(
  cueType: CueType = CueType.Strobe_Fast,
  groupId = 'loader-test-rb3',
): Rb3NodeCueFile {
  const ev: YargEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
  const action: ActionNode = {
    id: 'a1',
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'all' },
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: { source: 'literal', value: 'white' },
      brightness: { source: 'literal', value: 'max' },
    },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 200 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 100 },
  }
  const cue: YargLightingNodeCueDefinition = {
    kind: 'lighting',
    id: 'c1',
    name: 'RB3 light',
    cueType,
    style: 'secondary',
    nodes: { events: [ev], actions: [action], logic: [] },
    connections: [{ from: 'ev-called', to: 'a1' }],
  }
  return {
    version: 1,
    mode: 'rb3',
    group: { id: groupId, name: 'Loader test RB3', isStageKit: true },
    cues: [cue],
  }
}

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
    // The RB3 registry is a module singleton; reset it so rb3 groups don't leak across tests.
    getRb3CueRegistry().reset()

    loader = new NodeCueLoader({
      runtimeBroadcaster: noopRuntimeBroadcaster(),
      baseDir: tmpDir,
      yargRegistry,
      audioRegistry,
      rb3Registry: getRb3CueRegistry(),
    })
  })

  afterEach(() => {
    yargRegistry.reset()
    audioRegistry.reset()
    getRb3CueRegistry().reset()
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

  it('unregisters a cue file that vanished from disk on reload (C-11)', async () => {
    const file = yargMotionOnlyFile()
    const yargDir = path.join(tmpDir, 'node-data', 'cues', 'yarg')
    fs.mkdirSync(yargDir, { recursive: true })
    const filePath = path.join(yargDir, 'motion-only.json')
    fs.writeFileSync(filePath, JSON.stringify(file), 'utf-8')

    await loader.loadAll()
    expect(yargRegistry.getGroup('loader-test-yarg-motion')).toBeDefined()

    // Delete the file and reload with no watcher unlink event — the stale group must be dropped.
    fs.rmSync(filePath)
    await loader.reload()

    expect(yargRegistry.getGroup('loader-test-yarg-motion')).toBeUndefined()
  })

  it('surfaces a per-cue compile failure on the file summary', async () => {
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

  describe('RB3 cue mode', () => {
    const writeRb3 = (filename: string, file: Rb3NodeCueFile): void => {
      const rb3Dir = path.join(tmpDir, 'node-data', 'cues', 'rb3')
      fs.mkdirSync(rb3Dir, { recursive: true })
      fs.writeFileSync(path.join(rb3Dir, filename), JSON.stringify(file), 'utf-8')
    }

    it('loads RB3 cues into the RB3 registry, not the YARG registry', async () => {
      const file = rb3LightingFile(CueType.Strobe_Fast)
      expect(validateRb3NodeCueFile(file).valid).toBe(true)
      writeRb3('rb3.json', file)

      await loader.loadAll()

      const group = getRb3CueRegistry().getGroup('loader-test-rb3')
      expect(group).toBeDefined()
      expect(group!.cues.get(CueType.Strobe_Fast)).toBeDefined()
      // The RB3 domain is isolated from the YARG listener's registry.
      expect(yargRegistry.getGroup('loader-test-rb3')).toBeUndefined()
    })

    it('exposes only CueType.RB3 for rb3 and hides it from the YARG picker', () => {
      expect(loader.getAvailableCueTypes('rb3')).toEqual([CueType.RB3])
      expect(loader.getAvailableCueTypes('yarg')).not.toContain(CueType.RB3)
    })

    it('renders strobes but no-ops the unauthored base cue (strobe resolves, RB3 is null)', async () => {
      writeRb3('rb3.json', rb3LightingFile(CueType.Strobe_Fast))
      await loader.loadAll()

      const rb3 = getRb3CueRegistry()
      // The registered strobe resolves to a cue implementation...
      expect(rb3.getCueImplementation(CueType.Strobe_Fast, 'simulated')).not.toBeNull()
      // ...while the always-active base RB3 cue is unauthored and resolves to a clean no-op.
      expect(rb3.getCueImplementation(CueType.RB3, 'simulated')).toBeNull()
    })

    it('round-trips a saved RB3 file and scopes group-id conflicts to the rb3 domain', async () => {
      const file = rb3LightingFile(CueType.Strobe_Fast, 'rb3-shared')
      await expect(loader.saveFile('rb3', 'first.json', file)).resolves.toMatchObject({
        success: true,
      })

      const read = await loader.readFile(path.join('node-data', 'cues', 'rb3', 'first.json'))
      expect(read.mode).toBe('rb3')
      expect(read.group.id).toBe('rb3-shared')

      // Same group id in the rb3 domain on a different path conflicts...
      await expect(loader.saveFile('rb3', 'second.json', file)).rejects.toThrow(
        /already uses group id/,
      )
      // ...but a YARG file reusing the id is fine — the domains are independent.
      const yargFile = yargMotionOnlyFile()
      yargFile.group.id = 'rb3-shared'
      await expect(loader.saveFile('yarg', 'yarg-shared.json', yargFile)).resolves.toMatchObject({
        success: true,
      })
    })
  })
})
