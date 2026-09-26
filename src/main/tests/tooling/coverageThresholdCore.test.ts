import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  loosenedCoverage,
  isMissingCommit,
  parsePushedRefs,
  commandLineOverrides,
  testCoverageScriptProblems,
  importsOfUncounted,
  coverageIgnoreHints,
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

describe('loosenedCoverage on the tests Jest runs', () => {
  it('names a test path ignore pattern a project adds', () => {
    const current = withProject(0, { testPathIgnorePatterns: ['/node_modules/', '/src/main/'] })

    expect(loosenedCoverage(current, config())).toEqual([
      "engine: testPathIgnorePatterns adds '/src/main/'",
    ])
  })

  it('names a testRegex or testMatch entry dropped', () => {
    const base = withProject(0, { testRegex: ['\\.test\\.ts$', '\\.spec\\.ts$'] })
    const current = withProject(0, { testRegex: ['\\.test\\.ts$'] })
    const matchBase = withProject(1, { testMatch: ['**/*.test.tsx', '**/*.spec.tsx'] })
    const matchCurrent = withProject(1, { testMatch: ['**/*.test.tsx'] })

    expect(loosenedCoverage(current, base)).toEqual(["engine: testRegex drops '\\.spec\\.ts$'"])
    expect(loosenedCoverage(matchCurrent, matchBase)).toEqual([
      "renderer: testMatch drops '**/*.spec.tsx'",
    ])
  })

  it("names Jest's default testMatch dropped when a narrower testRegex replaces it", () => {
    const current = withProject(1, { testRegex: 'renderer/.*\\.test\\.tsx$' })

    expect(loosenedCoverage(current, config())).toEqual([
      "renderer: testMatch drops '**/__tests__/**/*.?([mc])[jt]s?(x)'",
      "renderer: testMatch drops '**/?(*.)+(spec|test).?([mc])[jt]s?(x)'",
    ])
  })

  it('names a root narrowed and passes one widened', () => {
    const base = withProject(0, { roots: ['<rootDir>/src'] })

    expect(loosenedCoverage(withProject(0, { roots: ['<rootDir>/src/main'] }), base)).toEqual([
      "engine: roots drops '<rootDir>/src'",
    ])
    expect(loosenedCoverage(withProject(0, { roots: ['<rootDir>'] }), base)).toEqual([])
  })

  it('names a project dropped', () => {
    const base = config()
    const current = config({ projects: [(base.projects as Config[])[0]] })

    expect(loosenedCoverage(current, base)).toEqual(["projects drops 'renderer'"])
  })

  it('passes a test path ignore pattern removed and a project added', () => {
    const base = withProject(0, { testPathIgnorePatterns: ['/node_modules/', '/src/renderer/'] })
    const current = config({
      projects: [...(config().projects as Config[]), { displayName: 'tools' }],
    })

    expect(loosenedCoverage(current, base)).toEqual([])
  })
})

