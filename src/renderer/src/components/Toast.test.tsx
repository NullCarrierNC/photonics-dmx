/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import ToastContainer from './Toast'

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
