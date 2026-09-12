/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeAll } from '@jest/globals'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import LeftMenu from './LeftMenu'
import { currentPageAtom, lightingPrefsAtom } from '../atoms'
import { Pages } from '../types'

jest.mock('../hooks/useConfirm', () => ({
  useConfirm: () => async () => true,
}))

beforeAll(() => {
  Object.defineProperty(window, 'api', {
    value: {
      receive: jest.fn().mockReturnValue(jest.fn()),
      invoke: jest.fn(),
    },
    configurable: true,
  })
})

function renderLeftMenu(advancedModeEnabled: boolean) {
  return renderWithProviders(
    <LeftMenu
      isDarkMode={false}
      toggleDarkMode={() => {}}
      isCollapsed={false}
      onToggleCollapse={() => {}}
    />,
    {
      seed: (set) => {
        set(currentPageAtom, Pages.Status)
        set(lightingPrefsAtom, { advancedModeEnabled })
      },
    },
  )
}

describe('LeftMenu', () => {
  it('hides Spectrum Analyzer and Cue Editor when Advanced Mode is off', () => {
    renderLeftMenu(false)
    expect(screen.queryByText('Spectrum Analyzer')).toBeNull()
    expect(screen.queryByText('Cue Editor')).toBeNull()
  })

  it('shows Spectrum Analyzer and Cue Editor when Advanced Mode is on', () => {
    renderLeftMenu(true)
    expect(screen.getByText('Spectrum Analyzer')).toBeInTheDocument()
    expect(screen.getByText('Cue Editor')).toBeInTheDocument()
  })
})
