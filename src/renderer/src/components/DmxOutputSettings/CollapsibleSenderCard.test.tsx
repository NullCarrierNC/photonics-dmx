/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import CollapsibleSenderCard from './CollapsibleSenderCard'

function renderCard() {
  const onToggle = jest.fn()
  render(
    <CollapsibleSenderCard title="sACN" expanded={false} onToggle={onToggle}>
      <p>Universe settings</p>
    </CollapsibleSenderCard>,
  )
  return { onToggle, header: screen.getByRole('button', { name: 'sACN' }) }
}

describe('CollapsibleSenderCard', () => {
  it.each([
    { label: 'Enter', key: 'Enter' },
    { label: 'Space', key: ' ' },
  ])('toggles on $label', ({ key }) => {
    const { onToggle, header } = renderCard()
    fireEvent.keyDown(header, { key })
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('ignores other keys', () => {
    const { onToggle, header } = renderCard()
    fireEvent.keyDown(header, { key: 'a' })
    expect(onToggle).not.toHaveBeenCalled()
  })
})
