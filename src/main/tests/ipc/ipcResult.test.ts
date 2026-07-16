import { describe, it, expect } from '@jest/globals'
import { ipcError, ipcSuccess } from '../../ipc/ipcResult'

/**
 * Every state-changing IPC handler returns these shapes, so the renderer's success/error handling
 * depends on them staying stable.
 */
describe('ipcResult', () => {
  it('ipcSuccess is a bare success payload', () => {
    expect(ipcSuccess()).toEqual({ success: true })
  })

  it('ipcError carries an Error message', () => {
    expect(ipcError(new Error('boom'))).toEqual({ success: false, error: 'boom' })
  })

  it('ipcError stringifies a non-Error reason', () => {
    expect(ipcError('nope')).toEqual({ success: false, error: 'nope' })
    expect(ipcError(42)).toEqual({ success: false, error: '42' })
    expect(ipcError(null)).toEqual({ success: false, error: 'null' })
  })
})
