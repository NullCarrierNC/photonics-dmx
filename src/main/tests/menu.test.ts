import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { MenuItemConstructorOptions } from 'electron'

let mockIsPackaged = false
const buildFromTemplate = jest.fn((template: MenuItemConstructorOptions[]) => template)

jest.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockIsPackaged
    },
    name: 'Photonics',
    getVersion: () => '0.0.0',
  },
  Menu: {
    buildFromTemplate: (template: MenuItemConstructorOptions[]) => buildFromTemplate(template),
    setApplicationMenu: jest.fn(),
  },
  dialog: { showMessageBox: jest.fn() },
}))

import { setupMenu } from '../menu'

/** The roles the View menu offers. */
function viewRoles(): string[] {
  setupMenu()
  const template = buildFromTemplate.mock.calls.at(-1)![0]
  const view = template.find((item) => item.label === 'View')!
  return (view.submenu as MenuItemConstructorOptions[]).flatMap((item) =>
    item.role ? [item.role] : [],
  )
}

describe('View menu', () => {
  beforeEach(() => {
    buildFromTemplate.mockClear()
  })

  it('offers reload and DevTools while developing', () => {
    mockIsPackaged = false

    expect(viewRoles()).toEqual(expect.arrayContaining(['reload', 'forceReload', 'toggleDevTools']))
  })

  it('offers neither in a packaged build, and keeps zoom and full screen', () => {
    mockIsPackaged = true

    const roles = viewRoles()

    expect(roles).not.toEqual(expect.arrayContaining(['reload']))
    expect(roles).not.toContain('forceReload')
    expect(roles).not.toContain('toggleDevTools')
    expect(roles).toEqual(
      expect.arrayContaining(['resetZoom', 'zoomIn', 'zoomOut', 'togglefullscreen']),
    )
  })
})
