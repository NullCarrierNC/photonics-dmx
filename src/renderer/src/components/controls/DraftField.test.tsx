/** @jest-environment jsdom */
/**
 * The shared draft fields: what reaches the caller, and when.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { DraftNumberField, DraftTextField } from './DraftField'

function field(): HTMLInputElement {
  return screen.getByRole('spinbutton') as HTMLInputElement
}

describe('DraftNumberField', () => {
  it('reports on blur, not per keystroke', () => {
    const onCommit = jest.fn<(value: number) => void>()
    renderWithProviders(<DraftNumberField value={5} onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '42' } })
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.blur(field())
    expect(onCommit).toHaveBeenCalledWith(42)
  })

  it('holds the value inside its range', () => {
    const onCommit = jest.fn<(value: number) => void>()
    renderWithProviders(<DraftNumberField value={5} min={1} max={10} onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '99' } })
    fireEvent.blur(field())

    expect(onCommit).toHaveBeenCalledWith(10)
  })

  it('puts the committed value back when the field is cleared', () => {
    const onCommit = jest.fn<(value: number) => void>()
    renderWithProviders(<DraftNumberField value={5} onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '' } })
    fireEvent.blur(field())

    expect(onCommit).not.toHaveBeenCalled()
    expect(field()).toHaveValue(5)
  })

  it('rounds to whole numbers by default', () => {
    const onCommit = jest.fn<(value: number) => void>()
    renderWithProviders(<DraftNumberField value={5} onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '7.6' } })
    fireEvent.blur(field())

    expect(onCommit).toHaveBeenCalledWith(8)
  })

  it('keeps the decimal places a field asks for', () => {
    const onCommit = jest.fn<(value: number) => void>()
    renderWithProviders(<DraftNumberField value={1} decimals={2} onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '0.256' } })
    fireEvent.blur(field())

    expect(onCommit).toHaveBeenCalledWith(0.26)
  })

  it('says nothing when the value comes back the same', () => {
    const onCommit = jest.fn<(value: number) => void>()
    renderWithProviders(<DraftNumberField value={5} onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '5' } })
    fireEvent.blur(field())

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('reports an unchanged value where the field asks it to', () => {
    const onCommit = jest.fn<(value: number) => void>()
    renderWithProviders(<DraftNumberField value={5} commitWhenUnchanged onCommit={onCommit} />)

    fireEvent.change(field(), { target: { value: '5' } })
    fireEvent.blur(field())

    expect(onCommit).toHaveBeenCalledWith(5)
  })

  it('reports on Enter', () => {
    const onCommit = jest.fn<(value: number) => void>()
    renderWithProviders(<DraftNumberField value={5} onCommit={onCommit} />)

    field().focus()
    fireEvent.change(field(), { target: { value: '9' } })
    fireEvent.keyDown(field(), { key: 'Enter' })

    expect(onCommit).toHaveBeenCalledWith(9)
  })
})

describe('DraftNumberField refused commits', () => {
  it('puts the committed value back when the commit is refused', () => {
    renderWithProviders(<DraftNumberField value={5} onCommit={() => false} />)

    fireEvent.change(field(), { target: { value: '42' } })
    fireEvent.blur(field())

    expect(field()).toHaveValue(5)
  })

  it('puts the committed value back when a pending commit is refused', async () => {
    let answer!: (accepted: boolean) => void
    const pending = new Promise<boolean>((resolve) => {
      answer = resolve
    })
    renderWithProviders(<DraftNumberField value={5} onCommit={() => pending} />)

    fireEvent.change(field(), { target: { value: '42' } })
    fireEvent.blur(field())
    expect(field()).toHaveValue(42)
    await act(async () => answer(false))

    expect(field()).toHaveValue(5)
  })

  it('keeps the number when the commit is accepted', async () => {
    renderWithProviders(<DraftNumberField value={5} onCommit={() => Promise.resolve(true)} />)

    fireEvent.change(field(), { target: { value: '42' } })
    fireEvent.blur(field())
    await act(async () => {})

    expect(field()).toHaveValue(42)
  })

  it('leaves a newer entry alone when a refusal lands late', async () => {
    let answer!: (accepted: boolean) => void
    const pending = new Promise<boolean>((resolve) => {
      answer = resolve
    })
    renderWithProviders(<DraftNumberField value={5} onCommit={() => pending} />)

    fireEvent.change(field(), { target: { value: '42' } })
    fireEvent.blur(field())
    fireEvent.focus(field())
    fireEvent.change(field(), { target: { value: '7' } })
    await act(async () => answer(false))

    expect(field()).toHaveValue(7)
  })
})

describe('DraftTextField', () => {
  it('puts the committed value back when the commit is refused', async () => {
    renderWithProviders(<DraftTextField value="one" onCommit={() => Promise.resolve(false)} />)
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: 'two' } })
    fireEvent.blur(input)
    await act(async () => {})

    expect(input).toHaveValue('one')
  })

  it('reports on blur, not per keystroke', () => {
    const onCommit = jest.fn<(value: string) => void>()
    renderWithProviders(<DraftTextField value="one" onCommit={onCommit} />)
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: '10.0.0.1' } })
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('10.0.0.1')
  })
})

describe('a draft field focused while its value changes elsewhere', () => {
  it('shows the new text and writes nothing back when left untyped', () => {
    const onCommit = jest.fn<(value: string) => void>()
    const view = renderWithProviders(<DraftTextField value="old" onCommit={onCommit} />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.focus(input)
    view.rerender(<DraftTextField value="new" onCommit={onCommit} />)
    fireEvent.blur(input)

    expect(input.value).toBe('new')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('shows the new number and writes nothing back when left untyped', () => {
    const onCommit = jest.fn<(value: number) => void>()
    const view = renderWithProviders(<DraftNumberField value={5} onCommit={onCommit} />)

    fireEvent.focus(field())
    view.rerender(<DraftNumberField value={8} onCommit={onCommit} />)
    fireEvent.blur(field())

    expect(field().value).toBe('8')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('keeps what the user typed over the change', () => {
    const onCommit = jest.fn<(value: string) => void>()
    const view = renderWithProviders(<DraftTextField value="old" onCommit={onCommit} />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'typed' } })
    view.rerender(<DraftTextField value="new" onCommit={onCommit} />)
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledWith('typed')
  })
})
