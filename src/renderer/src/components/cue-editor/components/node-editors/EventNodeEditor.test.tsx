/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import EventNodeEditor from './EventNodeEditor'
import type { NetEventNode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

const ledNode = (over: Partial<NetEventNode> = {}): NetEventNode => ({
  id: 'ev',
  type: 'event',
  eventType: 'led-1',
  ...over,
})

function renderEditor(node: NetEventNode) {
  const updateYargNode = jest.fn()
  render(
    <EventNodeEditor
      node={node}
      activeMode="rb3"
      updateYargNode={updateYargNode}
      updateAudioNode={jest.fn()}
    />,
  )
  return { updateYargNode }
}

const colorChangeBox = () =>
  screen.queryByRole('checkbox', { name: /trigger on colour change/i }) as HTMLInputElement | null

describe('EventNodeEditor triggerOnColorChange checkbox', () => {
  it('shows the checkbox for a led-N event and toggles it via updateYargNode', () => {
    const { updateYargNode } = renderEditor(ledNode())
    const box = colorChangeBox()!
    expect(box).not.toBeNull()
    expect(box.checked).toBe(false)
    fireEvent.click(box)
    expect(updateYargNode).toHaveBeenCalledWith({ triggerOnColorChange: true })
  })

  it('reflects an existing triggerOnColorChange value', () => {
    renderEditor(ledNode({ triggerOnColorChange: true }))
    expect(colorChangeBox()!.checked).toBe(true)
  })

  it('hides the checkbox for a non-led event', () => {
    renderEditor(ledNode({ eventType: 'beat' }))
    expect(colorChangeBox()).toBeNull()
  })
})
