import { describe, it, expect, jest } from '@jest/globals'
import {
  GOLDEN_CASES,
  runGoldenCase,
  readGolden,
  writeGolden,
  goldenPath,
} from '../goldens/goldenCases'

/**
 * Golden-frame regression over the bundled cue libraries. See goldens/goldenCases.ts for how to
 * regenerate. Set UPDATE_GOLDENS=1 to rewrite the committed goldens (review the diff by hand).
 */

const UPDATE = process.env.UPDATE_GOLDENS === '1'

jest.setTimeout(30000)

describe('cue golden frames', () => {
  for (const c of GOLDEN_CASES) {
    it(`${c.library}/${c.cue} matches its golden timeline`, async () => {
      const actual = await runGoldenCase(c)

      if (UPDATE) {
        writeGolden(c, actual)
        return
      }

      const expected = readGolden(c)
      if (expected === null) {
        throw new Error(
          `Missing golden for ${c.library}/${c.cue} at ${goldenPath(c)}. ` +
            `Run UPDATE_GOLDENS=1 jest to generate it.`,
        )
      }
      // Compare parsed structures, not strings, so golden formatting (prettier) is irrelevant.
      expect(actual).toEqual(expected)
    })
  }

  it('produces identical output across repeated runs (determinism guard)', async () => {
    const c = GOLDEN_CASES.find((x) => x.cue === 'Frenzy') ?? GOLDEN_CASES[0]
    const first = await runGoldenCase(c)
    const second = await runGoldenCase(c)
    expect(second).toEqual(first)
  })
})
