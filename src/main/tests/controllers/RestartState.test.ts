import { describe, expect, it } from '@jest/globals'
import { RestartState } from '../../controllers/RestartState'

const noFault = (): boolean => false
const faulted = (): boolean => true

function runs(): { first: Promise<void>; second: Promise<void> } {
  return { first: Promise.resolve(), second: Promise.resolve() }
}

describe('RestartState', () => {
  it('starts idle, so a request needs a new restart', () => {
    const state = new RestartState()

    expect(state.inFlight()).toBeNull()
    expect(state.startedMark()).toBeNull()
    expect(state.request(0, noFault)).toEqual({ kind: 'new' })
  })

  describe('a queued restart', () => {
    it('is in flight with no started mark', () => {
      const state = new RestartState()
      const { first } = runs()
      state.queue(first, 2)

      expect(state.inFlight()).toBe(first)
      expect(state.startedMark()).toBeNull()
    })

    it('is shared by a later request, whose mark it takes', () => {
      const state = new RestartState()
      const { first } = runs()
      state.queue(first, 1)

      expect(state.request(3, faulted)).toEqual({ kind: 'share', run: first })
      expect(state.start()).toBe(3)
    })

    it('keeps its mark when a request carries an earlier one', () => {
      const state = new RestartState()
      state.queue(runs().first, 3)

      state.request(1, noFault)

      expect(state.start()).toBe(3)
    })
  })

  describe('start', () => {
    it('moves the restart to tearing down and fixes its mark', () => {
      const state = new RestartState()
      state.queue(runs().first, 2)

      expect(state.start()).toBe(2)
      expect(state.startedMark()).toBe(2)
      state.request(5, noFault)
      expect(state.startedMark()).toBe(2)
    })

    it('throws with no restart in flight', () => {
      expect(() => new RestartState().start()).toThrow(/no restart/i)
    })
  })

  describe('a restart tearing down', () => {
    it('is shared by a request while no fault is held since its mark', () => {
      const state = new RestartState()
      const { first } = runs()
      state.queue(first, 2)
      state.start()

      expect(state.request(2, (mark) => mark !== 2)).toEqual({ kind: 'share', run: first })
    })

    it('sends a request to the follow-up once a fault is held since its mark', () => {
      const state = new RestartState()
      state.queue(runs().first, 2)
      state.start()

      expect(state.request(3, (mark) => mark !== 3)).toEqual({ kind: 'followUp' })
    })
  })

  describe('rebuild', () => {
    it('sends every request to the follow-up', () => {
      const state = new RestartState()
      state.queue(runs().first, 2)
      state.start()
      state.rebuild()

      expect(state.startedMark()).toBe(2)
      expect(state.request(2, noFault)).toEqual({ kind: 'followUp' })
    })

    it('leaves an idle state idle', () => {
      const state = new RestartState()
      state.rebuild()

      expect(state.request(0, noFault)).toEqual({ kind: 'new' })
    })
  })

  describe('settle', () => {
    it('returns the state to idle', () => {
      const state = new RestartState()
      state.queue(runs().first, 2)
      state.start()
      state.settle()

      expect(state.inFlight()).toBeNull()
      expect(state.startedMark()).toBeNull()
      expect(state.request(2, noFault)).toEqual({ kind: 'new' })
    })

    it('gives a request a new restart while the follow-up has yet to start', () => {
      const state = new RestartState()
      const { first, second } = runs()
      state.queue(first, 0)
      state.start()
      state.rebuild()
      state.openFollowUp(second, 0)
      state.settle()

      expect(state.request(1, noFault)).toEqual({ kind: 'new' })
    })
  })

  describe('the follow-up', () => {
    function rebuildingWithFollowUp(mark: number) {
      const state = new RestartState()
      const { first, second } = runs()
      state.queue(first, 0)
      state.start()
      state.rebuild()
      state.openFollowUp(second, mark)
      return { state, followUp: second }
    }

    it('is shared by a later request, whose mark it takes', () => {
      const { state, followUp } = rebuildingWithFollowUp(1)

      expect(state.request(4, noFault)).toEqual({ kind: 'share', run: followUp })
      expect(state.startFollowUp()).toBe(4)
    })

    it('keeps its mark when a request carries an earlier one', () => {
      const { state } = rebuildingWithFollowUp(4)

      state.request(1, noFault)

      expect(state.startFollowUp()).toBe(4)
    })

    it('frees its slot as it starts, so the next request opens another', () => {
      const { state } = rebuildingWithFollowUp(1)

      state.startFollowUp()

      expect(state.request(1, noFault)).toEqual({ kind: 'followUp' })
    })

    it('throws on a start with no follow-up waiting', () => {
      expect(() => new RestartState().startFollowUp()).toThrow(/no follow-up/i)
    })
  })
})
