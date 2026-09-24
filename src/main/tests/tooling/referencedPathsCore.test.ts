import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  commandsFromPackageJson,
  commandsFromLintStaged,
  commandsFromHook,
  commandsFromWorkflow,
  pathsInCommand,
  pathsFromJestConfig,
  pathsFromTsconfig,
  untrackedPaths,
  unmatchedPatterns,
  unmatchedIncludes,
} = require('../../../../tools/referencedPathsCore.cjs') as {
  commandsFromPackageJson: (text: string) => string[]
  commandsFromLintStaged: (text: string) => string[]
  commandsFromHook: (text: string) => string[]
  commandsFromWorkflow: (text: string) => string[]
  pathsInCommand: (command: string) => string[]
  pathsFromJestConfig: (config: Record<string, unknown>) => string[]
  pathsFromTsconfig: (text: string) => { required: string[]; included: string[] }
  untrackedPaths: (commands: string[], tracked: Set<string>) => string[]
  unmatchedPatterns: (patterns: string[], tracked: Set<string>) => string[]
  unmatchedIncludes: (
    patterns: string[],
    tracked: Set<string>,
    exists: (path: string) => boolean,
  ) => string[]
}
/* eslint-enable @typescript-eslint/no-require-imports */

describe('pathsInCommand', () => {
  it('names the file a node or ts-node command runs', () => {
    expect(pathsInCommand('node tools/size-budget.mjs')).toEqual(['tools/size-budget.mjs'])
    expect(
      pathsInCommand('npx ts-node --project tsconfig.sim.json tools/node-graph-prettier.ts'),
    ).toEqual(['tsconfig.sim.json', 'tools/node-graph-prettier.ts'])
  })

  it('reads the value of a flag written with an equals sign', () => {
    expect(pathsInCommand('tsc --project=tsconfig.web.json')).toEqual(['tsconfig.web.json'])
  })

  it('drops a leading ./ so the path matches what git lists', () => {
    expect(pathsInCommand('node ./tools/any-budget.mjs')).toEqual(['tools/any-budget.mjs'])
  })

  it('reads a path that ends a command chain', () => {
    expect(pathsInCommand('npm run build && node tools/packaged-files-check.mjs;')).toEqual([
      'tools/packaged-files-check.mjs',
    ])
  })

  it('leaves out what is not a file in the repository', () => {
    expect(pathsInCommand('eslint . --fix')).toEqual([])
    expect(pathsInCommand('prettier --check "src/**/*.ts"')).toEqual([])
    expect(pathsInCommand('curl https://example.com/install.sh')).toEqual([])
    expect(pathsInCommand('${{ matrix.build }}')).toEqual([])
    expect(pathsInCommand('node node_modules/x/cli.js')).toEqual([])
  })
})

describe('commandsFromPackageJson', () => {
  it('takes every script value', () => {
    const text = JSON.stringify({ name: 'x', scripts: { a: 'node tools/a.mjs', b: 'jest' } })

    expect(commandsFromPackageJson(text)).toEqual(['node tools/a.mjs', 'jest'])
  })

  it('has nothing to offer a package with no scripts', () => {
    expect(commandsFromPackageJson('{"name":"x"}')).toEqual([])
  })
})

describe('commandsFromLintStaged', () => {
  it('takes every command lint-staged runs, from a string or a list', () => {
    const text = JSON.stringify({
      'lint-staged': {
        '*.ts': 'eslint --fix',
        '*.json': ['prettier --write', 'node tools/check-json.mjs'],
      },
    })

    expect(commandsFromLintStaged(text)).toEqual([
      'eslint --fix',
      'prettier --write',
      'node tools/check-json.mjs',
    ])
  })

  it('has nothing to offer a package with no lint-staged config', () => {
    expect(commandsFromLintStaged('{"name":"x"}')).toEqual([])
  })
})

describe('pathsFromJestConfig', () => {
  it('reads the setup files of the config and of each project', () => {
    const config = {
      setupFiles: ['<rootDir>/src/env.ts'],
      globalSetup: './tools/global-setup.js',
      projects: [
        { setupFilesAfterEnv: ['<rootDir>/src/tests/jest.setup.ts'] },
        {
          setupFilesAfterEnv: [
            '<rootDir>/src/tests/jest.setup.ts',
            '<rootDir>/src/renderer/tests/setup.ts',
          ],
        },
      ],
    }

    expect(pathsFromJestConfig(config)).toEqual([
      'src/env.ts',
      'tools/global-setup.js',
      'src/tests/jest.setup.ts',
      'src/renderer/tests/setup.ts',
    ])
  })

  it('leaves out a setup file named as a package', () => {
    expect(pathsFromJestConfig({ setupFilesAfterEnv: ['@testing-library/jest-dom'] })).toEqual([])
  })
})

