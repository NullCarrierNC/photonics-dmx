/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeAll } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
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
  const store = createStore()
  store.set(currentPageAtom, Pages.Status)
  store.set(lightingPrefsAtom, { advancedModeEnabled })
  return render(
    <Provider store={store}>
      <LeftMenu
        isDarkMode={false}
        toggleDarkMode={() => {}}
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />
    </Provider>,
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
    expect(screen.getByText('Spectrum Analyzer')).toBeTruthy()
    expect(screen.getByText('Cue Editor')).toBeTruthy()
  })
})
