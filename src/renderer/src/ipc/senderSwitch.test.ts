/**
 * What the sender toggle shows while the main process decides, and after it answers.
 */
import { describe, expect, it } from '@jest/globals'
import { applySenderRunState } from './senderSwitch'

/** Records every value the toggle was set to, in order. */
function recorder(): { set: (running: boolean) => void; states: boolean[] } {
  const states: boolean[] = []
  return { set: (running: boolean) => states.push(running), states }
}

describe('applySenderRunState', () => {
  it('moves the toggle before waiting for an answer', async () => {
    const toggle = recorder()
    let resolve: (value: unknown) => void = () => {}
    const pending = applySenderRunState(
      'sacn',
      true,
      toggle.set,
      () => new Promise((r) => (resolve = r)),
    )

    expect(toggle.states).toEqual([true])

    resolve({ success: true })
    await pending
  })

  it('leaves the toggle on when the start is accepted', async () => {
    const toggle = recorder()

    await applySenderRunState('sacn', true, toggle.set, async () => ({ success: true }))

    expect(toggle.states).toEqual([true])
  })

  it('reads a call that answers nothing as accepted', async () => {
    const toggle = recorder()

    await applySenderRunState('sacn', true, toggle.set, async () => undefined)

    expect(toggle.states).toEqual([true])
  })

  it('reads a call that answers synchronously as accepted', async () => {
    const toggle = recorder()

    await applySenderRunState('sacn', true, toggle.set, () => undefined)

    expect(toggle.states).toEqual([true])
  })

  it('puts the toggle back when the start is refused', async () => {
    const toggle = recorder()

    await applySenderRunState('sacn', true, toggle.set, async () => ({
      success: false,
      error: 'port in use',
    }))

    expect(toggle.states).toEqual([true, false])
  })

  it('puts the toggle back when the call throws', async () => {
    const toggle = recorder()

    await applySenderRunState('sacn', true, toggle.set, async () => {
      throw new Error('bridge gone')
    })

    expect(toggle.states).toEqual([true, false])
  })

  it('puts the toggle back on when a stop is refused', async () => {
    const toggle = recorder()

    await applySenderRunState('sacn', false, toggle.set, async () => ({ success: false }))

    expect(toggle.states).toEqual([false, true])
  })

  it('leaves the toggle off when the stop is accepted', async () => {
    const toggle = recorder()

    await applySenderRunState('sacn', false, toggle.set, async () => ({ success: true }))

    expect(toggle.states).toEqual([false])
  })

  it('does not read a plain value as a refusal', async () => {
    const toggle = recorder()

    await applySenderRunState('sacn', true, toggle.set, async () => 'ok')

    expect(toggle.states).toEqual([true])
  })

  it('reads a result object that carries no verdict as accepted', async () => {
    const toggle = recorder()

    await applySenderRunState('sacn', true, toggle.set, async () => ({ universe: 1 }))

    expect(toggle.states).toEqual([true])
  })

  it('never throws out to the caller', async () => {
    const toggle = recorder()

    await expect(
      applySenderRunState('sacn', true, toggle.set, () => Promise.reject(new Error('boom'))),
    ).resolves.toBeUndefined()
  })
})
