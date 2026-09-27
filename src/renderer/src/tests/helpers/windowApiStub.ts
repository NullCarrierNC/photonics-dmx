/**
 * The preload bridge for renderer suites that run the real `ipcApi` wrappers or `utils/ipcHelpers`,
 * since jsdom has no `window.api`. An invoke resolves to the suite's answer for that channel, typed
 * by the channel's contract, and a channel the suite does not answer rejects, naming it. `receive`
 * keeps each subscriber, so `emitWindowApi` reaches it and its unsubscribe removes it, as the
 * preload does.
 *
 * A suite that mocks `ipcApi` and `ipcHelpers` with `ipcApiMock` and `ipcListenerStub` needs none
 * of this. It is for suites whose code reaches the bridge itself.
 */
import { jest } from '@jest/globals'
import type { IpcErrorResult, IpcInvokeChannel, IpcInvokeMap } from '../../../../shared/ipcTypes'

type Handler = (payload: unknown) => void

/**
 * What the bridge can answer on a channel: its contract's response, or the refusal `handleInvoke`
 * sends when the handler throws.
 */
type BridgeAnswer<C extends IpcInvokeChannel> = IpcInvokeMap[C]['response'] | IpcErrorResult

/** The answer a suite gives on each channel its code invokes, given the request. */
export type WindowApiAnswers = {
  [C in IpcInvokeChannel]?: (
    request: IpcInvokeMap[C]['request'],
  ) => BridgeAnswer<C> | Promise<BridgeAnswer<C>>
}

/**
 * An answer as the bridge reads it, by channel name. Declared as a method, so any channel's answer
 * is one.
 */
type AnswerByName = { answer(request: unknown): unknown }['answer']

export interface WindowApiStub {
  invoke: jest.Mock<(channel: string, payload?: unknown) => Promise<unknown>>
  send: jest.Mock<(channel: string, payload?: unknown) => void>
  sendToMain: jest.Mock<(channel: string, payload?: unknown) => void>
  receive: jest.Mock<(channel: string, handler: Handler) => () => void>
}

const subscribers = new Map<string, Set<Handler>>()

/** Puts a fresh bridge answering `answers` on `window.api`, and drops every earlier subscriber. */
export function installWindowApi(answers: WindowApiAnswers = {}): WindowApiStub {
  const byChannel: Partial<Record<string, AnswerByName>> = answers
  return installBridge((channel, payload) => {
    const answer = byChannel[channel]
    if (!answer) throw new Error(`The suite gives no answer on '${channel}'`)
    return answer(payload)
  })
}

/**
 * Puts a fresh bridge on `window.api` that answers every channel through `answer`, whatever its
 * contract says, for a suite checking what the renderer does with any answer at all.
 */
export function installWindowApiAnswering(
  answer: (channel: string, payload?: unknown) => unknown,
): WindowApiStub {
  return installBridge(answer)
}

function installBridge(answer: (channel: string, payload?: unknown) => unknown): WindowApiStub {
  subscribers.clear()
  const api: WindowApiStub = {
    invoke: jest.fn(async (channel: string, payload?: unknown) => answer(channel, payload)),
    send: jest.fn(),
    sendToMain: jest.fn(),
    receive: jest.fn((channel: string, handler: Handler) => {
      let onChannel = subscribers.get(channel)
      if (!onChannel) {
        onChannel = new Set()
        subscribers.set(channel, onChannel)
      }
      onChannel.add(handler)
      return () => {
        onChannel.delete(handler)
      }
    }),
  }
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true })
  return api
}

/** Sends `payload` to every subscriber the bridge holds on `channel`, oldest first. */
export function emitWindowApi(channel: string, payload: unknown): void {
  for (const handler of Array.from(subscribers.get(channel) ?? [])) {
    handler(payload)
  }
}
