/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { screen } from '@testing-library/react'
import Ajv from 'ajv'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type {
  EffectDefinition,
  EffectRaiserNode,
  NodeCueMode,
  ValueSource,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { createDefaultActionTiming } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { effectRaiserNodeSchema } from '../../../../../../photonics-dmx/cues/node/schema/nodes'
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
        timing: {
          ...createDefaultActionTiming(),
          duration: variable('fadeMs'),
          waitUntilCondition: variable('holdUntil'),
        },
      },
    ],
    effectListeners: [{ id: 'l1', type: 'effect-listener' }],
  },
  connections: [{ from: 'l1', to: 'a1' }],
  variables: [
    { name: 'sweepGroups', type: 'string', scope: 'cue', initialValue: 'front', isParameter: true },
    { name: 'holdUntil', type: 'string', scope: 'cue', initialValue: 'none', isParameter: true },
    { name: 'fadeMs', type: 'number', scope: 'cue', initialValue: 200, isParameter: true },
  ],
} as EffectDefinition

function raiser(effectId: string, parameterValues: Record<string, ValueSource> = {}) {
  const node: EffectRaiserNode = { id: 'r1', type: 'effect-raiser', effectId, parameterValues }
  return node
}

function renderRaiser(
  parameterValues: Record<string, ValueSource>,
  mode: NodeCueMode,
  effectId = 'fx',
) {
  const node = raiser(effectId, parameterValues)
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

describe('EffectRaiserEditor effect', () => {
  it.each(['', 'fx', 'retired-fx'])(
    'flags the effect %p exactly when the schema refuses it',
    (effectId) => {
      const schemaAccepts = new Ajv().compile(effectRaiserNodeSchema)
      renderRaiser({}, 'yarg', effectId)

      const select = screen.getByRole('combobox', { name: 'Select Effect' })
      expect(select.getAttribute('aria-invalid') === 'true').toBe(!schemaAccepts(raiser(effectId)))
    },
  )
})

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

  it('warns about a number the effect feeds into a field that refuses it', () => {
    renderRaiser({ fadeMs: { source: 'literal', value: -5 } }, 'yarg')

    expect(screen.getByRole('spinbutton', { name: 'fadeMs (number)' })).toHaveAccessibleDescription(
      'must be a non-negative finite number',
    )
  })

  it('accepts a number the effect field takes', () => {
    renderRaiser({ fadeMs: { source: 'literal', value: 250 } }, 'yarg')

    expect(
      screen.getByRole('spinbutton', { name: 'fadeMs (number)' }),
    ).not.toHaveAccessibleDescription()
  })
})
