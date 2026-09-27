import fs from 'fs'
import path from 'path'
import { describe, expect, it } from '@jest/globals'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import { EffectExecutionEngine } from '../../../../cues/node/runtime/EffectExecutionEngine'
import { UnknownValueWarnings } from '../../../../cues/node/runtime/valueResolver'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import { defaultCueData } from '../../../../cues/types/cueTypes'
import type { EffectFile } from '../../../../cues/types/nodeCueTypes'
import type { DmxLightManager } from '../../../../controllers/DmxLightManager'
import type { Effect } from '../../../../types'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'
import { fakeLightingController } from '../../../helpers/fakeLightingController'
import { createMockTrackedLight } from '../../../helpers/testFixtures'

const EFFECTS = path.join(__dirname, '../../../../../../resources/defaults/node-data/effects')

const ROTATIONS: Array<[string, string]> = [
  ['yarg/yarg-core-effects.json', 'effect-rotation-cw'],
  ['yarg/yarg-core-effects.json', 'effect-rotation-ccw'],
  ['yarg/yarg-fade-effects.json', 'effect-rotation-fade-cw'],
  ['yarg/yarg-fade-effects.json', 'effect-rotation-fade-ccw'],
  ['audio/audio-stagekit-effects.json', 'effect-audio-rotation-cw'],
  ['audio/audio-stagekit-effects.json', 'effect-audio-rotation-ccw'],
]

describe('a rotation over five lights in groups of two', () => {
  it.each(ROTATIONS)('%s %s waits whole counts of beats', (file, effectId) => {
    const effects: EffectFile = JSON.parse(fs.readFileSync(path.join(EFFECTS, file), 'utf8'))
    const definition = effects.effects.find((effect) => effect.id === effectId)
    if (!definition) throw new Error(`${file} has no ${effectId}`)
    const submitted: Effect[] = []
    const record = (_name: string, effect: Effect): boolean => {
      submitted.push(effect)
      return true
    }
    const sequencer = fakeLightingController({
      addEffect: record,
      addEffectUnblockedName: record,
      addEffectUnblockedNameWithCallback: record,
      setEffectUnblockedName: record,
      setEffectUnblockedNameWithCallback: record,
    })
    const lights = [1, 2, 3, 4, 5].map((position) =>
      createMockTrackedLight({ id: `front-${position}`, position }),
    )
    const parameters: Record<string, VariableValue> = {
      lights: { type: 'light-array', value: lights },
      groupSize: { type: 'number', value: 2 },
      beatsPerCycle: { type: 'number', value: 1 },
    }
    const engine = new EffectExecutionEngine(
      EffectCompiler.compile(definition),
      sequencer,
      {} as DmxLightManager,
      noopRuntimeBroadcaster(),
      parameters,
      defaultCueData,
      {
        callerMode: effects.mode === 'audio' ? 'audio' : 'yarg',
        unknownValues: new UnknownValueWarnings('t'),
      },
    )

    engine.triggerEffect(defaultCueData)

    const counts = submitted.flatMap((effect) =>
      effect.transitions
        .map((transition) => transition.waitUntilConditionCount)
        .filter((count): count is number => count !== undefined),
    )
    expect(counts.length).toBeGreaterThan(0)
    expect(counts.filter((count) => !Number.isInteger(count))).toEqual([])
    engine.cancelAll()
  })
})