describe('pathsFromTsconfig', () => {
  it('reads files, include, a relative extends and references, comments and all', () => {
    const text = `{
      // The base this builds on.
      "extends": "./tsconfig.web.json",
      "files": ["src/env.d.ts"],
      "include": ["src/main/**/*", "./tools/*.ts",],
      "references": [{ "path": "./tsconfig.node.json" }],
    }`

    expect(pathsFromTsconfig(text)).toEqual({
      required: ['tsconfig.web.json', 'src/env.d.ts', 'tsconfig.node.json'],
      included: ['src/main/**/*', 'tools/*.ts'],
    })
  })

  it('leaves out a base config extended from a package', () => {
    expect(
      pathsFromTsconfig('{ "extends": "@electron-toolkit/tsconfig/tsconfig.node.json" }'),
    ).toEqual({ required: [], included: [] })
  })
})

describe('unmatchedPatterns', () => {
  const tracked = new Set([
    'electron.vite.config.ts',
    'src/main/index.ts',
    'src/renderer/src/App.tsx',
    'src/tests/jest.setup.ts',
  ])

  it('passes a tracked file, a directory holding one, and a glob matching one', () => {
    expect(
      unmatchedPatterns(
        [
          'src/tests/jest.setup.ts',
          'src/renderer',
          'src/main/**/*',
          'electron.vite.config.*',
          'src/renderer/src/**/*.tsx',
        ],
        tracked,
      ),
    ).toEqual([])
  })

  it('reports a file, a directory or a glob with nothing committed behind it', () => {
    expect(
      unmatchedPatterns(['src/tests/missing.ts', 'scripts', 'scripts/**/*.ts'], tracked),
    ).toEqual(['src/tests/missing.ts', 'scripts', 'scripts/**/*.ts'])
  })

  it('lists a pattern once however often it is named', () => {
    expect(unmatchedPatterns(['scripts/a.ts', 'scripts/a.ts'], tracked)).toEqual(['scripts/a.ts'])
  })
})

describe('unmatchedIncludes', () => {
  const tracked = new Set(['src/main/index.ts'])
  const onDisk = new Set(['', 'src', 'src/main', 'scripts', 'src/env.d.ts'])
  const exists = (path: string) => onDisk.has(path)

  it('reports an include with files on this machine and nothing committed behind it', () => {
    expect(
      unmatchedIncludes(['scripts/**/*.ts', 'src/env.d.ts', 'build.config.*'], tracked, exists),
    ).toEqual(['scripts/**/*.ts', 'src/env.d.ts', 'build.config.*'])
  })

  it('passes an include matching nothing here either, which no typecheck reads', () => {
    expect(unmatchedIncludes(['src/mocks/**/*', 'src/gone.d.ts'], tracked, exists)).toEqual([])
  })

  it('passes an include with committed files behind it', () => {
    expect(unmatchedIncludes(['src/main/**/*'], tracked, exists)).toEqual([])
  })
})

describe('commandsFromHook', () => {
  it('keeps the commands and drops comments and blank lines', () => {
    expect(commandsFromHook('# checks before pushing\n\nnpm run lint:check\n')).toEqual([
      'npm run lint:check',
    ])
  })
})

describe('commandsFromWorkflow', () => {
  const workflow = [
    'jobs:',
    '  checks:',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      # this comment names out/renderer/index.html, which is build output',
    '      - name: Budget',
    '        run: node tools/size-budget.mjs',
    '      - name: Several',
    '        run: |',
    '          npm ci',
    '          # a comment inside the block',
    '          node tools/any-budget.mjs',
    '      - name: After',
    '        run: npm test',
  ].join('\n')

  it('takes single-line and block commands in order', () => {
    expect(commandsFromWorkflow(workflow)).toEqual([
      'node tools/size-budget.mjs',
      'npm ci',
      'node tools/any-budget.mjs',
      'npm test',
    ])
  })

  it('reads nothing from uses lines or comments', () => {
    const paths = commandsFromWorkflow(workflow).flatMap(pathsInCommand)

    expect(paths).not.toContain('out/renderer/index.html')
  })

  it('reads a workflow checked out with Windows line endings', () => {
    expect(commandsFromWorkflow(workflow.replace(/\n/g, '\r\n'))).toContain('npm test')
  })
})

describe('untrackedPaths', () => {
  it('reports a script that runs a file git does not track', () => {
    // A fresh clone carries only what git tracks, so this is the file that works for whoever wrote
    // the script and for nobody else.
    const commands = ['node scripts/gen-something.mjs', 'node tools/size-budget.mjs']
    const tracked = new Set(['tools/size-budget.mjs'])

    expect(untrackedPaths(commands, tracked)).toEqual(['scripts/gen-something.mjs'])
  })

  it('passes when everything run is tracked', () => {
    expect(untrackedPaths(['node tools/a.mjs'], new Set(['tools/a.mjs']))).toEqual([])
  })

  it('lists a missing path once however often it is named', () => {
    const commands = ['node tools/gone.mjs', 'node tools/gone.mjs --write']

    expect(untrackedPaths(commands, new Set())).toEqual(['tools/gone.mjs'])
  })
})
