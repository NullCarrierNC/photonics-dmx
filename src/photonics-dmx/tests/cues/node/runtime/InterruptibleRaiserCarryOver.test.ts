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

const lit = <T extends string | number>(value: T) => ({ source: 'literal' as const, value })

/** Timing for a set-color that runs `duration` ms and then holds `hold` ms. */
const timing = (duration: number, hold: number) => ({
  waitForCondition: lit('none'),
  waitForTime: lit(0),
  duration: lit(duration),
  waitUntilCondition: lit('delay'),
  waitUntilTime: lit(hold),
  easing: lit('linear'),
  level: lit(1),
})

/**
 * A flash of the front lights on layer 5: red in over 150 ms and held 300 ms, then out over
 * 400 ms, so the fade out runs from 450 ms to 850 ms.
 */
const flashRed: YargEffectDefinition = {
  id: 'flash-red',
  mode: 'yarg',
  name: 'flash-red',
  description: '',
  variables: [],
  nodes: {
    events: [],
    actions: ['in', 'out'].map((id) => ({
      id,
      type: 'action',
      effectType: 'set-color',
      target: { groups: lit('front'), filter: lit('all') },
      color: {
        name: lit('red'),
        brightness: lit('max'),
        blendMode: lit('replace'),
        opacity: lit(id === 'in' ? 1 : 0),
      },
      timing: id === 'in' ? timing(150, 300) : timing(400, 0),
      layer: lit(5),
    })),
    logic: [],
    eventRaisers: [],
    eventListeners: [],
    effectListeners: [{ id: 'entry', type: 'effect-listener', label: 'Entry', outputs: [] }],
  },
  connections: [
    { from: 'entry', to: 'in' },
    { from: 'in', to: 'out' },
  ],
  layout: { nodePositions: {} },
}

const cueDefinition: NetNodeCueDefinition = {
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
        id: 'raiser',
        type: 'effect-raiser',
        effectId: 'flash-red',
        label: 'Flash',
        outputs: [],
        interruptible: true,
      },
    ],
  },
  connections: [{ from: 'ev-beat', to: 'raiser' }],
  layout: { nodePositions: {} },
}

const beatFrame = (): CueData => ({
  ...defaultCueData,
  currentScene: 'Gameplay',
  trackMode: 'tracked',
  lightingCue: CueType.Verse,
  beat: 'Strong',
})

describe('an interruptible effect raiser raised again mid-flash', () => {
  it('flashes again from the colour showing, not from black and not by carrying on', async () => {
    const h = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const registry = new EffectRegistry()
    registry.registerEffect('flash-red', EffectCompiler.compile(flashRed))
    const cue = new LightingNodeCue(
      'g',
      NodeCueCompiler.compileCue(cueDefinition, 'yarg'),
      registry,
    )
    const red = (): number =>
      Math.min(...h.frontLightIds.map((id) => h.getLightState(id)?.red ?? 0))
    try {
      cue.execute(beatFrame(), h.sequencer, h.lightManager)
      for (let t = 0; t < 700; t += 10) h.advanceBy(10)
      const beforeRaise = red()
      expect(beforeRaise).toBeGreaterThan(50)
      expect(beforeRaise).toBeLessThan(255)

      cue.execute(beatFrame(), h.sequencer, h.lightManager)
      await Promise.resolve()
      const afterRaise: number[] = []
      for (let t = 0; t < 200; t += 10) {
        h.advanceBy(10)
        afterRaise.push(red())
      }

      expect(Math.min(...afterRaise)).toBeGreaterThanOrEqual(beforeRaise)
      expect(Math.max(...afterRaise)).toBe(255)
    } finally {
      cue.onStop()
      h.cleanup()
    }
  })

  it('holds the flash again from the top when raised during its hold', async () => {
    const h = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const registry = new EffectRegistry()
    registry.registerEffect('flash-red', EffectCompiler.compile(flashRed))
    const cue = new LightingNodeCue(
      'g',
      NodeCueCompiler.compileCue(cueDefinition, 'yarg'),
      registry,
    )
    const red = (): number =>
      Math.min(...h.frontLightIds.map((id) => h.getLightState(id)?.red ?? 0))
    try {
      cue.execute(beatFrame(), h.sequencer, h.lightManager)
      for (let t = 0; t < 300; t += 10) h.advanceBy(10)
      expect(red()).toBe(255)

      cue.execute(beatFrame(), h.sequencer, h.lightManager)
      await Promise.resolve()
      const throughHold: number[] = []
      for (let t = 0; t < 400; t += 10) {
        h.advanceBy(10)
        throughHold.push(red())
      }

      expect(Math.min(...throughHold)).toBe(255)
    } finally {
      cue.onStop()
      h.cleanup()
    }
  })
})
