import { describe, expect, it } from '@jest/globals'
import { createSequencerHarness } from '../../../helpers/sequencerHarness'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import { LightingNodeCue } from '../../../../cues/node/runtime/LightingNodeCue'
import { CueType, defaultCueData, type CueData } from '../../../../cues/types/cueTypes'
import type {
  NetNodeCueDefinition,
  YargEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'

/** A blocking set-color on layer 5 that holds until the next beat. */
const heldColour = (id: string, group: string, color: string): YargEffectDefinition =>
  ({
    id,
    mode: 'yarg',
    name: id,
    description: '',
    variables: [],
    nodes: {
      events: [],
      actions: [
        {
          id: `${id}-action`,
          type: 'action',
          effectType: 'set-color',
          target: {
            groups: { source: 'literal', value: group },
            filter: { source: 'literal', value: 'all' },
          },
          color: {
            name: { source: 'literal', value: color },
            brightness: { source: 'literal', value: 'high' },
            blendMode: { source: 'literal', value: 'replace' },
          },
          timing: {
            waitForCondition: { source: 'literal', value: 'none' },
            waitForTime: { source: 'literal', value: 0 },
            duration: { source: 'literal', value: 0 },
            waitUntilCondition: { source: 'literal', value: 'beat' },
            waitUntilTime: { source: 'literal', value: 0 },
            easing: { source: 'literal', value: 'linear' },
            level: { source: 'literal', value: 1 },
          },
          layer: { source: 'literal', value: 5 },
        },
      ],
      logic: [],
      eventRaisers: [],
      eventListeners: [],
      effectListeners: [
        { id: `${id}-entry`, type: 'effect-listener', label: 'Entry', outputs: [] },
      ],
    },
    connections: [{ from: `${id}-entry`, to: `${id}-action` }],
    layout: { nodePositions: {} },
  }) as unknown as YargEffectDefinition

const beatFrame = (): CueData => ({
  ...defaultCueData,
  currentScene: 'Gameplay',
  trackMode: 'tracked',
  lightingCue: CueType.Verse,
  beat: 'Strong',
})

describe('an interruptible effect raiser beside a sibling on the same layer', () => {
  it('leaves the sibling running when it is re-triggered', async () => {
    const h = createSequencerHarness({ frontCount: 2, backCount: 2 })
    const registry = new EffectRegistry()
    registry.registerEffect(
      'front-red',
      EffectCompiler.compile(heldColour('front-red', 'front', 'red')),
    )
    registry.registerEffect(
      'back-blue',
      EffectCompiler.compile(heldColour('back-blue', 'back', 'blue')),
    )
    const definition = {
      id: 'C',
      name: 'C',
      kind: 'lighting',
      cueType: CueType.Verse,
      style: 'primary',
      nodes: {
        events: [{ id: 'ev-beat', type: 'event', eventType: 'beat' }],
        actions: [],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: [
          {
            id: 'sibling',
            type: 'effect-raiser',
            effectId: 'back-blue',
            label: 'Sibling',
            outputs: [],
            isPersistent: true,
          },
          {
            id: 'interruptible',
            type: 'effect-raiser',
            effectId: 'front-red',
            label: 'Interruptible',
            outputs: [],
            interruptible: true,
          },
        ],
      },
      connections: [
        { from: 'ev-beat', to: 'sibling' },
        { from: 'ev-beat', to: 'interruptible' },
      ],
      layout: { nodePositions: {} },
    } as unknown as NetNodeCueDefinition
    const cue = new LightingNodeCue('g', NodeCueCompiler.compileCue(definition, 'yarg'), registry)

    const cancelledNames: string[] = []
    const submittedNames: string[] = []
    const addWithCallback = h.sequencer.addEffectUnblockedNameWithCallback.bind(h.sequencer)
    h.sequencer.addEffectUnblockedNameWithCallback = (name, effect, onComplete, persistent) => {
      submittedNames.push(name)
      addWithCallback(
        name,
        effect,
        (cancelled) => {
          if (cancelled) cancelledNames.push(name)
          onComplete(cancelled)
        },
        persistent,
      )
    }
    const backLit = (): boolean =>
      h.backLightIds.every((id) => (h.getLightState(id)?.intensity ?? 0) > 0)

    cue.execute(beatFrame(), h.sequencer, h.lightManager)
    h.advanceBy(20)
    expect(backLit()).toBe(true)
    const siblingName = submittedNames.find((name) => name.includes('back-blue'))

    cue.execute(beatFrame(), h.sequencer, h.lightManager)
    expect(backLit()).toBe(true)
    await Promise.resolve()
    h.advanceBy(20)

    expect(backLit()).toBe(true)
    expect(cancelledNames).not.toContain(siblingName)
    expect(submittedNames.filter((name) => name === siblingName)).toHaveLength(1)
    cue.onStop()
    h.cleanup()
  })
})
