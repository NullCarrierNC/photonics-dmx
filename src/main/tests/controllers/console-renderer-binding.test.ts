/**
 * Console mode holds DMX output in manual mode, and only the page that opened it turns it off.
 * These cover what happens when that page reloads, navigates or stops running.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import { bindConsoleModeToRenderer } from '../../controllers/consoleRendererBinding'

function fakeWebContents(): { emitter: EventEmitter; webContents: WebContents } {
  const emitter = new EventEmitter()
  return { emitter, webContents: emitter as unknown as WebContents }
}

describe('console mode follows the page that opened it', () => {
  it('leaves console mode when the page reloads', async () => {
    const disable = jest.fn(async () => ({ success: true }))
    const { emitter, webContents } = fakeWebContents()
    bindConsoleModeToRenderer(webContents, disable)

    emitter.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })

    expect(disable).toHaveBeenCalledTimes(1)
  })

  it('leaves console mode when the page closes', async () => {
    const disable = jest.fn(async () => ({ success: true }))
    const { emitter, webContents } = fakeWebContents()
    bindConsoleModeToRenderer(webContents, disable)

    emitter.emit('destroyed')

    expect(disable).toHaveBeenCalledTimes(1)
  })

  it('leaves console mode when the renderer process stops', async () => {
    const disable = jest.fn(async () => ({ success: true }))
    const { emitter, webContents } = fakeWebContents()
    bindConsoleModeToRenderer(webContents, disable)

    emitter.emit('render-process-gone', {}, { reason: 'crashed' })

    expect(disable).toHaveBeenCalledTimes(1)
  })

  it('stays in console mode while the page routes within itself', async () => {
    const disable = jest.fn(async () => ({ success: true }))
    const { emitter, webContents } = fakeWebContents()
    bindConsoleModeToRenderer(webContents, disable)

    emitter.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    emitter.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false })

    expect(disable).not.toHaveBeenCalled()
  })

  it('disables once when the page navigates and then closes', async () => {
    const disable = jest.fn(async () => ({ success: true }))
    const { emitter, webContents } = fakeWebContents()
    bindConsoleModeToRenderer(webContents, disable)

    emitter.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    emitter.emit('destroyed')

    expect(disable).toHaveBeenCalledTimes(1)
  })
})
