/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type { ActionNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { createDefaultActionTiming } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ActionTimingSection from './ActionTimingSection'

function renderTiming(waitUntil: string) {
  const timing = {
    ...createDefaultActionTiming(),
    waitUntilCondition: { source: 'literal' as const, value: waitUntil },
  }
  const node: ActionNode = {
    id: 'a1',
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    timing,
  }
  renderWithProviders(
    <ActionTimingSection
      node={node}
      currentTiming={timing}
      updateTiming={jest.fn()}
      activeMode="yarg"
      selectedActionHasEventParent={false}
      availableVariables={[]}
    />,
  )
}

describe('ActionTimingSection wait conditions', () => {
  it('shows and flags a stored condition the mode does not offer', () => {
    renderTiming('beet')

    expect(screen.getByDisplayValue('beet')).toBeTruthy()
    expect(screen.getByText("'beet' is not a known wait condition")).toBeTruthy()
  })

  it('does not flag a condition the mode offers', () => {
    renderTiming('beat')

    expect(screen.queryByText(/is not a known wait condition/)).toBeNull()
  })
})
