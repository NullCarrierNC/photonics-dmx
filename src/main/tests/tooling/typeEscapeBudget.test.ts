import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = join(__dirname, '../../../..')
const TOOLS = [
  'type-escape-budget.mjs',
  'ruleBudgetCore.mjs',
  'ruleReportsCore.cjs',
  'countBudgetCore.cjs',
  'typeEscapesCore.cjs',
]
const BUDGET = 'metrics/type-escape-budget.txt'

let dir: string

/** Records `escapes` and `never-casts` as the budget file holds them. */
function budget(escapes: number, neverCasts: number): void {
  writeFileSync(
    join(dir, BUDGET),
    `escapes ${escapes}\nnever-casts ${neverCasts}\nAuto-generated\n`,
  )
}

function source(text: string): void {
  writeFileSync(join(dir, 'src', 'example.ts'), `${text}\n`)
}

function run(): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['tools/type-escape-budget.mjs'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: join(REPO, 'node_modules') },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'type-escape-budget-'))
  mkdirSync(join(dir, 'tools'))
  mkdirSync(join(dir, 'src'))
  mkdirSync(join(dir, 'metrics'))
  for (const file of TOOLS) copyFileSync(join(REPO, 'tools', file), join(dir, 'tools', file))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('type-escape budget', () => {
  it('holds casts through unknown and single casts to never to their own counts', () => {
    source('const a = x as unknown as number\nconst b = y as never')
    budget(1, 1)

    const result = run()

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Type escapes: 1 (budget 1) - ok')
    expect(result.stdout).toContain('Type never-casts: 1 (budget 1) - ok')
  })

  it('fails when a single cast to never is added, naming never-casts', () => {
    source('const a = x as unknown as number\nconst b = y as never\nconst c = z as never')
    budget(1, 1)

    const result = run()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Type never-casts count 2 exceeds budget 1')
  })

  it('refuses a budget file that records one count', () => {
    source('const a = x as unknown as number')
    writeFileSync(join(dir, BUDGET), '1\n')

    const result = run()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('`escapes <count>`, `never-casts <count>`')
  })
})
