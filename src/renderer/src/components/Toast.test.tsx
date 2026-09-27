/** @jest-environment jsdom */
import * as React from 'react'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { useToast } from '../hooks/useToast'
import ToastContainer, { ToastStack } from './Toast'
import Modal from './Modal'

describe('ToastContainer', () => {
  it('announces toasts through a live region that is there before they arrive', () => {
    const { container, rerender } = render(<ToastContainer toasts={[]} onDismiss={jest.fn()} />)
    const region = container.querySelector('[aria-live="polite"]')
    expect(region).not.toBeNull()

    rerender(
      <ToastContainer
        toasts={[{ id: 't1', type: 'error', message: 'Save failed' }]}
        onDismiss={jest.fn()}
      />,
    )
    expect(region?.contains(screen.getByText('Save failed'))).toBe(true)
  })

  it('dismisses a toast by its id', () => {
    const onDismiss = jest.fn()
    render(
      <ToastContainer
        toasts={[{ id: 't1', type: 'info', message: 'Saved' }]}
        onDismiss={onDismiss}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledWith('t1')
  })
})

describe('ToastStack', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  /** A caller that toasts once on mount, as a page does on a failed save. */
  const Toaster = ({ message, duration }: { message: string; duration: number }) => {
    const { showToast } = useToast()
    const [shown, setShown] = React.useState(false)
    React.useEffect(() => {
      if (shown) return
      setShown(true)
      showToast(message, 'error', duration)
    }, [shown, showToast, message, duration])
    return null
  }

  it('shows toasts from every caller in one live region', () => {
    const { container } = renderWithProviders(
      <>
        <Toaster message="App failed" duration={0} />
        <Toaster message="Page failed" duration={0} />
        <ToastStack />
      </>,
    )

    const regions = container.querySelectorAll('[aria-live="polite"]')
    expect(regions).toHaveLength(1)
    expect(regions[0].contains(screen.getByText('App failed'))).toBe(true)
    expect(regions[0].contains(screen.getByText('Page failed'))).toBe(true)
  })

  it('shows toasts inside an open dialog, and on the page once it closes', async () => {
    const Page = ({ dialogOpen }: { dialogOpen: boolean }) => (
      <>
        {dialogOpen && (
          <Modal onClose={jest.fn()} labelledBy="t" panelClassName="">
            <h2 id="t">Delete rig</h2>
          </Modal>
        )}
        <Toaster message="Could not delete" duration={0} />
        <ToastStack />
      </>
    )
    const { rerender } = renderWithProviders(<Page dialogOpen />)

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Delete rig' })).toContainElement(
        screen.getByText('Could not delete'),
      ),
    )

    rerender(<Page dialogOpen={false} />)

    await waitFor(() => expect(screen.getByText('Could not delete')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('leaves focus in the dialog when its Dismiss button is used', async () => {
    renderWithProviders(
      <>
        <Modal onClose={jest.fn()} labelledBy="t" panelClassName="">
          <h2 id="t">Delete rig</h2>
        </Modal>
        <Toaster message="Could not delete" duration={0} />
        <ToastStack />
      </>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Delete rig' })
    const dismiss = await waitFor(() => within(dialog).getByRole('button', { name: 'Dismiss' }))

    dismiss.focus()
    fireEvent.click(dismiss)
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByText('Could not delete')).toBeNull()
    expect(dialog).toHaveFocus()
  })

  it('keeps the newest few toasts when a burst arrives', () => {
    renderWithProviders(
      <>
        {Array.from({ length: 12 }, (_, i) => (
          <Toaster key={i} message={`Failure ${i + 1}`} duration={0} />
        ))}
        <ToastStack />
      </>,
    )

    expect(screen.queryByText('Failure 1')).toBeNull()
    expect(screen.getByText('Failure 12')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(5)
  })

  it('drops each toast when its own time is up', () => {
    jest.useFakeTimers()
    renderWithProviders(
      <>
        <Toaster message="Short" duration={1000} />
        <Toaster message="Long" duration={5000} />
        <ToastStack />
      </>,
    )

    act(() => jest.advanceTimersByTime(1000))
    expect(screen.queryByText('Short')).toBeNull()
    expect(screen.getByText('Long')).toBeInTheDocument()

    act(() => jest.advanceTimersByTime(4000))
    expect(screen.queryByText('Long')).toBeNull()
  })
})
