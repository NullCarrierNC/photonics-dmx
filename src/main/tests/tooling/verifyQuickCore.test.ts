import { describe, expect, it } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  planChecks,
  parseNameStatus,
  projectsFor,
  pushGateSteps,
} = require('../../../../tools/verifyQuickCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

type Change = { status: string; path: string }
type Plan = {
  mode: 'quick' | 'full'
  reasons: string[]
  formatFiles: string[]
  lintFiles: string[]
  typecheckProjects: string[]
  testFiles: string[]
  dependencyChecks: boolean
}

type Step = { name: string; command: string; args: string[]; note?: string }
type PushGate = { steps: Step[]; skipped: Array<{ name: string; reason: string }> }

const plan = (changes: Change[]): Plan => planChecks(changes)
const modified = (...paths: string[]): Change[] => paths.map((path) => ({ status: 'M', path }))

describe('planChecks', () => {
  it('keeps a source and test change to the quick set with the files it touched', () => {
    const result = plan(
      modified(
        'src/photonics-dmx/processors/AudioCueProcessor.ts',
        'src/photonics-dmx/tests/processors/AudioCueProcessor.idle.test.ts',
      ),
    )

    expect(result.mode).toBe('quick')
    expect(result.reasons).toEqual([])
    expect(result.lintFiles).toHaveLength(2)
    expect(result.testFiles).toHaveLength(2)
    expect(result.dependencyChecks).toBe(false)
  })

  it.each([
    ['package.json'],
    ['package-lock.json'],
    ['jest.config.js'],
    ['eslint.config.mjs'],
    ['electron.vite.config.ts'],
    ['tsconfig.web.json'],
    ['tools/size-budget.mjs'],
    ['metrics/explicit-any-budget.txt'],
    ['.husky/pre-push'],
    ['.github/workflows/verify.yml'],
    ['resources/defaults/node-data/cues/audio/audio-motion-default.json'],
    ['src/photonics-dmx/tests/jest.setup.ts'],
    ['src/renderer/src/tests/setup.ts'],
    ['src/main/__mocks__/electron.ts'],
  ])('takes the full set when %s changes', (path) => {
    const result = plan(modified(path))

    expect(result.mode).toBe('full')
    expect(result.reasons.join('\n')).toContain(path)
  })

  it('takes the full set for a deleted or renamed module', () => {
    expect(plan([{ status: 'D', path: 'src/main/controllers/DebugMonitor.ts' }]).mode).toBe('full')
    expect(plan([{ status: 'R', path: 'src/main/old.ts' }]).mode).toBe('full')
  })

  it('leaves a deleted file out of the files it lints and tests', () => {
    const result = plan([
      { status: 'D', path: 'src/main/controllers/DebugMonitor.ts' },
      { status: 'M', path: 'src/main/controllers/ControllerManager.ts' },
    ])

    expect(result.lintFiles).toEqual(['src/main/controllers/ControllerManager.ts'])
    expect(result.testFiles).toEqual(['src/main/controllers/ControllerManager.ts'])
  })

  it('stays quick for the size and type-escape budgets, which it runs itself', () => {
    expect(plan(modified('metrics/size-budget.txt', 'metrics/type-escape-budget.txt')).mode).toBe(
      'quick',
    )
  })

  it('runs the dependency checks only when a package file changes', () => {
    expect(plan(modified('package-lock.json')).dependencyChecks).toBe(true)
    expect(plan(modified('src/main/menu.ts')).dependencyChecks).toBe(false)
  })

  it('formats data and docs files but lints and tests only code', () => {
    const result = plan(modified('README.md', 'src/shared/ipcChannels.ts', 'docs/notes.md'))

    expect(result.formatFiles).toEqual(['README.md', 'src/shared/ipcChannels.ts'])
    expect(result.lintFiles).toEqual(['src/shared/ipcChannels.ts'])
    expect(result.testFiles).toEqual(['src/shared/ipcChannels.ts'])
  })

  it('typechecks each project in a fixed order, once', () => {
    const result = plan(modified('src/renderer/src/App.tsx', 'src/main/menu.ts'))

    expect(result.typecheckProjects).toEqual(['node', 'web', 'test'])
  })
})

describe('projectsFor', () => {
  it.each([
    ['src/renderer/src/pages/Status.tsx', ['web', 'test']],
    ['src/main/menu.ts', ['node', 'test']],
    ['src/preload/index.ts', ['node', 'test']],
    ['src/preload/index.d.ts', ['node', 'web', 'test']],
    ['src/photonics-dmx/controllers/DmxPublisher.ts', ['node', 'web', 'test']],
    ['src/services/configuration/ConfigFile.ts', ['node', 'web', 'test']],
    ['src/shared/ipcChannels.ts', ['node', 'web', 'test']],
    ['src/main/tests/menu.test.ts', ['test']],
    ['src/photonics-dmx/tests/helpers/rb3StreamHarness.ts', ['test']],
    ['src/renderer/src/components/AppPageRouter.test.tsx', ['test']],
    ['README.md', []],
  ])('compiles %s under %j', (path, projects) => {
    expect(projectsFor(path)).toEqual(projects)
  })
})

describe('parseNameStatus', () => {
  it('reads plain rows and splits a rename into the old path and the new one', () => {
    const text = [
      'M\tsrc/main/menu.ts',
      'A\ttools/verify-quick.mjs',
      'D\tsrc/photonics-dmx/controllers/sequencer/DebugMonitor.ts',
      'R087\tsrc/main/old.ts\tsrc/main/new.ts',
      '',
    ].join('\n')

    expect(parseNameStatus(text)).toEqual([
      { status: 'M', path: 'src/main/menu.ts' },
      { status: 'A', path: 'tools/verify-quick.mjs' },
      { status: 'D', path: 'src/photonics-dmx/controllers/sequencer/DebugMonitor.ts' },
      { status: 'R', path: 'src/main/old.ts' },
      { status: 'A', path: 'src/main/new.ts' },
    ])
  })
})

describe('pushGateSteps', () => {
  const hook = [
    'pushed=$(cat)',
    '# The checks read the working tree.',
    'printf \'%s\\n\' "$pushed" | npm run pushed:check && npm run lint:check && ' +
      'npx electron-vite build && npm run knip:budget && npm run cue-sim:check && ' +
      'printf \'%s\\n\' "$pushed" | npm run coverage:check -- --pushed && ' +
      'npm run audit:check && npm run test:coverage -- --randomize',
  ].join('\n')

  it('runs each check the hook chains, in order', () => {
    const gate: PushGate = pushGateSteps(hook)

    expect(gate.steps.map(({ command, args }) => [command, ...args].join(' '))).toEqual([
      'npm run lint:check',
      'npx electron-vite build',
      'npm run knip:budget',
      'npm run cue-sim:check',
      'npm run coverage:check',
      'npm run audit:check',
      'npm run test:coverage -- --randomize',
    ])
  })

  it('skips the pushed-commit check and runs the coverage guard on the working tree', () => {
    const gate: PushGate = pushGateSteps(hook)

    expect(gate.skipped).toEqual([
      { name: 'npm run pushed:check', reason: 'it reads the refs of a push from stdin' },
    ])
    expect(gate.steps.find((step) => step.name === 'npm run coverage:check')?.note).toBe(
      'held to HEAD and the branch base, without the refs of a push',
    )
  })

  it("reads the repository's pre-push hook into the checks a push runs", () => {
    const text = readFileSync(join(__dirname, '../../../../.husky/pre-push'), 'utf8')
    const names = pushGateSteps(text).steps.map((step: Step) => step.name)

    expect(names).toEqual(
      expect.arrayContaining([
        'npm run lint:check',
        'npm run format:check',
        'npx electron-vite build',
        'npm run knip:budget',
        'npm run coverage:check',
        'npm run audit:check',
        'npm run test:coverage -- --randomize',
      ]),
    )
  })
})
