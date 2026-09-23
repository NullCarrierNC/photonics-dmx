import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  loosenedCoverage,
  isMissingCommit,
  parsePushedRefs,
} = require('../../../../tools/coverageThresholdCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

type Config = Record<string, unknown>

const thresholds = (statements: number, branches: number, functions: number, lines: number) => ({
  global: { statements, branches, functions, lines },
})

const config = (overrides: Config = {}): Config => ({
  projects: [
    { displayName: 'engine', setupFilesAfterEnv: ['<rootDir>/setup.ts'] },
    { displayName: 'renderer' },
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/tests/**', '!src/**/*.d.ts'],
  coverageThreshold: thresholds(77, 80, 73, 77),
  ...overrides,
})

const withProject = (index: number, project: Config): Config => {
  const base = config()
  const projects = [...(base.projects as Config[])]
  projects[index] = { ...projects[index], ...project }
  return { ...base, projects }
}

describe('loosenedCoverage', () => {
  it('passes a config that matches its base', () => {
    expect(loosenedCoverage(config(), config())).toEqual([])
  })

  it('has nothing to compare with when the base has no config', () => {
    expect(loosenedCoverage(config(), null)).toEqual([])
  })

  it('names each threshold set below the base', () => {
    const current = config({ coverageThreshold: thresholds(77, 79, 73, 70) })

    expect(loosenedCoverage(current, config())).toEqual([
      'global branches threshold 79 is below the base 80',
      'global lines threshold 70 is below the base 77',
    ])
  })

  it('passes thresholds held or raised', () => {
    expect(
      loosenedCoverage(config({ coverageThreshold: thresholds(78, 80, 74, 77) }), config()),
    ).toEqual([])
  })

  it('names a threshold the config dropped, a per-path one included', () => {
    const base = config({
      coverageThreshold: { ...thresholds(77, 80, 73, 77), './src/main/': { lines: 90 } },
    })
    const current = config({ coverageThreshold: { global: { statements: 77, branches: 80 } } })

    expect(loosenedCoverage(current, base)).toEqual([
      'global functions threshold is gone, and the base sets 73',
      'global lines threshold is gone, and the base sets 77',
      './src/main/ lines threshold is gone, and the base sets 90',
    ])
  })

  it('names every threshold when the config sets none', () => {
    const current = config()
    delete current.coverageThreshold

    expect(loosenedCoverage(current, config())).toEqual([
      expect.stringContaining('global statements'),
      expect.stringContaining('global branches'),
      expect.stringContaining('global functions'),
      expect.stringContaining('global lines'),
    ])
  })

  it('names an exclusion added to collectCoverageFrom', () => {
    const current = config({
      collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/tests/**',
        '!src/**/*.d.ts',
        '!src/main/**',
      ],
    })

    expect(loosenedCoverage(current, config())).toEqual([
      "collectCoverageFrom adds the exclusion '!src/main/**'",
    ])
  })

  it('names a collectCoverageFrom entry narrowed or dropped', () => {
    const current = config({ collectCoverageFrom: ['src/**/*.ts', '!src/**/tests/**'] })

    expect(loosenedCoverage(current, config())).toEqual([
      "collectCoverageFrom drops 'src/**/*.{ts,tsx}'",
      "collectCoverageFrom drops '!src/**/*.d.ts'",
    ])
  })

  it('names every collectCoverageFrom entry when the config drops the list', () => {
    const current = config()
    delete current.collectCoverageFrom

    expect(loosenedCoverage(current, config())).toHaveLength(3)
  })

  it('passes an entry added to widen collectCoverageFrom', () => {
    const current = config({
      collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        'tools/**/*.cjs',
        '!src/**/tests/**',
        '!src/**/*.d.ts',
      ],
    })

    expect(loosenedCoverage(current, config())).toEqual([])
  })

  it('reads collectCoverageFrom and ignore patterns a project sets', () => {
    const current = withProject(0, {
      collectCoverageFrom: ['!src/photonics-dmx/**'],
      coveragePathIgnorePatterns: ['/src/main/'],
    })

    expect(loosenedCoverage(current, config())).toEqual([
      "collectCoverageFrom adds the exclusion '!src/photonics-dmx/**'",
      "coveragePathIgnorePatterns adds '/src/main/'",
    ])
  })

  it('names an ignore pattern added', () => {
    const current = config({ coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/src/'] })

    expect(loosenedCoverage(current, config())).toEqual(["coveragePathIgnorePatterns adds '/src/'"])
  })

  it("passes an ignore pattern removed, and Jest's default named outright", () => {
    const base = config()
    delete base.coveragePathIgnorePatterns

    expect(
      loosenedCoverage(config({ coveragePathIgnorePatterns: ['/node_modules/'] }), base),
    ).toEqual([])
  })
})

describe('isMissingCommit', () => {
  it('reads the all-zero id and an empty one as no commit', () => {
    expect(isMissingCommit('0000000000000000000000000000000000000000')).toBe(true)
    expect(isMissingCommit('')).toBe(true)
    expect(isMissingCommit(undefined)).toBe(true)
    expect(isMissingCommit('a19a212d4f815a46458285dcdbcfcca57608964a')).toBe(false)
  })
})

describe('parsePushedRefs', () => {
  const zero = '0'.repeat(40)
  const local = 'a'.repeat(40)
  const remote = 'b'.repeat(40)

  it('reads each line git gives the pre-push hook', () => {
    const text = [
      `refs/heads/feature ${local} refs/heads/feature ${remote}`,
      `refs/heads/new ${local} refs/heads/new ${zero}`,
      '',
    ].join('\n')

    expect(parsePushedRefs(text)).toEqual([
      {
        localRef: 'refs/heads/feature',
        localSha: local,
        remoteRef: 'refs/heads/feature',
        remoteSha: remote,
      },
      { localRef: 'refs/heads/new', localSha: local, remoteRef: 'refs/heads/new', remoteSha: zero },
    ])
  })

  it('leaves out a push that deletes a remote ref', () => {
    expect(parsePushedRefs(`(delete) ${zero} refs/heads/gone ${remote}\n`)).toEqual([])
  })

  it('reads nothing from empty input', () => {
    expect(parsePushedRefs('')).toEqual([])
  })
})
