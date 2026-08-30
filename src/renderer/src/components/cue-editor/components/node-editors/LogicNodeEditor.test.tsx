/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import LogicNodeEditor from './LogicNodeEditor'
import { LOGIC_NODE_FACTORIES } from '../../hooks/useNodeCreation'
import { NODE_LOGIC_TYPES } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

describe('LogicNodeEditor dispatch', () => {
  // Every logic type must have a matching sub-editor. A missing case falls through to the
  // "Unknown logic node type" placeholder, so render the factory default of each type and assert it never
  // appears (this also proves no editor crashes on its default node).
  it.each(NODE_LOGIC_TYPES)('renders a real editor for the %s node', (logicType) => {
    const node = LOGIC_NODE_FACTORIES[logicType]('n1')
    render(
      <LogicNodeEditor
        node={node}
        activeMode="yarg"
        availableVariables={[]}
        updateNode={jest.fn()}
      />,
    )
    expect(screen.queryByText('Unknown logic node type')).toBeNull()
  })
})
