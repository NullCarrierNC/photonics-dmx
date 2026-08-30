/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react'
import LogicNode from './LogicNode'
import { NODE_WIDTH_STYLES } from './FlowNodeFrame'
import type { LogicNode as LogicNodeDefinition } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

// Only the node's own markup is under test, and the real library needs a ReactFlowProvider.
jest.mock('reactflow', () => ({
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}))

// A popcount over an 8-bit LED bank mask: the kind of formula an RB3 library emits.
const LONG_EXPRESSION =
  'floor(mRed / 1) % 2 + floor(mRed / 2) % 2 + floor(mRed / 4) % 2 + floor(mRed / 8) % 2 + ' +
  'floor(mRed / 16) % 2 + floor(mRed / 32) % 2 + floor(mRed / 64) % 2 + floor(mRed / 128) % 2'

function renderExpressionNode() {
  const payload: LogicNodeDefinition = {
    id: 'n1',
    type: 'logic',
    logicType: 'expression',
    expression: LONG_EXPRESSION,
    assignTo: 'countRed',
  }
  return render(
    <LogicNode
      id="n1"
      type="logic"
      data={{ kind: 'logic', label: 'expression', payload }}
      selected={false}
      zIndex={0}
      isConnectable={false}
      xPos={0}
      yPos={0}
      dragging={false}
    />,
  )
}

describe('flow node width', () => {
  it('caps the node width and wraps instead of truncating a long expression', () => {
    const { container } = renderExpressionNode()

    const node = Array.from(container.querySelectorAll('div')).find((el) =>
      el.className.includes('max-w-['),
    )
    expect(node).toBeDefined()
    // Wrapping, not clipping: the whole formula stays readable.
    expect(node!.className).toContain('break-words')
    expect(node!.className).not.toContain('truncate')
    expect(node!.textContent).toContain(LONG_EXPRESSION)
  })

  it('exports the cap as one shared constant so every node type stays consistent', () => {
    expect(NODE_WIDTH_STYLES).toContain('max-w-[')
    expect(NODE_WIDTH_STYLES).toContain('break-words')
  })
})
