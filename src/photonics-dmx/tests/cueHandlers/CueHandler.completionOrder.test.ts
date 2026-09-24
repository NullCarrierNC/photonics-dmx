import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { CueHandler } from '../../cueHandlers/CueHandler'
import { MotionSelectionCoordinator } from '../../cueHandlers/MotionSelectionCoordinator'
import { CueRegistry } from '../../cues/registries/CueRegistry'
import { CueStyle, type INetCue } from '../../cues/interfaces/INetCue'
import { CueType, defaultCueData, type CueData } from '../../cues/types/cueTypes'
import type {
  ActionNode,
  LogicNode,
  NetEventNode,
  NetNodeCueDefinition,
} from '../../cues/types/nodeCueTypes'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { LightingNodeCue } from '../../cues/node/runtime/LightingNodeCue'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import type { ILightingController } from '../../controllers/sequencer/interfaces'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { createMockLightingConfig } from '../helpers/testFixtures'
import {
  completingLightingController,
  type CompletingLightingController,
} from '../helpers/fakeLightingController'

const SUBMISSIONS = [
  'addEffect',
  'setEffect',
  'replaceEffect',
  'replaceEffectWithCallback',
  'addEffectUnblockedName',
  'setEffectUnblockedName',
  'addEffectWithCallback',
  'setEffectWithCallback',
  'addEffectUnblockedNameWithCallback',
  'setEffectUnblockedNameWithCallback',
] as const

function submissionCount(sequencer: CompletingLightingController): number {
  return SUBMISSIONS.reduce((total, member) => total + sequencer[member].mock.calls.length, 0)
}

function frame(lightingCue: CueType): CueData {
  return { ...defaultCueData, currentScene: 'Gameplay', trackMode: 'tracked', lightingCue }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

function colorAction(id: string, color: string, blocking: boolean): ActionNode {
  return {
    id,
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: { source: 'literal', value: color },
      brightness: { source: 'literal', value: 'high' },
    },
    layer: { source: 'literal', value: 0 },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 200 },
      waitUntilCondition: { source: 'literal', value: blocking ? 'delay' : 'none' },
      waitUntilTime: { source: 'literal', value: blocking ? 100 : 0 },
    },
  }
}

/**
 * A primary cue that shows each colour in turn. Every colour but the last waits out a delay, and a
 * logic step after it starts the next, so the next colour waits for the effect's completion.
 */
function steppedCue(id: string, cueType: CueType, colors: string[]): LightingNodeCue {
  const started: NetEventNode = { id: `${id}-start`, type: 'event', eventType: 'cue-started' }
  const actions = colors.map((color, i) => colorAction(`${id}-${i}`, color, i < colors.length - 1))
  const steps: LogicNode[] = actions.slice(1).map((_, i) => ({
    id: `${id}-step-${i}`,
    type: 'logic',
    logicType: 'variable',
    mode: 'set',
    varName: 'step',
    valueType: 'number',
    value: { source: 'literal', value: i + 1 },
  }))
  const definition: NetNodeCueDefinition = {
    id,
    name: id,
    kind: 'lighting',
    cueType,
    style: 'primary',
    variables: [{ name: 'step', type: 'number', scope: 'cue', initialValue: 0 }],
    nodes: { events: [started], actions, logic: steps },
    connections: [
      { from: started.id, to: actions[0].id },
      ...steps.flatMap((step, i) => [
        { from: actions[i].id, to: step.id },
        { from: step.id, to: actions[i + 1].id },
      ]),
    ],
    layout: { nodePositions: {} },
  }
  return new LightingNodeCue('completion-order', NodeCueCompiler.compileCue(definition, 'yarg'))
}

type FakeCue = INetCue & { execute: jest.Mock; onStop: jest.Mock }

function fakeCue(id: string, execute: (sequencer: ILightingController) => void = () => {}) {
  return {
    cueId: id,
    id,
    style: CueStyle.Primary,
    execute: jest.fn(async (_data: CueData, sequencer: ILightingController) => execute(sequencer)),
    onStop: jest.fn(),
  } as unknown as FakeCue
}

