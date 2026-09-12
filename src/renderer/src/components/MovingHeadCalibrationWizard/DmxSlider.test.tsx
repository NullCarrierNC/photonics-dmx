/** @jest-environment jsdom */
/**
 * The raw DMX slider, which holds whatever it is given inside the range the wire carries.
 */
import { describe, expect, it, jest, afterEach } from '@jest/globals'
import '@testing-library/jest-dom/jest-globals'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DmxSlider } from './DmxSlider'

function renderSlider(value: number) {
  const onChange = jest.fn()
  render(<DmxSlider label="Pan" value={value} onChange={onChange} />)
  return { onChange, input: screen.getByRole('slider') as HTMLInputElement }
}

afterEach(() => cleanup())

describe('DmxSlider', () => {
  it('shows the value it was given', () => {
    expect(renderSlider(128).input.value).toBe('128')
    expect(screen.getByText('128')).toBeInTheDocument()
  })

  // The readout, not the input value: a range input clamps itself, so reading it back would pass
  // whether or not the component clamped anything.
  it('holds a value above the top of the range', () => {
    renderSlider(900)

    expect(screen.getByText('255')).toBeInTheDocument()
    expect(screen.queryByText('900')).toBeNull()
  })

  it('holds a value below the bottom of the range', () => {
    renderSlider(-40)

    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('-40')).toBeNull()
  })

  it('rounds a fractional value, since DMX carries whole steps', () => {
    renderSlider(12.6)

    expect(screen.getByText('13')).toBeInTheDocument()
  })

  it('reports a move as a number', () => {
    const { onChange, input } = renderSlider(10)

    fireEvent.change(input, { target: { value: '200' } })

    expect(onChange).toHaveBeenCalledWith(200)
  })

  it('can be disabled', () => {
    const onChange = jest.fn()
    render(<DmxSlider label="Pan" value={10} onChange={onChange} disabled />)

    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true)
  })
})
