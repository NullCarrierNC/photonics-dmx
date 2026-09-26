/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type {
  EffectDefinition,
  EffectRaiserNode,
  NodeCueMode,
  ValueSource,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { createDefaultActionTiming } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import EffectRaiserEditor from './EffectRaiserEditor'

const variable = (name: string): ValueSource => ({ source: 'variable', name })

const effect: EffectDefinition = {
  id: 'fx',
  name: 'Sweep',
  mode: 'yarg',
  nodes: {
    events: [],
    actions: [
      {
        id: 'a1',
        type: 'action',
        effectType: 'set-color',
        target: { groups: variable('sweepGroups'), filter: { source: 'literal', value: 'all' } },
        color: {
          name: { source: 'literal', value: 'red' },
          brightness: { source: 'literal', value: 'high' },
        },
        timing: { ...createDefaultActionTiming(), waitUntilCondition: variable('holdUntil') },
      },
    ],
    effectListeners: [{ id: 'l1', type: 'effect-listener' }],
  },
  connections: [{ from: 'l1', to: 'a1' }],
  variables: [
    { name: 'sweepGroups', type: 'string', scope: 'cue', initialValue: 'front', isParameter: true },
    { name: 'holdUntil', type: 'string', scope: 'cue', initialValue: 'none', isParameter: true },
  ],
} as EffectDefinition

function renderRaiser(parameterValues: Record<string, ValueSource>, mode: NodeCueMode) {
  const node: EffectRaiserNode = {
    id: 'r1',
    type: 'effect-raiser',
    effectId: 'fx',
    parameterValues,
  }
  renderWithProviders(
    <EffectRaiserEditor
      node={node}
      availableEffects={[{ id: 'fx', name: 'Sweep', definition: effect }]}
      availableVariables={[]}
      updateNode={jest.fn()}
      activeMode={mode}
    />,
  )
}

describe('EffectRaiserEditor parameters', () => {
  it('warns about a group literal the effect feeds into its target groups', () => {
    renderRaiser({ sweepGroups: { source: 'literal', value: 'frnt' } }, 'yarg')

    expect(
      screen.getByRole('textbox', { name: 'sweepGroups (string)' }),
    ).toHaveAccessibleDescription("'frnt' is not a known LocationGroup")
  })

  it('offers the wait conditions of the cue mode for a wait parameter', () => {
    renderRaiser({ holdUntil: { source: 'literal', value: 'led-1' } }, 'rb3')

    const select = screen.getByRole('combobox', { name: 'holdUntil (string)' })
    const offered = Array.from((select as HTMLSelectElement).options).map((o) => o.value)
    expect(offered).toContain('led-1')
    expect(offered).not.toContain('beat')
    expect(select).not.toHaveAccessibleDescription()
  })

  it('warns about a wait condition that never fires in the cue mode', () => {
    renderRaiser({ holdUntil: { source: 'literal', value: 'beat' } }, 'rb3')

    expect(
      screen.getByRole('combobox', { name: 'holdUntil (string)' }),
    ).toHaveAccessibleDescription("'beat' never fires in rb3 mode, so this wait does not end on it")
  })
})
