/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react'
import ActionNode from './ActionNode'
import type { ActionNode as ActionPayload } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

jest.mock('reactflow', () => ({
  Handle: () => <i />,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}))

function swatchOf(colorName: string): string {
  const action: ActionPayload = {
    id: 'a1',
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: { source: 'literal', value: colorName },
      brightness: { source: 'literal', value: 'max' },
    },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 0 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
  }
  const { container } = render(
    <ActionNode
      id="a1"
      type="action"
      data={{ kind: 'action', label: 'Set', payload: action }}
      selected={false}
      zIndex={0}
      isConnectable={false}
      xPos={0}
      yPos={0}
      dragging={false}
    />,
  )
  const layer = container.querySelector<HTMLElement>('.-z-10')
  return layer?.style.backgroundColor ?? ''
}

describe('ActionNode colour swatch', () => {
  it('shows a known colour', () => {
    expect(swatchOf('red')).toBe('rgb(255, 0, 0)')
  })

  it.each(['mauve', 'Red'])('shows %p as the blue it plays as', (colorName) => {
    expect(swatchOf(colorName)).toBe('rgb(0, 0, 255)')
  })
})
