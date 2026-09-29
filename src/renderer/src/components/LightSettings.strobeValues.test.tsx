/** @jest-environment jsdom */
import { describe, expect, it, jest, afterEach } from '@jest/globals'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FixtureTypes, type DmxFixture, type RgbFixture } from '../../../photonics-dmx/types'
import LightSettings from './LightSettings'

afterEach(() => cleanup())

function strobeTemplate(overrides: Partial<RgbFixture> = {}): RgbFixture {
  return {
    id: 't',
    position: 0,
    fixture: FixtureTypes.RGB,
    label: 'L',
    name: 'L',
    isStrobeEnabled: true,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 5 },
    ...overrides,
  }
}

/** Renders with state wired up, so a change and its follow-up render both apply. */
function renderEditor(initial: DmxFixture) {
  let current = initial
  const setter = jest.fn((next: DmxFixture | null) => {
    if (next === null) return
    current = next
    rerender(<LightSettings currentLight={current} setCurrentLight={setter} />)
  })
  const { rerender } = render(<LightSettings currentLight={current} setCurrentLight={setter} />)
  return { latest: () => current, setter }
}

const slowBox = (): HTMLInputElement => screen.getByLabelText('Strobe Slow:') as HTMLInputElement

describe('LightSettings strobe speed values', () => {
  it('stores nothing while a speed box is emptied, and shows the stored value when left empty', () => {
    const { setter } = renderEditor(strobeTemplate())

    fireEvent.change(slowBox(), { target: { value: '' } })
    expect(setter).not.toHaveBeenCalled()
    fireEvent.blur(slowBox())

    expect(setter).not.toHaveBeenCalled()
    expect(slowBox().value).toBe('64')
  })

  it('stores a typed speed once the box is left', () => {
    const { latest } = renderEditor(strobeTemplate())

    fireEvent.change(slowBox(), { target: { value: '90' } })
    fireEvent.blur(slowBox())

    expect(latest().strobeValues?.slow).toBe(90)
  })
})
