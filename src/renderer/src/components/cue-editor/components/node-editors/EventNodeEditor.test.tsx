/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import EventNodeEditor from './EventNodeEditor'
import type {
  AudioEventNode,
  NetEventNode,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

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

describe('EventNodeEditor execution policy', () => {
  const audioNode = (over: Partial<AudioEventNode> = {}): AudioEventNode => ({
    id: 'ev',
    type: 'event',
    eventType: 'cue-called',
    triggerMode: 'edge',
    ...over,
  })

  function renderAudioEditor(node: AudioEventNode) {
    const updateAudioNode = jest.fn()
    render(
      <EventNodeEditor
        node={node}
        activeMode="audio"
        updateYargNode={jest.fn()}
        updateAudioNode={updateAudioNode}
      />,
    )
    return { updateAudioNode }
  }

  const policySelect = () =>
    screen.queryByRole('combobox', { name: /while running/i }) as HTMLSelectElement | null

  it('shows continuous for a cue-called event with no policy and saves a new one', () => {
    const { updateAudioNode } = renderAudioEditor(audioNode())
    const select = policySelect()!
    expect(select.value).toBe('continuous')
    fireEvent.change(select, { target: { value: 'ignore-while-running' } })
    expect(updateAudioNode).toHaveBeenCalledWith({ executionPolicy: 'ignore-while-running' })
  })

  it('reflects the policy an edge event carries', () => {
    renderAudioEditor(audioNode({ eventType: 'beat', executionPolicy: 'latest-pending' }))
    expect(policySelect()!.value).toBe('latest-pending')
  })

  it('hides the policy for a cue-started event', () => {
    renderAudioEditor(audioNode({ eventType: 'cue-started' }))
    expect(policySelect()).toBeNull()
  })

  it('hides the policy for a level-mode event', () => {
    renderAudioEditor(audioNode({ eventType: 'audio-energy', triggerMode: 'level' }))
    expect(policySelect()).toBeNull()
  })
})

describe('EventNodeEditor cooldown', () => {
  it('writes the cooldown when the author leaves the field, held at or above zero', () => {
    const updateAudioNode = jest.fn()
    render(
      <EventNodeEditor
        node={{ id: 'ev', type: 'event', eventType: 'beat', triggerMode: 'edge' } as AudioEventNode}
        activeMode="audio"
        updateYargNode={jest.fn()}
        updateAudioNode={updateAudioNode}
      />,
    )
    const field = screen.getByLabelText(/Cooldown \(ms\)/)

    fireEvent.change(field, { target: { value: '2' } })
    fireEvent.change(field, { target: { value: '250' } })
    expect(updateAudioNode).not.toHaveBeenCalled()

    fireEvent.blur(field)
    expect(updateAudioNode).toHaveBeenCalledTimes(1)
    expect(updateAudioNode).toHaveBeenCalledWith({ cooldownMs: 250 })
  })
})
