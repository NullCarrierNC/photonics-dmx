import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const { tallyRuleReports } = require('../../../../tools/ruleReportsCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const RULE = '@typescript-eslint/no-explicit-any'

const suppressed = (line: number, justification: string) => ({
  ruleId: RULE,
  line,
  suppressions: [{ kind: 'directive', justification }],
})

describe('tallyRuleReports', () => {
  it('counts reports and suppressed reports of the rule alike', () => {
    const tally = tallyRuleReports(
      [
        {
          filePath: '/repo/src/a.ts',
          messages: [
            { ruleId: RULE, line: 1 },
            { ruleId: 'other', line: 2 },
          ],
          suppressedMessages: [suppressed(3, 'shape from the parser')],
        },
      ],
      RULE,
    )

    expect(tally.count).toBe(2)
    expect(tally.unjustified).toEqual([])
  })

  it('names each suppression that gives no reason', () => {
    const tally = tallyRuleReports(
      [
        {
          filePath: '/repo/src/b.ts',
          messages: [],
          suppressedMessages: [suppressed(7, ''), suppressed(9, 'a reason')],
        },
      ],
      RULE,
    )

    expect(tally.count).toBe(2)
    expect(tally.unjustified).toEqual(['/repo/src/b.ts:7'])
  })

  it('reads a report with no suppressed list as having none', () => {
    const tally = tallyRuleReports([{ filePath: '/repo/src/c.ts', messages: [] }], RULE)

    expect(tally).toEqual({ count: 0, unjustified: [] })
  })
})