describe('loosenedCoverage across a move to projects', () => {
  const testRegex = '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$'
  const topLevel: Config = { testRegex, roots: ['<rootDir>/src'] }
  const engine = (overrides: Config = {}): Config => ({
    displayName: 'engine',
    testRegex,
    roots: ['<rootDir>/src'],
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/renderer/'],
    ...overrides,
  })
  const renderer = (overrides: Config = {}): Config => ({
    displayName: 'renderer',
    testRegex,
    roots: ['<rootDir>/src/renderer'],
    ...overrides,
  })

  it('passes projects that split the folders between them', () => {
    expect(loosenedCoverage({ projects: [engine(), renderer()] }, topLevel)).toEqual([])
  })

  it('names a testRegex entry no project keeps', () => {
    const current = { projects: [engine({ testRegex: '\\.test\\.ts$' }), renderer()] }

    expect(loosenedCoverage(current, topLevel)).toEqual([`engine: testRegex drops '${testRegex}'`])
  })

  it('names an ignore pattern no other project runs the tests under', () => {
    const current = {
      projects: [
        engine({ testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/main/'] }),
        renderer(),
      ],
    }

    expect(loosenedCoverage(current, topLevel)).toEqual([
      "engine: testPathIgnorePatterns adds '<rootDir>/src/main/'",
    ])
  })

  it('names an ignore pattern that matches more than the other project folder', () => {
    const current = {
      projects: [
        engine({ testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/render.*/'] }),
        renderer(),
      ],
    }

    expect(loosenedCoverage(current, topLevel)).toEqual([
      "engine: testPathIgnorePatterns adds '<rootDir>/src/render.*/'",
    ])
  })

  it('names a root no project holds', () => {
    const current = { projects: [engine({ roots: ['<rootDir>/src/main'] }), renderer()] }

    expect(loosenedCoverage(current, topLevel)).toEqual(["roots drops '<rootDir>/src'"])
  })

  it('passes projects folded back into the top level', () => {
    expect(loosenedCoverage(topLevel, { projects: [engine(), renderer()] })).toEqual([])
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

describe('commandLineOverrides', () => {
  it('names a threshold passed to Jest on the command line', () => {
    expect(commandLineOverrides(`jest --coverage --coverageThreshold='{}'`)).toEqual([
      "`jest --coverage --coverageThreshold='{}'` passes --coverageThreshold to Jest",
    ])
  })

  it('reads each command in a hook chain that runs Jest through npm', () => {
    const hook =
      'npm run lint:check && npm run test:coverage -- --randomize --collect-coverage-from=src/a.ts'

    expect(commandLineOverrides(hook)).toEqual([
      '`npm run test:coverage -- --randomize --collect-coverage-from=src/a.ts` passes --collect-coverage-from to Jest',
    ])
  })

  it('names another config, another root and coverage switched off', () => {
    expect(commandLineOverrides('npx jest -c other.config.js --rootDir src/main')).toHaveLength(2)
    expect(commandLineOverrides('jest --coverage=false')).toHaveLength(1)
    expect(commandLineOverrides('npm test -- --no-coverage')).toHaveLength(1)
  })

  it('passes options that only choose which tests run', () => {
    expect(
      commandLineOverrides('npm run test:coverage -- --randomize --selectProjects engine'),
    ).toEqual([])
  })

  it('leaves out commands that do not run Jest', () => {
    expect(
      commandLineOverrides("bash -c 'echo --config'\nnode tools/check.mjs --config x"),
    ).toEqual([])
  })
})

describe('testCoverageScriptProblems', () => {
  it('passes a test:coverage script that runs Jest with coverage', () => {
    expect(testCoverageScriptProblems({ 'test:coverage': 'jest --coverage' })).toEqual([])
  })

  it('names a test:coverage script that does not collect coverage', () => {
    expect(testCoverageScriptProblems({ 'test:coverage': 'jest' })).toEqual([
      'test:coverage (`jest`) does not run Jest with --coverage',
    ])
    expect(testCoverageScriptProblems({})).toEqual(['package.json has no test:coverage script'])
  })
})

describe('importsOfUncounted', () => {
  const settings = config({
    moduleNameMapper: { '^@renderer/(.*)$': '<rootDir>/src/renderer/src/$1' },
    collectCoverageFrom: [
      'src/**/*.{ts,tsx}',
      '!src/**/tests/**',
      '!src/**/*.test.{ts,tsx}',
      '!src/**/*.spec.{ts,tsx}',
      '!src/**/*.d.ts',
    ],
  })
  const sources = (files: Record<string, string>) => new Map(Object.entries(files))

  it('names a source file that loads code moved into a tests directory', () => {
    const files = sources({
      'src/main/sender.ts': "import { open } from './tests/port'\nexport const run = open",
      'src/main/tests/port.ts': 'export const open = () => 1',
    })

    expect(importsOfUncounted(files, settings)).toEqual([
      'src/main/sender.ts loads src/main/tests/port.ts, which coverage leaves out',
    ])
  })

  it('names code renamed to a spec file and code reached through an alias', () => {
    const files = sources({
      'src/main/a.ts': "export * from './port.spec'",
      'src/main/port.spec.ts': 'export const open = 1',
      'src/renderer/src/page.tsx': "const m = await import('@renderer/tests/util')",
      'src/renderer/src/tests/util.ts': 'export const u = 1',
    })

    expect(importsOfUncounted(files, settings)).toEqual([
      'src/main/a.ts loads src/main/port.spec.ts, which coverage leaves out',
      'src/renderer/src/page.tsx loads src/renderer/src/tests/util.ts, which coverage leaves out',
    ])
  })

  it('passes a test loading source, a type-only import and a declaration file', () => {
    const files = sources({
      'src/main/a.ts': "import type { T } from './tests/types'\nimport './env'\nexport const a = 1",
      'src/main/env.d.ts': 'declare const x: number',
      'src/main/tests/types.ts': 'export type T = number',
      'src/main/tests/a.test.ts': "import { a } from '../a'",
    })

    expect(importsOfUncounted(files, settings)).toEqual([])
  })
})

describe('coverageIgnoreHints', () => {
  it('names each ignore hint in a file coverage counts', () => {
    const files = new Map([
      ['src/main/a.ts', 'const a = 1\n/* v8 ignore next */\nif (a) run()'],
      ['src/main/b.ts', '/* c8 ignore start */\nrun()\n/* c8 ignore stop */'],
      ['src/main/c.ts', '/* istanbul ignore else */'],
    ])

    expect(coverageIgnoreHints(files, config())).toEqual([
      'src/main/a.ts:2 carries a coverage ignore hint',
      'src/main/b.ts:1 carries a coverage ignore hint',
      'src/main/b.ts:3 carries a coverage ignore hint',
      'src/main/c.ts:1 carries a coverage ignore hint',
    ])
  })

  it('passes a hint in a test file and a source file without one', () => {
    const files = new Map([
      ['src/main/tests/a.test.ts', '/* v8 ignore next */'],
      ['src/main/a.ts', '// the provider ignores nothing here'],
    ])

    expect(coverageIgnoreHints(files, config())).toEqual([])
  })
})
