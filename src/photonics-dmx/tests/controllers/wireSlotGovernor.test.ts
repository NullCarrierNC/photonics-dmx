import { describe, expect, it, jest } from '@jest/globals'
import { WireSlotGovernor, type WireSendResult } from '../../controllers/wireSlotGovernor'

function governorOver(results: WireSendResult[]) {
  let nowMs = 0
  const send = jest.fn((_wireId: string, _buffer: Record<number, number>) =>
    Promise.resolve(results.shift() ?? true),
  )
  const governor = new WireSlotGovernor(
    { send },
    {
      now: () => nowMs,
      setTimer: () => 0 as never,
      clearTimer: () => {},
    },
    25,
  )
  const frame = (value: number): void => {
    const slot = governor.slotFor('sacn')
    slot.buffer[1] = value
    governor.dispatch('sacn', slot)
  }
  const advance = (ms: number): void => {
    nowMs += ms
  }
  return { send, frame, advance }
}

describe('WireSlotGovernor dirty-skip after a send settles', () => {
  it('skips the same frame after a send the output delay dropped', async () => {
    const { send, frame, advance } = governorOver(['dropped'])

    frame(10)
    await Promise.resolve()
    advance(50)
    frame(10)

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('sends the same frame again after a send that failed', async () => {
    const { send, frame, advance } = governorOver([false])

    frame(10)
    await Promise.resolve()
    advance(50)
    frame(10)

    expect(send).toHaveBeenCalledTimes(2)
  })
})
