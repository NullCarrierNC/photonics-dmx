import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  networkFailure,
  skipRequested,
  SKIP_ENV,
} = require('../../../../tools/lockfileCheckCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const npmError = (code: string): string =>
  [
    `npm error code ${code}`,
    `npm error syscall getaddrinfo`,
    `npm error errno ${code}`,
    `npm error request to https://registry.npmjs.org/jotai failed, reason: getaddrinfo ${code} registry.npmjs.org`,
  ].join('\n')

describe('networkFailure', () => {
  it.each(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENETUNREACH'])(
    'reads %s as the registry being out of reach',
    (code) => {
      const line = networkFailure(npmError(code))

      expect(line).toContain(code)
      expect(line).toContain('registry')
      expect(line).toContain(`${SKIP_ENV}=1`)
      expect(line.split('\n')).toHaveLength(1)
    },
  )

  it('reads a failed request with no code as the registry being out of reach', () => {
    expect(
      networkFailure('npm error network request to https://registry.npmjs.org/x failed'),
    ).toContain('registry')
  })

  it('answers null for a failure that is not the network', () => {
    expect(
      networkFailure('npm error code ERESOLVE\nnpm error ERESOLVE unable to resolve'),
    ).toBeNull()
  })
})

describe('skipRequested', () => {
  it('skips only when the variable is set to 1', () => {
    expect(skipRequested({ [SKIP_ENV]: '1' })).toBe(true)
    expect(skipRequested({ [SKIP_ENV]: '' })).toBe(false)
    expect(skipRequested({ [SKIP_ENV]: 'yes' })).toBe(false)
    expect(skipRequested({})).toBe(false)
  })
})
