import { YargNodeCue } from '../../../cues/node/runtime/YargNodeCue'
import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler'
import { CueType } from '../../../cues/types/cueTypes'
import type { YargNodeCueDefinition } from '../../../cues/types/nodeCueTypes'
import { ActionEffectFactory } from '../../../cues/node/compiler/ActionEffectFactory'

jest.mock('../../../../main/utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

describe('Node cue logic runtime', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('branches through conditional logic and clamps divide-by-zero', async () => {
    const definition: YargNodeCueDefinition = {
      id: 'logic-cue',
      name: 'Logic Cue',
      cueType: CueType.Chorus,
      style: 'primary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
        actions: [
          {
            id: 'action-true',
            type: 'action',
            effectType: 'set-color',
            target: {
              groups: { source: 'literal', value: 'front' },
              filter: { source: 'literal', value: 'all' },
            },
            color: {
              name: { source: 'literal', value: 'blue' },
              brightness: { source: 'literal', value: 'medium' },
              blendMode: { source: 'literal', value: 'replace' },
            },
            timing: {
              waitForCondition: 'none',
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 100 },
              waitUntilCondition: 'none',
              waitUntilTime: { source: 'literal', value: 0 },
              easing: 'sinInOut',
              level: { source: 'literal', value: 1 },
            },
          },
          {
            id: 'action-false',
            type: 'action',
            effectType: 'set-color',
            target: {
              groups: { source: 'literal', value: 'front' },
              filter: { source: 'literal', value: 'all' },
            },
            color: {
              name: { source: 'literal', value: 'red' },
              brightness: { source: 'literal', value: 'medium' },
              blendMode: { source: 'literal', value: 'replace' },
            },
            timing: {
              waitForCondition: 'none',
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 100 },
              waitUntilCondition: 'none',
              waitUntilTime: { source: 'literal', value: 0 },
              easing: 'sinInOut',
              level: { source: 'literal', value: 1 },
            },
          },
        ],
        logic: [
          {
            id: 'math-1',
            type: 'logic',
            logicType: 'math',
            operator: 'divide',
            left: { source: 'literal', value: 10 },
            right: { source: 'literal', value: 0 },
            assignTo: 'calc',
          },
          {
            id: 'cond-1',
            type: 'logic',
            logicType: 'conditional',
            comparator: '==',
            left: { source: 'variable', name: 'calc', fallback: 0 },
            right: { source: 'literal', value: 0 },
          },
        ],
      },
      connections: [
        { from: 'event-1', to: 'math-1' },
        { from: 'math-1', to: 'cond-1' },
        { from: 'cond-1', to: 'action-true', fromPort: 'true' },
        { from: 'cond-1', to: 'action-false', fromPort: 'false' },
      ],
      layout: { nodePositions: {} },
    }

    const compiled = NodeCueCompiler.compileYargCue(definition)
    const cue = new YargNodeCue('group-1', compiled)

    const addEffect = jest.fn()

    const sequencer = {
      addEffect,
    } as any

    const lightManager = {
      getLights: jest.fn().mockReturnValue([{ id: 'l1', position: 0 }]),
    } as any

    jest
      .spyOn(ActionEffectFactory, 'resolveLights')
      .mockReturnValue([{ id: 'l1', position: 0 } as any])
    const buildEffectSpy = jest.spyOn(ActionEffectFactory, 'buildEffect').mockImplementation(
      ({ action, waitTime }) =>
        ({
          id: action.id,
          description: 'mock',
          transitions: [
            {
              lights: [],
              layer: action.layer ?? 0,
              waitForCondition: 'none',
              waitForTime: waitTime ?? 0,
              transform: {
                color: {
                  red: 0,
                  green: 0,
                  blue: 0,
                  intensity: 0,
                  opacity: 1,
                  blendMode: 'replace',
                },
                easing: 'sin.in',
                duration: action.timing.duration,
              },
              waitUntilCondition: 'none',
              waitUntilTime: 0,
            },
          ],
        }) as any,
    )

    await cue.execute({ beat: 'Strong' } as any, sequencer, lightManager)

    // Verify the conditional logic evaluated correctly (10/0 = 0, 0 == 0 is true)
    expect(buildEffectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.objectContaining({ id: 'action-true' }) }),
    )
    expect(buildEffectSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.objectContaining({ id: 'action-false' }) }),
    )
    expect(addEffect).toHaveBeenCalledTimes(1)
  })

  it('buildEffect returns effect for dual-mode-rotation and alternating-pattern', () => {
    const lights = [
      { id: 'l1', position: 0 },
      { id: 'l2', position: 1 },
    ] as any[]
    const resolvedColor = {
      name: 'green' as const,
      brightness: 'medium' as const,
      blendMode: 'replace' as const,
    }
    const dualModeAction = {
      id: 'a1',
      type: 'action' as const,
      effectType: 'dual-mode-rotation' as const,
      target: {
        groups: { source: 'literal' as const, value: 'front' },
        filter: { source: 'literal' as const, value: 'all' },
      },
      color: {
        name: { source: 'literal' as const, value: 'green' },
        brightness: { source: 'literal' as const, value: 'medium' },
        blendMode: { source: 'literal' as const, value: 'replace' },
      },
      timing: {
        waitForCondition: 'beat' as const,
        waitForTime: { source: 'literal' as const, value: 0 },
        duration: { source: 'literal' as const, value: 0 },
        waitUntilCondition: 'none' as const,
        waitUntilTime: { source: 'literal' as const, value: 0 },
        easing: 'linear',
        level: { source: 'literal' as const, value: 1 },
      },
      config: {
        beatsPerCycle: 2,
        dualModeSolidColor: 'green',
        dualModeSwitchCondition: 'measure' as const,
        dualModeIsLargeVenue: true,
      },
    } as any
    const altAction = {
      id: 'a2',
      type: 'action' as const,
      effectType: 'alternating-pattern' as const,
      target: {
        groups: { source: 'literal' as const, value: 'front' },
        filter: { source: 'literal' as const, value: 'third-2' },
      },
      color: {
        name: { source: 'literal' as const, value: 'blue' },
        brightness: { source: 'literal' as const, value: 'medium' },
        blendMode: { source: 'literal' as const, value: 'replace' },
      },
      timing: {
        waitForCondition: 'keyframe' as const,
        waitForTime: { source: 'literal' as const, value: 0 },
        duration: { source: 'literal' as const, value: 0 },
        waitUntilCondition: 'none' as const,
        waitUntilTime: { source: 'literal' as const, value: 0 },
        easing: 'linear',
        level: { source: 'literal' as const, value: 1 },
      },
      config: { switchCondition: 'keyframe' as const, completeCondition: 'beat' as const },
    } as any
    const dualEffect = ActionEffectFactory.buildEffect({
      action: dualModeAction,
      lights,
      resolvedColor,
      resolvedTiming: {
        waitForCondition: 'beat',
        waitForTime: 0,
        duration: 0,
        waitUntilCondition: 'none',
        waitUntilTime: 0,
      },
      resolvedLayer: 1,
    })
    const altEffect = ActionEffectFactory.buildEffect({
      action: altAction,
      lights,
      patternBLights: [lights[1]],
      resolvedColor: {
        name: 'blue' as const,
        brightness: 'medium' as const,
        blendMode: 'replace' as const,
      },
      resolvedTiming: {
        waitForCondition: 'keyframe',
        waitForTime: 0,
        duration: 0,
        waitUntilCondition: 'none',
        waitUntilTime: 0,
      },
      resolvedLayer: 0,
    })
    expect(dualEffect).not.toBeNull()
    expect(dualEffect!.transitions.length).toBeGreaterThan(0)
    expect(altEffect).not.toBeNull()
    expect(altEffect!.transitions.length).toBeGreaterThan(0)
  })
})
