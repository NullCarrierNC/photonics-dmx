/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type { ActionNode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import {
  buildDefaultMotionPatternAction,
  buildDefaultSetPositionAction,
} from '../../lib/cueDefaults'
import ActionNodeEditor from './ActionNodeEditor'
import EventListenerEditor from './EventListenerEditor'

function renderAction(node: ActionNode) {
  renderWithProviders(
    <ActionNodeEditor
      node={node}
      activeMode="yarg"
      cueKind="motion"
      editorMode="cue"
      selectedActionHasEventParent={false}
      availableVariables={[]}
      updateNode={jest.fn()}
    />,
  )
}

function motionWith(field: string, value: string | number): ActionNode {
  const node = buildDefaultMotionPatternAction()
  return {
    ...node,
    motionPattern: { ...node.motionPattern!, [field]: { source: 'literal', value } },
  }
}

describe('ActionNodeEditor stored values off the list', () => {
  it('shows and flags a pattern preset it does not know', () => {
    renderAction(motionWith('pattern', 'zigzag'))

    const select = screen.getByRole('combobox', { name: 'Pattern preset' })
    expect(select).toHaveDisplayValue('zigzag')
    expect(select).toHaveAccessibleDescription("'zigzag' is not one of this field's choices")
  })

  it('shows and flags a waveform it does not know', () => {
    renderAction({
      ...motionWith('pattern', 'custom'),
      motionPattern: {
        ...motionWith('pattern', 'custom').motionPattern!,
        panWaveform: { source: 'literal', value: 'noise' },
      },
    })

    expect(screen.getByRole('combobox', { name: 'Pan waveform' })).toHaveDisplayValue('noise')
  })

  it('shows a bearing word it does not know, flagged', () => {
    const node = buildDefaultSetPositionAction()
    renderAction({
      ...node,
      position: {
        mode: 'direction',
        bearing: { source: 'literal', value: 'sideways' },
        angle: { source: 'literal', value: 20 },
      },
    })

    const select = screen.getByRole('combobox', { name: 'Bearing' })
    expect(select).toHaveDisplayValue('sideways')
    expect(select).toHaveAccessibleDescription(
      "'sideways' is not a stage direction or a number of degrees",
    )
  })

  it('shows a bearing in degrees between the listed directions as its degrees', () => {
    const node = buildDefaultSetPositionAction()
    renderAction({
      ...node,
      position: {
        mode: 'direction',
        bearing: { source: 'literal', value: 30 },
        angle: { source: 'literal', value: 20 },
      },
    })

    const select = screen.getByRole('combobox', { name: 'Bearing' })
    expect(select).toHaveDisplayValue('30')
    expect(select).not.toHaveAccessibleDescription()
  })
})

describe('EventListenerEditor', () => {
  it('shows and flags an event name the cue does not declare', () => {
    renderWithProviders(
      <EventListenerEditor
        node={{ id: 'l1', type: 'event-listener', eventName: 'dropped' }}
        availableEvents={['kick']}
        updateNode={jest.fn()}
      />,
    )

    const select = screen.getByRole('combobox', { name: 'Event Name' })
    expect(select).toHaveDisplayValue('dropped')
    expect(select).toHaveAccessibleDescription("'dropped' is not one of this field's choices")
  })
})
