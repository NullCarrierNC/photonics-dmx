import { app, Menu, dialog, MenuItemConstructorOptions } from 'electron';

/**
 * Create the About menu
 */
function createAboutMenu(): MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin';
  
  return [
    // macOS-specific application menu
    ...(isMac
      ? [
        {
          label: app.name,
          submenu: [
            {
              label: 'About',
              click: () => {
                dialog.showMessageBox({
                  type: 'info',
                  title: `About ${app.name}`,
                  message: `${app.name} PREVIEW v${app.getVersion()}`,
                  buttons: ['OK'],
                });
              }
            },
            { type: 'separator' as const },
            { role: 'services' },
            { type: 'separator' as const },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' as const },
            { role: 'quit' }
          ] as MenuItemConstructorOptions[]
        }
      ] as MenuItemConstructorOptions[]
      : []),
    // File menu
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }] as MenuItemConstructorOptions[]
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' as const },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ] as MenuItemConstructorOptions[]
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' as const },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' as const },
        { role: 'togglefullscreen' }
      ] as MenuItemConstructorOptions[]
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
            { type: 'separator' as const },
            { role: 'front' },
            { type: 'separator' as const },
            { role: 'window' }
          ] as MenuItemConstructorOptions[]
          : [{ role: 'close' }] as MenuItemConstructorOptions[])
      ] as MenuItemConstructorOptions[]
    }
  ];
}

/**
 * Set up the application menu
 */
export function setupMenu(): void {
  const menuTemplate = createAboutMenu();
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
} 