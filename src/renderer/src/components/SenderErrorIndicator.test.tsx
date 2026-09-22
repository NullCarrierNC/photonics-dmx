/** @jest-environment jsdom */
import { describe, expect, it } from '@jest/globals'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { isSenderErrorAtom, senderErrorAtom } from '../atoms'
import SenderErrorIndicator from './SenderErrorIndicator'

describe('SenderErrorIndicator', () => {
  it('shows the message as written', () => {
    renderWithProviders(<SenderErrorIndicator />, {
      seed: (set) => {
        set(isSenderErrorAtom, true)
        set(senderErrorAtom, 'Failed to start audio capture: no device')
      },
    })

    expect(screen.getByText('Failed to start audio capture: no device')).toBeInTheDocument()
  })

  it('shows nothing while there is no error', () => {
    const { container } = renderWithProviders(<SenderErrorIndicator />, {
      seed: (set) => set(senderErrorAtom, 'stale message'),
    })

    expect(container).toBeEmptyDOMElement()
  })
})
