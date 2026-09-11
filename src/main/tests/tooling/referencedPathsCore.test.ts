import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  commandsFromPackageJson,
  commandsFromHook,
  commandsFromWorkflow,
  pathsInCommand,
  untrackedPaths,
} = require('../../../../tools/referencedPathsCore.cjs') as {
  commandsFromPackageJson: (text: string) => string[]
  commandsFromHook: (text: string) => string[]
  commandsFromWorkflow: (text: string) => string[]
  pathsInCommand: (command: string) => string[]
  untrackedPaths: (commands: string[], tracked: Set<string>) => string[]
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
