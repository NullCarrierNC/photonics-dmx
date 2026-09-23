import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { resetLogConfiguration, setLogSink, type LogEntry } from '../../../shared/logger'
import { ipcApiMock, refused, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import { leaveConsole } from './leaveConsole'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

let entries: LogEntry[]

beforeEach(() => {
  resetIpcApiMock()
  entries = []
  setLogSink((entry) => {
    entries.push(entry)
  })
})

afterEach(() => {
  resetLogConfiguration()
})

/** Lets the call's promise chain settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const errors = () => entries.filter((entry) => entry.level === 'error')

describe('leaveConsole', () => {
  it('hands console mode back and logs nothing when main accepts', async () => {
    leaveConsole()
    await settle()

    expect(ipcApiMock.disableConsole).toHaveBeenCalledTimes(1)
    expect(errors()).toEqual([])
  })

  it('logs a refusal', async () => {
    ipcApiMock.disableConsole.mockResolvedValue(refused('shutting down') as never)

    leaveConsole()
    await settle()

    expect(errors()).toEqual([expect.objectContaining({ data: ['shutting down'] })])
  })

  it('logs a rejection', async () => {
    const failure = new Error('ipc closed')
    ipcApiMock.disableConsole.mockRejectedValue(failure as never)

    leaveConsole()
    await settle()

    expect(errors()).toEqual([expect.objectContaining({ data: [failure] })])
  })
})
