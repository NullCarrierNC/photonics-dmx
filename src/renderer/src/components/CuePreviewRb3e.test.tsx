/** @jest-environment jsdom */
/**
 * The RB3E "LED Position Mapping" indicator derives its four colour banks from each cue frame via
 * the pure `nextColorBanks` reducer. It must never leave an LED stuck ON: a full `ledBanks` snapshot
 * (cue mode + simulation) replaces every bank each frame, and direct-mode off frames clear the banks.
 */
import { describe, expect, it } from '@jest/globals'
import { nextColorBanks } from './CuePreviewRb3e'
import { defaultCueData, type CueData } from '../../../photonics-dmx/cues/types/cueTypes'

type Banks = { red: number[]; green: number[]; blue: number[]; yellow: number[] }
const EMPTY: Banks = { red: [], green: [], blue: [], yellow: [] }

const frame = (partial: Partial<CueData>): CueData => ({ ...defaultCueData, ...partial })
// Direct-mode frames carry no ledBanks snapshot (one colour per packet).
const directFrame = (partial: Partial<CueData>): CueData =>
  frame({ ...partial, ledBanks: undefined })

describe('nextColorBanks', () => {
  it('replaces all four banks from a ledBanks snapshot (cue mode / simulation)', () => {
    const out = nextColorBanks(
      EMPTY,
      frame({ ledBanks: { red: 0b0101, green: 0, blue: 0, yellow: 0 } }),
    )
    expect(out.red).toEqual([0, 2])
    expect(out.green).toEqual([])
    expect(out.blue).toEqual([])
    expect(out.yellow).toEqual([])
  })

  it('clears a bank on the next snapshot — the stuck-ON regression', () => {
    const lit = nextColorBanks(
      EMPTY,
      frame({ ledBanks: { red: 0b0101, green: 0, blue: 0, yellow: 0 } }),
    )
    const off = nextColorBanks(lit, frame({ ledBanks: { red: 0, green: 0, blue: 0, yellow: 0 } }))
    expect(off).toEqual(EMPTY)
  })

  it('does not misassign the aggregate: each snapshot bank shows only its own positions', () => {
    // red bit0 + yellow bit2 lit; red must NOT pick up yellow's position.
    const out = nextColorBanks(
      EMPTY,
      frame({ ledBanks: { red: 0b0001, green: 0, blue: 0, yellow: 0b0100 } }),
    )
    expect(out.red).toEqual([0])
    expect(out.yellow).toEqual([2])
    expect(out.green).toEqual([])
  })

  it('cue-mode all-off (ledColor "off") clears via the empty snapshot', () => {
    const lit = nextColorBanks(
      EMPTY,
      frame({ ledBanks: { red: 0b1111, green: 0, blue: 0, yellow: 0 } }),
    )
    const off = nextColorBanks(
      lit,
      frame({
        ledBanks: { red: 0, green: 0, blue: 0, yellow: 0 },
        ledColor: 'off',
        ledPositions: [],
      }),
    )
    expect(off).toEqual(EMPTY)
  })

  it('direct mode sets one colour bank and retains the others', () => {
    const withRed: Banks = { ...EMPTY, red: [7] }
    const out = nextColorBanks(withRed, directFrame({ ledColor: 'green', ledPositions: [1, 3] }))
    expect(out.green).toEqual([1, 3])
    expect(out.red).toEqual([7]) // untouched
  })

  it('direct mode clears a single bank when its packet has empty positions', () => {
    const withGreen: Banks = { ...EMPTY, green: [1, 3], red: [0] }
    const out = nextColorBanks(withGreen, directFrame({ ledColor: 'green', ledPositions: [] }))
    expect(out.green).toEqual([])
    expect(out.red).toEqual([0]) // other banks persist
  })

  it('direct mode global off ("" and "off") clears every bank', () => {
    const lit: Banks = { red: [0], green: [1], blue: [2], yellow: [3] }
    expect(nextColorBanks(lit, directFrame({ ledColor: '', ledPositions: [] }))).toEqual(EMPTY)
    expect(nextColorBanks(lit, directFrame({ ledColor: 'off' }))).toEqual(EMPTY)
  })

  it('leaves banks untouched on a frame carrying no LED info', () => {
    const lit: Banks = { red: [0], green: [], blue: [], yellow: [] }
    const out = nextColorBanks(lit, directFrame({ ledColor: null }))
    expect(out).toBe(lit) // same reference — no update
  })
})
