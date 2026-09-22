import fs from 'fs'
import path from 'path'
import { performance } from 'perf_hooks'
import { YargNetworkListener } from '../../listeners/YARG/YargNetworkListener'
import {
  SceneIndexByte,
  StrobeByte,
  BeatByte,
  PauseStateByte,
} from '../../listeners/YARG/yargTypes'
import { ChainFanout } from '../../controllers/ChainFanout'
import type { RigChain } from '../../controllers/RigChain'
import { CueHandler } from '../../cueHandlers/CueHandler'
import { CueRegistry } from '../../cues/registries/CueRegistry'
import { buildNetGroup } from '../../cues/node/loader/cueGroupBuilders'
import { EffectRegistry } from '../../cues/node/runtime/EffectRegistry'
import { EffectCompiler } from '../../cues/node/compiler/EffectCompiler'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { LightingNodeCue } from '../../cues/node/runtime/LightingNodeCue'
import { validateYargNodeCueFile } from '../../cues/node/schema/validation'
import { Sequencer } from '../../controllers/sequencer/Sequencer'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { __resetStrobeStateManagerForTests } from '../../controllers/StrobeStateManager'
import { createMockCueData } from '../../../main/ipc/mockCueData'
import { CueType } from '../../cues/types/cueTypes'
import type { NetNodeCueDefinition } from '../../cues/types/nodeCueTypes'
import type { ActionNode, NetEventNode } from '../../cues/types/nodeCueTypes'
import { ManualTestClock, createSequencerHarness } from '../helpers/sequencerHarness'
import { createMockLightingConfig, createMockDmxLight } from '../helpers/testFixtures'
import { buildYargPacket } from '../helpers/yargPacket'
import { loadCoreEffectRegistry } from '../helpers/effectRegistry'
import { loadRb3CueFile, createRb3Cue, renderFrames } from '../helpers/rb3CueFile'

const NODE_DATA = path.join(__dirname, '../../../../resources/defaults/node-data')
const noopCallbacks = { emit: () => {} }

function allBundledYargEffects(): EffectRegistry {
  const registry = new EffectRegistry()
  const dir = path.join(NODE_DATA, 'effects/yarg')
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as {
      effects: Array<{ id: string }>
    }
    for (const def of parsed.effects) {
      registry.registerEffect(def.id, EffectCompiler.compile(def as never))
    }
  }
  return registry
}

function setColorAction(
  id: string,
  color: string,
  layer: number,
  filter = 'all',
  durationMs = 0,
): ActionNode {
  return {
    id,
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: filter },
    },
    color: {
      name: { source: 'literal', value: color },
      brightness: { source: 'literal', value: 'high' },
    },
    layer: { source: 'literal', value: layer },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: durationMs },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
  }
}

function singleActionCue(
  id: string,
  style: 'primary' | 'secondary',
  action: ActionNode,
): NetNodeCueDefinition {
  const started: NetEventNode = { id: `${id}-start`, type: 'event', eventType: 'cue-started' }
  return {
    id,
    name: id,
    kind: 'lighting',
    cueType: (style === 'primary' ? CueType.Verse : CueType.Strobe_Fast) as never,
    style,
    nodes: { events: [started], actions: [action], logic: [] },
    connections: [{ from: started.id, to: action.id }],
    layout: { nodePositions: {} },
  }
}

describe('secondary cue over a primary look', () => {
  it('draws over the lights it targets and leaves the primary showing everywhere else', () => {
    const h = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const primary = new LightingNodeCue(
      'g',
      NodeCueCompiler.compileCue(
        singleActionCue('p', 'primary', setColorAction('pa', 'blue', 0)),
        'yarg',
      ),
    )
    const secondary = new LightingNodeCue(
      'g',
      NodeCueCompiler.compileCue(
        singleActionCue('s', 'secondary', setColorAction('sa', 'red', 5, 'odd')),
        'yarg',
      ),
    )
    const colours = (): string[] =>
      h.frontLightIds.map((id) => {
        const state = h.getLightState(id)
        return state && state.intensity > 0 ? (state.red > 0 ? 'red' : 'blue') : 'dark'
      })
    const data = createMockCueData({ venueSize: 'Small', bpm: 120 })

    primary.execute(data, h.sequencer, h.lightManager)
    h.advanceBy(50)
    secondary.execute(data, h.sequencer, h.lightManager)
    h.advanceBy(50)
    expect(colours()).toEqual(['red', 'blue'])

    secondary.onStop()
    h.advanceBy(50)
    expect(colours()).toEqual(['blue', 'blue'])
    h.cleanup()
  })

  it('leaves the primary running on a shared layer when the secondary stops', () => {
    const h = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const primary = new LightingNodeCue(
      'g',
      NodeCueCompiler.compileCue(
        singleActionCue('p', 'primary', setColorAction('pa', 'blue', 3, 'even', 1000)),
        'yarg',
      ),
    )
    const secondary = new LightingNodeCue(
      'g',
      NodeCueCompiler.compileCue(
        singleActionCue('s', 'secondary', setColorAction('sa', 'red', 3, 'odd', 1000)),
        'yarg',
      ),
    )
    const data = createMockCueData({ venueSize: 'Small', bpm: 120 })
    primary.execute(data, h.sequencer, h.lightManager)
    secondary.execute(data, h.sequencer, h.lightManager)
    h.advanceBy(100)

    secondary.onStop()
    h.advanceBy(1000)
    const primaryLight = h.getLightState(h.frontLightIds[1])
    expect(primaryLight?.blue ?? 0).toBeGreaterThan(0)
    expect(primaryLight?.intensity ?? 0).toBeGreaterThan(0)
    h.cleanup()
  })
})

