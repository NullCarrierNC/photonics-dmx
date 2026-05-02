/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import { CueGroupEnableList } from './CueGroupEnableList'

describe('CueGroupEnableList', () => {
  it('renders children when not loading and no error', () => {
    render(
      <CueGroupEnableList
        title="Group Panel"
        description="Group panel description."
        loading={false}
        loadError={null}>
        <div data-testid="row">Row body</div>
      </CueGroupEnableList>,
    )
    expect(screen.getByText('Group Panel')).toBeTruthy()
    expect(screen.getByText('Group panel description.')).toBeTruthy()
    expect(screen.getByTestId('row')).toBeTruthy()
  })

  it('renders the load-error UI and Retry button when loadError is set', async () => {
    const onRetryLoad = jest.fn()
    render(
      <CueGroupEnableList
        title="Group Panel"
        description="ignored when error"
        loading={false}
        loadError="Network error"
        onRetryLoad={onRetryLoad}>
        <div data-testid="row">should not render</div>
      </CueGroupEnableList>,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('Network error')
    expect(screen.queryByTestId('row')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetryLoad).toHaveBeenCalledTimes(1)
  })

  it('shows the loading state without children', () => {
    render(
      <CueGroupEnableList title="Title" description="ignored" loading={true} loadError={null}>
        <div data-testid="row">should not render</div>
      </CueGroupEnableList>,
    )
    expect(screen.getByText(/loading/i)).toBeTruthy()
    expect(screen.queryByTestId('row')).toBeNull()
  })

  it('omits the Retry button when no onRetryLoad is provided', () => {
    render(
      <CueGroupEnableList title="Title" description="ignored" loading={false} loadError="boom">
        {null}
      </CueGroupEnableList>,
    )
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })
})
