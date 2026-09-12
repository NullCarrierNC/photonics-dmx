/**
 * The sender status snapshot the renderer reconciles its toggles against.
 *
 * A sender missing from the snapshot keeps whatever the UI last guessed, so the shape is asserted
 * rather than only the values.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { SenderLifecycleController } from '../../controllers/SenderLifecycleController'

/** The senders the renderer holds a toggle for, plus the internal ipc sender. */
const REPORTED_SENDERS = ['artnet', 'enttecpro', 'ipc', 'opendmx', 'sacn']

function controllerReporting(running: readonly string[]): SenderLifecycleController {
  const senderManager = { isSenderEnabled: jest.fn((id: string) => running.includes(id)) }
  const controller = Object.create(SenderLifecycleController.prototype) as SenderLifecycleController
  ;(controller as unknown as { getSenderManager: () => unknown }).getSenderManager = () =>
    senderManager
  return controller
}

describe('getOutputSenderStatus', () => {
  it('reports every sender the renderer can toggle', () => {
    const status = controllerReporting([]).getOutputSenderStatus()

    expect(Object.keys(status).sort()).toEqual(REPORTED_SENDERS)
  })

  it('reports each sender as the manager sees it', () => {
    const status = controllerReporting(['sacn', 'opendmx']).getOutputSenderStatus()

    expect(status).toEqual({
      sacn: true,
      artnet: false,
      enttecpro: false,
      opendmx: true,
      ipc: false,
    })
  })
})