describe('Stage Kit chart strobe through the YARG listener', () => {
  afterEach(() => {
    CueRegistry.getInstance().reset()
    __resetStrobeStateManagerForTests()
  })

  async function litThroughStrobe(lightingCueByte: number): Promise<number[]> {
    __resetStrobeStateManagerForTests()
    const clock = new ManualTestClock(10)
    const nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => clock.getCurrentTimeMs())
    const light = (group: 'front' | 'back' | 'strobe', position: number) =>
      createMockDmxLight({
        id: `${group}-${position}`,
        group,
        position,
        isStrobeEnabled: group === 'strobe',
      })
    const lightManager = new DmxLightManager(
      createMockLightingConfig({
        numLights: 10,
        frontLights: [1, 2, 3, 4].map((p) => light('front', p)),
        backLights: [5, 6, 7, 8].map((p) => light('back', p)),
        strobeLights: [9, 10].map((p) => light('strobe', p)),
      }),
    )
    const lightStateManager = new LightStateManager()
    const sequencer = new Sequencer(
      new LightTransitionController(lightStateManager),
      clock as never,
    )

    const registry = CueRegistry.getInstance()
    registry.reset()
    const file = validateYargNodeCueFile(
      JSON.parse(fs.readFileSync(path.join(NODE_DATA, 'cues/yarg/yarg-stagekit.json'), 'utf8')),
    )
    if (!file.valid) throw new Error('yarg-stagekit.json failed validation')
    const effects = allBundledYargEffects()
    const group = await buildNetGroup(file.data as never, [], {
      runtimeBroadcaster: noopCallbacks,
      buildEffectRegistry: async () => effects,
    })
    registry.registerGroup(group)
    registry.setEnabledGroups([group.id])
    registry.setActiveGroups([group.id])

    const handler = new CueHandler(lightManager, sequencer, { registry })
    const fanout = new ChainFanout()
    fanout.setChains([
      {
        rigId: 'A',
        isPrimary: true,
        sequencer,
        dmxLightManager: lightManager,
        cueHandlers: { yarg: handler, rb3: null },
        audioCueHandler: null,
        rb3MenuCueHandler: null,
      } as unknown as RigChain,
    ])
    const listener = new YargNetworkListener(fanout.cueRuntime('yarg'))
    const deserialize = (packet: Buffer): void =>
      (listener as unknown as { deserializePacket(b: Buffer): void }).deserializePacket(packet)

    const lit = (): number =>
      lightManager
        .getLights(['front', 'back'], ['all'])
        .filter((l) => (lightStateManager.getLightState(l.id)?.intensity ?? 0) > 0).length

    let beat = 0
    const frame = async (strobe: number): Promise<void> => {
      beat = (beat + 1) % 16
      deserialize(
        buildYargPacket({
          datagramVersion: 5,
          scene: SceneIndexByte.Gameplay,
          pause: PauseStateByte.Unpaused,
          lightingCue: lightingCueByte,
          strobe,
          beat: beat === 0 ? BeatByte.Measure : beat % 4 === 0 ? BeatByte.Strong : BeatByte.Off,
          guitarNotes: 0,
          bassNotes: 0,
          drumNotes: 0,
          keysNotes: 0,
          vocalNote: 0,
        }),
      )
      for (let i = 0; i < 4; i++) await Promise.resolve()
      clock.tick(33)
      for (let i = 0; i < 4; i++) await Promise.resolve()
    }

    try {
      for (let f = 0; f < 60; f++) await frame(StrobeByte.Strobe_Off)
      const before = lit()
      await frame(StrobeByte.Strobe_Fast)
      const firstStrobeFrame = lit()
      for (let f = 0; f < 29; f++) await frame(StrobeByte.Strobe_Fast)
      for (let f = 0; f < 3; f++) await frame(StrobeByte.Strobe_Off)
      const justAfter = lit()
      for (let f = 0; f < 90; f++) await frame(StrobeByte.Strobe_Off)
      return [before, firstStrobeFrame, justAfter, lit()]
    } finally {
      handler.shutdown()
      sequencer.shutdown()
      nowSpy.mockRestore()
    }
  }

  it.each([
    ['Intro', 15],
    ['Silhouettes', 17],
    ['Flare_Fast', 12],
  ])('keeps every front and back light of %s lit through the strobe and after', async (_, byte) => {
    expect(await litThroughStrobe(byte)).toEqual([8, 8, 8, 8])
  })
})

describe('RB3 Stage Kit strobe cue', () => {
  it('leaves the RB3 look lit when the strobe starts', () => {
    const h = createSequencerHarness({ frontCount: 4, backCount: 4, strobeCount: 2 })
    const rb3 = createRb3Cue('rb3-stagekit')
    const strobeDef = loadRb3CueFile('rb3-stagekit').cues.find(
      (c) => c.kind === 'lighting' && c.cueType === CueType.Strobe_Slow,
    )
    if (!strobeDef) throw new Error('rb3-stagekit: no Strobe_Slow cue')
    const strobe = new LightingNodeCue(
      'rb3-stagekit',
      NodeCueCompiler.compileCue(strobeDef, 'rb3'),
      loadCoreEffectRegistry(['effect-flash-color']),
      noopCallbacks,
    )

    renderFrames(h, rb3, { red: 0xff })
    const litFront = (): number =>
      h.frontLightIds.filter((id) => (h.getLightState(id)?.intensity ?? 0) > 0).length
    expect(litFront()).toBe(4)

    strobe.execute(
      { ...createMockCueData({ venueSize: 'Small', bpm: 120 }), cueStartTime: 0 },
      h.sequencer,
      h.lightManager,
    )
    h.advanceBy(10)
    expect(litFront()).toBe(4)
    h.cleanup()
  })
})
