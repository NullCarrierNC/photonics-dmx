/** @jest-environment jsdom */
/**
 * The shared draft fields: what reaches the caller, and when.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { DraftNumberField, DraftTextField } from './DraftField'

function field(): HTMLInputElement {
  return screen.getByRole('spinbutton') as HTMLInputElement
}

describe('DraftNumberField', () => {
  it('reports on blur, not per keystroke', () => {
    const onCommit = jest.fn()
    renderWithProviders(<DraftNumberField value={5} onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '42' } })
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.blur(field())
    expect(onCommit).toHaveBeenCalledWith(42)
  })

  it('holds the value inside its range', () => {
    const onCommit = jest.fn()
    renderWithProviders(<DraftNumberField value={5} min={1} max={10} onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '99' } })
    fireEvent.blur(field())

    expect(onCommit).toHaveBeenCalledWith(10)
  })

  it('puts the committed value back when the field is cleared', () => {
    const onCommit = jest.fn()
    renderWithProviders(<DraftNumberField value={5} onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '' } })
    fireEvent.blur(field())

    expect(onCommit).not.toHaveBeenCalled()
    expect(field()).toHaveValue(5)
  })

  it('rounds to whole numbers by default', () => {
    const onCommit = jest.fn()
    renderWithProviders(<DraftNumberField value={5} onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '7.6' } })
    fireEvent.blur(field())

    expect(onCommit).toHaveBeenCalledWith(8)
  })

  it('keeps the decimal places a field asks for', () => {
    const onCommit = jest.fn()
    renderWithProviders(<DraftNumberField value={1} decimals={2} onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '0.256' } })
    fireEvent.blur(field())

    expect(onCommit).toHaveBeenCalledWith(0.26)
  })

  it('says nothing when the value comes back the same', () => {
    const onCommit = jest.fn()
    renderWithProviders(<DraftNumberField value={5} onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '5' } })
    fireEvent.blur(field())

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('reports an unchanged value where the field asks it to', () => {
    const onCommit = jest.fn()
    renderWithProviders(<DraftNumberField value={5} commitWhenUnchanged onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '5' } })
    fireEvent.blur(field())

    expect(onCommit).toHaveBeenCalledWith(5)
  })

  it('reports on Enter', () => {
    const onCommit = jest.fn()
    renderWithProviders(<DraftNumberField value={5} onCommit={onCommit} />)

    field().focus()
    fireEvent.change(field(), { target: { value: '9' } })
    fireEvent.keyDown(field(), { key: 'Enter' })

    expect(onCommit).toHaveBeenCalledWith(9)
  })
})

describe('DraftTextField', () => {
  it('reports on blur, not per keystroke', () => {
    const onCommit = jest.fn()
    renderWithProviders(<DraftTextField value="one" onCommit={onCommit} />)
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: '10.0.0.1' } })
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('10.0.0.1')
  })
})
