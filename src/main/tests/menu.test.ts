import { afterEach, describe, expect, it, jest } from '@jest/globals'
import type { MenuItemConstructorOptions } from 'electron'

const mockApp = { name: 'Photonics', isPackaged: false, getVersion: () => '1.2.3' }
const mockSetApplicationMenu = jest.fn((_menu: { template: MenuItemConstructorOptions[] }) => {})
const mockShowMessageBox = jest.fn((_options: unknown) => Promise.resolve({ response: 0 }))

jest.mock('electron', () => ({
  app: mockApp,
  Menu: {
    buildFromTemplate: (template: unknown) => ({ template }),
    setApplicationMenu: mockSetApplicationMenu,
  },
  dialog: { showMessageBox: mockShowMessageBox },
}))

import { setupMenu } from '../menu'

const realPlatform = process.platform

function buildMenu(platform: NodeJS.Platform, packaged: boolean): MenuItemConstructorOptions[] {
  Object.defineProperty(process, 'platform', { value: platform })
  mockApp.isPackaged = packaged
  setupMenu()
  return mockSetApplicationMenu.mock.lastCall![0].template
}

/** Each top-level menu as its label and the role, label or type of each item in order. */
function outline(template: MenuItemConstructorOptions[]): Record<string, string[]> {
  return Object.fromEntries(
    template.map((menu) => [
      menu.label,
      (menu.submenu as MenuItemConstructorOptions[]).map(
        (item) => item.role ?? item.label ?? item.type ?? '',
      ),
    ]),
  )
}

describe('setupMenu', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform })
    mockSetApplicationMenu.mockClear()
    mockShowMessageBox.mockClear()
  })

  it('builds the macOS menus with the app menu first', () => {
    expect(outline(buildMenu('darwin', true))).toEqual({
      Photonics: [
        'About',
        'separator',
        'services',
        'separator',
        'hide',
        'hideOthers',
        'unhide',
        'separator',
        'quit',
      ],
      File: ['close'],
      Edit: ['undo', 'redo', 'separator', 'cut', 'copy', 'paste'],
      View: ['resetZoom', 'zoomIn', 'zoomOut', 'separator', 'togglefullscreen'],
      Window: ['minimize', 'zoom', 'separator', 'front', 'separator', 'window'],
    })
  })

  it('quits from File and closes from Window elsewhere, with no app menu', () => {
    expect(outline(buildMenu('win32', true))).toEqual({
      File: ['quit'],
      Edit: ['undo', 'redo', 'separator', 'cut', 'copy', 'paste'],
      View: ['resetZoom', 'zoomIn', 'zoomOut', 'separator', 'togglefullscreen'],
      Window: ['minimize', 'zoom', 'close'],
    })
  })

  it('offers reload and DevTools in View only when not packaged', () => {
    expect(outline(buildMenu('linux', false)).View).toEqual([
      'reload',
      'forceReload',
      'toggleDevTools',
      'separator',
      'resetZoom',
      'zoomIn',
      'zoomOut',
      'separator',
      'togglefullscreen',
    ])
  })

  it('shows the app name and version from About', () => {
    const [appMenu] = buildMenu('darwin', true)
    const about = (appMenu.submenu as MenuItemConstructorOptions[])[0]

    about.click!({} as never, undefined, {} as never)

    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'About Photonics',
        message: 'Photonics PREVIEW v1.2.3',
      }),
    )
  })
})
