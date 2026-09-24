import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  networkFailure,
  skipRequested,
  SKIP_ENV,
  AUDIT_SKIP_ENV,
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

describe('networkFailure for the audit', () => {
  const auditOutage = (reason: string): string =>
    [
      `npm warn audit request to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk failed, reason: ${reason}`,
      'undefined',
      'npm error audit endpoint returned an error',
    ].join('\n')

  it('names the audit and its own skip when the registry is out of reach', () => {
    expect(
      networkFailure(
        auditOutage('getaddrinfo ENOTFOUND registry.npmjs.org'),
        'audit:check',
        AUDIT_SKIP_ENV,
      ),
    ).toBe(
      `audit:check could not reach the npm registry (ENOTFOUND). Push again online, or skip this check on purpose with ${AUDIT_SKIP_ENV}=1.`,
    )
  })

  it('reads a refused connection as the registry being out of reach', () => {
    expect(
      networkFailure(
        auditOutage('connect ECONNREFUSED 127.0.0.1:443'),
        'audit:check',
        AUDIT_SKIP_ENV,
      ),
    ).toContain('(ECONNREFUSED)')
  })

  it('answers null for an audit that found an advisory', () => {
    const report = [
      '# npm audit report',
      '',
      'lodash  <4.17.21',
      'Severity: high',
      '1 high severity vulnerability',
    ].join('\n')

    expect(networkFailure(report, 'audit:check', AUDIT_SKIP_ENV)).toBeNull()
  })
})

describe('skipRequested', () => {
  it('skips only when the variable is set to 1', () => {
    expect(skipRequested({ [SKIP_ENV]: '1' })).toBe(true)
    expect(skipRequested({ [SKIP_ENV]: '' })).toBe(false)
    expect(skipRequested({ [SKIP_ENV]: 'yes' })).toBe(false)
    expect(skipRequested({})).toBe(false)
  })

  it('reads the variable it is given', () => {
    expect(skipRequested({ [AUDIT_SKIP_ENV]: '1' }, AUDIT_SKIP_ENV)).toBe(true)
    expect(skipRequested({ [SKIP_ENV]: '1' }, AUDIT_SKIP_ENV)).toBe(false)
  })
})
