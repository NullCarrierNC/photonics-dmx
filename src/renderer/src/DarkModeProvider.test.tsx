/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DarkModeProvider, useDarkMode } from './DarkModeProvider'

function Probe(): JSX.Element {
  const { isDarkMode, toggleDarkMode } = useDarkMode()
  return <button onClick={toggleDarkMode}>{isDarkMode ? 'dark' : 'light'}</button>
}

/** What the browser delivers to a window when another window of the app writes the key. */
function storageWrittenElsewhere(key: string, newValue: string | null): void {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }))
  })
}

describe('DarkModeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => cleanup())

  it('follows a theme another window switched to', () => {
    render(
      <DarkModeProvider>
        <Probe />
      </DarkModeProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('dark')

    storageWrittenElsewhere('darkMode', 'false')

    expect(screen.getByRole('button')).toHaveTextContent('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('ignores other keys and a cleared store', () => {
    render(
      <DarkModeProvider>
        <Probe />
      </DarkModeProvider>,
    )

    storageWrittenElsewhere('photonics.dmx.lastUsedRigId', 'false')
    storageWrittenElsewhere('darkMode', null)

    expect(screen.getByRole('button')).toHaveTextContent('dark')
  })

  it('stops following other windows once unmounted', () => {
    const { unmount } = render(
      <DarkModeProvider>
        <Probe />
      </DarkModeProvider>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    unmount()

    storageWrittenElsewhere('darkMode', 'true')

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
