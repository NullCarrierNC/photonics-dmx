import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const { readThresholds, loweredThresholds } = require('../../../../tools/coverageThresholdCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const config = (statements: number, branches: number, functions: number, lines: number): string =>
  `module.exports = {
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: {
      statements: ${statements},
      branches: ${branches},
      functions: ${functions},
      lines: ${lines},
    },
  },
}
`

describe('readThresholds', () => {
  it('reads the four global thresholds', () => {
    expect(readThresholds(config(77, 80, 73, 77))).toEqual({
      statements: 77,
      branches: 80,
      functions: 73,
      lines: 77,
    })
  })

  it('answers null for a config with no global thresholds', () => {
    expect(readThresholds('module.exports = {}')).toBeNull()
  })
})

describe('loweredThresholds', () => {
  it('names each threshold set below the base', () => {
    const base = readThresholds(config(77, 80, 73, 77))
    const current = readThresholds(config(77, 79, 73, 70))

    expect(loweredThresholds(current, base)).toEqual([
      expect.stringContaining('branches'),
      expect.stringContaining('lines'),
    ])
  })

  it('passes thresholds held or raised', () => {
    const base = readThresholds(config(77, 80, 73, 77))

    expect(loweredThresholds(readThresholds(config(78, 80, 74, 77)), base)).toEqual([])
  })

  it('names a threshold the config dropped', () => {
    const base = readThresholds(config(77, 80, 73, 77))

    expect(loweredThresholds(null, base)).toEqual([expect.stringContaining('no global')])
  })
})
