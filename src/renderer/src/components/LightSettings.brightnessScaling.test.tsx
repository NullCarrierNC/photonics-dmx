/** @jest-environment jsdom */
/**
 * Brightness scaling in the template editor: fields behind the toggle, a trimmed fixture reveals
 * them anyway, unchecking clears rather than hides, and a typed 100 is stored as absence.
 */
import { describe, expect, it, jest, afterEach } from '@jest/globals'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FixtureTypes, type DmxFixture, type ExtraChannel } from '../../../photonics-dmx/types'
import LightSettings from './LightSettings'

afterEach(() => cleanup())

function fixture(overrides: Partial<DmxFixture> = {}): DmxFixture {
  return {
    id: 't',
    position: 0,
    fixture: FixtureTypes.RGB,
    label: 'L',
    name: 'L',
    isStrobeEnabled: false,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as unknown as DmxFixture['channels'],
    ...overrides,
  }
}

function toggle(): HTMLInputElement {
  return screen.getByLabelText('Use Brightness Scaling') as HTMLInputElement
}

function scaleInput(channel: 'Red' | 'Green' | 'Blue'): HTMLInputElement {
  return screen.getByLabelText(`${channel}:`) as HTMLInputElement
}

/** Renders with state wired up, so a change and its follow-up render both apply. */
function renderEditor(initial: DmxFixture): { latest: () => DmxFixture; setter: jest.Mock } {
  let current = initial
  const setter = jest.fn((next: DmxFixture | null) => {
    if (next === null) return
    current = next
    rerender(<LightSettings currentLight={current} setCurrentLight={setter} />)
  })
  const { rerender } = render(<LightSettings currentLight={current} setCurrentLight={setter} />)
  return { latest: () => current, setter: setter as unknown as jest.Mock }
}

describe('LightSettings brightness scaling', () => {
  it('hides the fields until the toggle is checked', () => {
    renderEditor(fixture())
    expect(toggle().checked).toBe(false)
    expect(screen.queryByLabelText('Red:')).toBeNull()

    fireEvent.click(toggle())
    expect(scaleInput('Red').value).toBe('100')
    expect(scaleInput('Green').value).toBe('100')
    expect(scaleInput('Blue').value).toBe('100')
  })

  it('revealing the fields alone does not change the fixture', () => {
    const { setter } = renderEditor(fixture())
    fireEvent.click(toggle())
    expect(setter).not.toHaveBeenCalled()
  })

  it('shows the fields already checked for a fixture that carries a trim', () => {
    renderEditor(fixture({ brightnessScaling: { green: 80 } }))
    expect(toggle().checked).toBe(true)
    expect(scaleInput('Green').value).toBe('80')
  })

  it('stores a typed percent and drops it again at 100', () => {
    const { latest } = renderEditor(fixture())
    fireEvent.click(toggle())

    fireEvent.change(scaleInput('Green'), { target: { value: '80' } })
    expect(latest().brightnessScaling).toEqual({ green: 80 })

    fireEvent.change(scaleInput('Green'), { target: { value: '100' } })
    expect('brightnessScaling' in latest()).toBe(false)
  })

  it('clamps a percent above 100 and below 0', () => {
    const { latest } = renderEditor(fixture())
    fireEvent.click(toggle())

    fireEvent.change(scaleInput('Red'), { target: { value: '250' } })
    expect('brightnessScaling' in latest()).toBe(false) // clamped to 100, which is never stored

    fireEvent.change(scaleInput('Red'), { target: { value: '-40' } })
    expect(latest().brightnessScaling).toEqual({ red: 0 })
  })

  it('offers a row per colour extra and none for a fixed channel', () => {
    const extras: ExtraChannel[] = [
      { type: 'amber', channel: 5 },
      { type: 'fixed', channel: 6, value: 200 },
    ]
    const { latest } = renderEditor(fixture({ extraChannels: extras }))
    fireEvent.click(toggle())

    expect(screen.queryByLabelText('Fixed value:')).toBeNull()
    fireEvent.change(screen.getByLabelText('Amber:'), { target: { value: '60' } })
    expect(latest().extraChannels).toEqual([
      { type: 'amber', channel: 5, scale: 60 },
      { type: 'fixed', channel: 6, value: 200 },
    ])
  })

  it('keeps an extra channel scale when its colour type changes', () => {
    const { latest } = renderEditor(
      fixture({ extraChannels: [{ type: 'amber', channel: 5, scale: 60 }] }),
    )
    fireEvent.change(screen.getByLabelText('Amber type'), { target: { value: 'orange' } })
    expect(latest().extraChannels).toEqual([{ type: 'orange', channel: 5, scale: 60 }])
  })

  it('drops an extra channel scale when its type becomes fixed', () => {
    const { latest } = renderEditor(
      fixture({ extraChannels: [{ type: 'amber', channel: 5, scale: 60 }] }),
    )
    fireEvent.change(screen.getByLabelText('Amber type'), { target: { value: 'fixed' } })
    expect(latest().extraChannels).toEqual([{ type: 'fixed', channel: 5, value: 0 }])
  })

  it('unchecking clears the trim from base channels and extras', () => {
    const { latest } = renderEditor(
      fixture({
        brightnessScaling: { green: 80 },
        extraChannels: [{ type: 'amber', channel: 5, scale: 60 }],
      }),
    )
    expect(toggle().checked).toBe(true)

    fireEvent.click(toggle())
    expect('brightnessScaling' in latest()).toBe(false)
    expect(latest().extraChannels).toEqual([{ type: 'amber', channel: 5 }])
    expect(screen.queryByLabelText('Green:')).toBeNull()
  })

  it('offers no scaling at all for a colour-less strobe fixture', () => {
    renderEditor(
      fixture({
        fixture: FixtureTypes.STROBE,
        channels: { masterDimmer: 1, strobeChannel: 2 } as unknown as DmxFixture['channels'],
      }),
    )
    expect(screen.queryByLabelText('Use Brightness Scaling')).toBeNull()
  })

  it('drops the trim when the fixture is switched to a strobe', () => {
    const { latest } = renderEditor(fixture({ brightnessScaling: { green: 80 } }))
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: FixtureTypes.STROBE },
    })
    expect('brightnessScaling' in latest()).toBe(false)
  })
})
