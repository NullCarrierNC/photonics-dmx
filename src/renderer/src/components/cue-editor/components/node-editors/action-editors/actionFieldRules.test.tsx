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
import ActionTargetSection from './ActionTargetSection'
import ActionColorFields from './ActionColorFields'
import ActionTimingSection from './ActionTimingSection'

type Field =
  | 'Target Groups'
  | 'Target Filter'
  | 'Color'
  | 'Brightness'
  | 'Blend Mode'
  | 'Easing'
  | 'Wait For Condition'
  | 'Wait Until Condition'

function actionWith(field: Field, value: string | undefined): ActionNode {
  const literal = { source: 'literal' as const, value: value ?? '' }
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
    <>
      <ActionTargetSection node={action} availableVariables={[]} updateNode={jest.fn()} />
      <ActionColorFields node={action} availableVariables={[]} updateNode={jest.fn()} />
      <ActionTimingSection
        node={action}
        currentTiming={action.timing}
        updateTiming={jest.fn()}
        activeMode={mode}
        selectedActionHasEventParent={false}
        availableVariables={[]}
      />
    </>,
  )
  const control =
    field === 'Target Groups'
      ? screen.getByRole('group', { name: field })
      : screen.getByRole('combobox', { name: field })
  return control.getAttribute('aria-invalid') === 'true'
}

const CASES: Array<[Field, string | undefined, NodeCueMode]> = [
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