describe('CueHandler with completions held to a later frame', () => {
  let registry: CueRegistry
  let sequencer: CompletingLightingController
  let handler: CueHandler
  let cues: Partial<Record<CueType, INetCue>>

  beforeEach(() => {
    registry = CueRegistry.create()
    cues = {}
    jest
      .spyOn(registry, 'getCueImplementation')
      .mockImplementation((cueType) => cues[cueType] ?? null)
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)
    sequencer = completingLightingController()
    handler = new CueHandler(new DmxLightManager(createMockLightingConfig()), sequencer, {
      registry,
    })
  })

  afterEach(() => {
    handler.shutdown()
    jest.restoreAllMocks()
  })

  it('runs the next action of the playing cue when its effect finishes', async () => {
    cues[CueType.Verse] = steppedCue('verse', CueType.Verse, ['blue', 'red'])
    await handler.handleCue(CueType.Verse, frame(CueType.Verse))
    expect(sequencer.heldCompletions()).toHaveLength(1)
    const submitted = submissionCount(sequencer)

    sequencer.tick()
    await settle()

    expect(submissionCount(sequencer)).toBeGreaterThan(submitted)
  })

  it('drops the wait of a cue the chart moved on from, so its next action never runs', async () => {
    cues[CueType.Verse] = steppedCue('verse', CueType.Verse, ['blue', 'red'])
    cues[CueType.Chorus] = steppedCue('chorus', CueType.Chorus, ['green'])
    await handler.handleCue(CueType.Verse, frame(CueType.Verse))

    await handler.handleCue(CueType.Chorus, frame(CueType.Chorus))
    expect(sequencer.heldCompletions()).toEqual([])
    const submitted = submissionCount(sequencer)
    sequencer.tick()
    await settle()

    expect(submissionCount(sequencer)).toBe(submitted)
  })

  it('does not start the next action when the effect it waits on is cancelled', async () => {
    cues[CueType.Verse] = steppedCue('verse', CueType.Verse, ['blue', 'red'])
    await handler.handleCue(CueType.Verse, frame(CueType.Verse))
    const submitted = submissionCount(sequencer)

    sequencer.removeAllEffects()
    await settle()

    expect(submissionCount(sequencer)).toBe(submitted)
  })

  it("cuts a cue's own fade when a new primary arrives before it finishes", async () => {
    cues[CueType.Verse] = fakeCue('verse', (seq) => void seq.blackout(1000))
    cues[CueType.Chorus] = fakeCue('chorus')
    await handler.handleCue(CueType.Verse, frame(CueType.Verse))

    await handler.handleCue(CueType.Chorus, frame(CueType.Chorus))

    expect(sequencer.blackout).toHaveBeenLastCalledWith(0)
  })

  it("leaves the lights alone when a new primary arrives after the cue's fade finished", async () => {
    cues[CueType.Verse] = fakeCue('verse', (seq) => void seq.blackout(1000))
    cues[CueType.Chorus] = fakeCue('chorus')
    await handler.handleCue(CueType.Verse, frame(CueType.Verse))
    sequencer.tick()
    await settle()

    await handler.handleCue(CueType.Chorus, frame(CueType.Chorus))

    expect(sequencer.blackout).toHaveBeenCalledTimes(1)
  })
})

describe('motion across two chains when one chain is wiped between frames', () => {
  let registry: CueRegistry
  let emit: jest.Mock
  let sequencers: CompletingLightingController[]
  let handlers: CueHandler[]

  beforeEach(() => {
    registry = CueRegistry.create()
    emit = jest.fn()
    const coordinator = new MotionSelectionCoordinator({
      registry,
      runtimeBroadcaster: { emit } as never,
      getMotionCueMinimumHoldMs: () => 60_000,
    })
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(fakeCue('lighting'))
    jest
      .spyOn(registry, 'findMotionCueRef')
      .mockImplementation((cue) => ({ groupId: 'motion-group', cueId: (cue as FakeCue).id }))
    sequencers = [completingLightingController(), completingLightingController()]
    handlers = sequencers.map(
      (sequencer) =>
        new CueHandler(new DmxLightManager(createMockLightingConfig()), sequencer, {
          registry,
          motionCoordinator: coordinator,
        }),
    )
  })

  afterEach(() => {
    for (const handler of handlers) handler.shutdown()
    jest.restoreAllMocks()
  })

  const dispatch = async (cueType: CueType): Promise<void> => {
    const token = {}
    for (const handler of handlers) await handler.handleCue(cueType, frame(cueType), token)
  }

  it('picks once on the next frame, inside the hold, and runs the pick on both chains', async () => {
    const a = fakeCue('motion-a')
    const b = fakeCue('motion-b')
    const getRandom = jest
      .spyOn(registry, 'getRandomMotionCue')
      .mockReturnValueOnce(a)
      .mockReturnValueOnce(b)
    await dispatch(CueType.Verse)

    sequencers[1].removeAllEffects()
    emit.mockClear()
    await dispatch(CueType.Verse)

    expect(getRandom).toHaveBeenCalledTimes(2)
    expect(a.onStop).toHaveBeenCalled()
    expect(b.execute).toHaveBeenCalledTimes(2)
    expect(b.execute.mock.calls.map((call) => call[1])).toEqual(sequencers)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
      expect.objectContaining({ ref: { groupId: 'motion-group', cueId: 'motion-b' } }),
    )
  })
})
