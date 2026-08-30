/**
 * @jest-environment jsdom
 */
import {
  DEFAULT_SIDEBAR_LAYOUT,
  getStoredSidebarLayout,
  setStoredSidebarLayout,
} from './sidebarLayout'

const KEY = 'photonics.nodeCueEditor.sidebarLayout'

describe('sidebar layout persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('round-trips a stored layout', () => {
    setStoredSidebarLayout({ left: 30, center: 40, right: 30 })
    expect(getStoredSidebarLayout()).toEqual({ left: 30, center: 40, right: 30 })
  })

  it('reads nothing when no layout is stored', () => {
    expect(getStoredSidebarLayout()).toBeNull()
  })

  it('rejects a stored layout whose panes do not add up', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ left: 25, center: 25, right: 25 }))
    expect(getStoredSidebarLayout()).toBeNull()
  })

  it('rejects a pane too narrow to use', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ left: 5, center: 60, right: 35 }))
    expect(getStoredSidebarLayout()).toBeNull()

    window.localStorage.setItem(KEY, JSON.stringify({ left: 40, center: 20, right: 40 }))
    expect(getStoredSidebarLayout()).toBeNull()
  })

  it('rejects malformed or non-numeric entries rather than throwing', () => {
    window.localStorage.setItem(KEY, 'not json')
    expect(getStoredSidebarLayout()).toBeNull()

    window.localStorage.setItem(KEY, JSON.stringify({ left: 'wide', center: 42, right: 33 }))
    expect(getStoredSidebarLayout()).toBeNull()
  })

  it('has a default that satisfies its own validation', () => {
    setStoredSidebarLayout(DEFAULT_SIDEBAR_LAYOUT)
    expect(getStoredSidebarLayout()).toEqual(DEFAULT_SIDEBAR_LAYOUT)
  })
})
