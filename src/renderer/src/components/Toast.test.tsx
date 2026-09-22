/** @jest-environment jsdom */
import * as React from 'react'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { useToast } from '../hooks/useToast'
import ToastContainer, { ToastStack } from './Toast'

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
