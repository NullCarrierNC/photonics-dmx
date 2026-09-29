/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type {
  ActionNode,
  NodeCueMode,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { createDefaultActionTiming } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { validateSharedActionNodePayload } from '../../../../../../../photonics-dmx/cues/node/compiler/sharedActionNodeValidation'
import ActionNodeEditor from '../ActionNodeEditor'

type Field =
  | 'Target Groups'
  | 'Target Filter'
  | 'Color'
  | 'Brightness'
  | 'Blend Mode'
  | 'Easing'
  | 'Wait For Condition'
  | 'Wait Until Condition'
  | 'Wait For Time (ms)'
  | 'Wait For Count'
  | 'Duration (ms)'
  | 'Wait Until Time (ms)'
  | 'Wait Until Count'
  | 'Layer'

const NUMBER_FIELDS: readonly Field[] = [
  'Wait For Time (ms)',
  'Wait For Count',
  'Duration (ms)',
  'Wait Until Time (ms)',
  'Wait Until Count',
  'Layer',
]

function actionWith(field: Field, value: string | number | undefined): ActionNode {
  const literal = { source: 'literal' as const, value: value ?? '' }
  const optional = value === undefined ? undefined : literal
  const action: ActionNode = {
    id: 'a1',
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: { source: 'literal', value: 'red' },
      brightness: { source: 'literal', value: 'high' },
      blendMode: { source: 'literal', value: 'replace' },
    },
    timing: {
      ...createDefaultActionTiming(),
      waitForCondition: { source: 'literal', value: 'beat' },
      waitUntilCondition: { source: 'literal', value: 'beat' },
    },
  }
  const color = action.color!
  switch (field) {
    case 'Target Groups':
      return { ...action, target: { ...action.target, groups: literal } }
    case 'Target Filter':
      return { ...action, target: { ...action.target, filter: literal } }
    case 'Color':
      return { ...action, color: { ...color, name: literal } }
    case 'Brightness':
      return { ...action, color: { ...color, brightness: literal } }
    case 'Blend Mode':
      return {
        ...action,
        color: { ...color, blendMode: value === undefined ? undefined : literal },
      }
    case 'Easing':
      return {
        ...action,
        timing: { ...action.timing, easing: value === undefined ? undefined : literal },
      }
    case 'Wait For Condition':
      return { ...action, timing: { ...action.timing, waitForCondition: literal } }
    case 'Wait Until Condition':
      return { ...action, timing: { ...action.timing, waitUntilCondition: literal } }
    case 'Wait For Time (ms)':
      return { ...action, timing: { ...action.timing, waitForTime: literal } }
    case 'Wait For Count':
      return { ...action, timing: { ...action.timing, waitForConditionCount: optional } }
    case 'Duration (ms)':
      return { ...action, timing: { ...action.timing, duration: literal } }
    case 'Wait Until Time (ms)':
      return { ...action, timing: { ...action.timing, waitUntilTime: literal } }
    case 'Wait Until Count':
      return { ...action, timing: { ...action.timing, waitUntilConditionCount: optional } }
    case 'Layer':
      return { ...action, layer: optional }
  }
}

function compilerRejects(action: ActionNode): boolean {
  try {
    validateSharedActionNodePayload(action, (message) => new Error(message))
    return false
  } catch {
    return true
  }
}

function editorFlags(action: ActionNode, field: Field, mode: NodeCueMode): boolean {
  renderWithProviders(
    <ActionNodeEditor
      node={action}
      activeMode={mode}
      cueKind="lighting"
      editorMode="cue"
      selectedActionHasEventParent={false}
      availableVariables={[]}
      updateNode={jest.fn()}
    />,
  )
  const control =
    field === 'Target Groups'
      ? screen.getByRole('group', { name: field })
      : NUMBER_FIELDS.includes(field)
        ? screen.getByRole('spinbutton', { name: field })
        : screen.getByRole('combobox', { name: field })
  return control.getAttribute('aria-invalid') === 'true'
}

const CASES: Array<[Field, string | number | undefined, NodeCueMode]> = [
  ['Target Groups', 'front', 'yarg'],
  ['Target Groups', 'front,back,', 'yarg'],
  ['Target Groups', 'front,,back', 'yarg'],
  ['Target Groups', 'frnt', 'yarg'],
  ['Target Groups', 'front, frnt', 'yarg'],
  ['Target Filter', 'all', 'yarg'],
  ['Target Filter', 'every-other', 'yarg'],
  ['Color', 'red', 'yarg'],
  ['Color', 'bleu', 'yarg'],
  ['Brightness', 'high', 'yarg'],
  ['Brightness', 'bright', 'yarg'],
  ['Blend Mode', 'replace', 'yarg'],
  ['Blend Mode', 'multiply', 'yarg'],
  ['Blend Mode', undefined, 'yarg'],
  ['Easing', 'sinInOut', 'yarg'],
  ['Easing', 'sin-out', 'yarg'],
  ['Easing', undefined, 'yarg'],
  ['Wait For Condition', 'beet', 'yarg'],
  ['Wait Until Condition', 'measure', 'yarg'],
  ['Wait Until Condition', 'beet', 'yarg'],
  ['Wait Until Condition', 'beat', 'rb3'],
  ['Wait Until Condition', 'led-3', 'yarg'],
  ['Wait Until Condition', 'measure', 'audio'],
  ['Wait For Time (ms)', 0, 'yarg'],
  ['Wait For Time (ms)', -1, 'yarg'],
  ['Wait For Count', 1, 'yarg'],
  ['Wait For Count', 0, 'yarg'],
  ['Wait For Count', undefined, 'yarg'],
  ['Duration (ms)', 200, 'yarg'],
  ['Duration (ms)', -5, 'yarg'],
  ['Wait Until Time (ms)', 10, 'rb3'],
  ['Wait Until Time (ms)', -1, 'rb3'],
  ['Wait Until Count', 2, 'yarg'],
  ['Wait Until Count', 0, 'yarg'],
  ['Wait Until Count', -1, 'audio'],
  ['Wait Until Count', undefined, 'yarg'],
  ['Layer', 0, 'yarg'],
  ['Layer', 254, 'yarg'],
  ['Layer', 255, 'yarg'],
  ['Layer', 256, 'yarg'],
  ['Layer', -1, 'yarg'],
  ['Layer', undefined, 'yarg'],
]

describe('action fields and the compiler', () => {
  it.each(CASES)(
    '%s %p in %s mode is flagged exactly when the compiler refuses it',
    (field, value, mode) => {
      const action = actionWith(field, value)

      expect(editorFlags(action, field, mode)).toBe(compilerRejects(action))
    },
  )
})
