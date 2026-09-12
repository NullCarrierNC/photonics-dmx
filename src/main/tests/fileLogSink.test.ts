import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createFileLogSink } from '../logging/fileLogSink'
import type { LogEntry } from '../../shared/logger'

const entry = (e: Partial<LogEntry> & Pick<LogEntry, 'message'>): LogEntry => ({
  level: e.level ?? 'info',
  scope: e.scope ?? 'Test',
  message: e.message,
  data: e.data ?? [],
})

describe('createFileLogSink', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-logs-'))
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('creates the logs directory and appends a dated file', async () => {
    const t = new Date(2025, 3, 29, 10, 30, 0, 0).getTime()
    const clock = () => t
    const { sink, close } = createFileLogSink({ logsDir: tmpDir, clock })
    sink(entry({ message: 'hello world' }))
    await close()
    const p = path.join(tmpDir, 'photonics-2025-04-29.log')
    expect(fs.existsSync(p)).toBe(true)
    const text = fs.readFileSync(p, 'utf-8')
    expect(text).toContain('[info] [Test] hello world')
  })

  it('omits a data section when there is no extra data', async () => {
    const t = new Date(2025, 3, 29, 10, 0, 0, 0).getTime()
    const { sink, close } = createFileLogSink({ logsDir: tmpDir, clock: () => t })
    sink(entry({ message: 'no data' }))
    await close()
    const text = fs.readFileSync(path.join(tmpDir, 'photonics-2025-04-29.log'), 'utf-8')
    const line = text.trim().split('\n')[0]
    expect(line.endsWith('no data')).toBe(true)
  })

  it('rotates to a new file when the local date changes', async () => {
    let t = new Date(2025, 3, 29, 23, 0, 0, 0).getTime()
    const clock = () => t
    const { sink, close } = createFileLogSink({ logsDir: tmpDir, clock })
    sink(entry({ message: 'day 1' }))
    t = new Date(2025, 3, 30, 0, 0, 0, 0).getTime()
    sink(entry({ message: 'day 2' }))
    await close()
    const p1 = path.join(tmpDir, 'photonics-2025-04-29.log')
    const p2 = path.join(tmpDir, 'photonics-2025-04-30.log')
    expect(fs.readFileSync(p1, 'utf-8')).toContain('day 1')
    expect(fs.readFileSync(p2, 'utf-8')).toContain('day 2')
  })

  it('serializes Error in data with name, message, and stack', async () => {
    const t = new Date(2025, 0, 1, 12, 0, 0, 0).getTime()
    const { sink, close } = createFileLogSink({ logsDir: tmpDir, clock: () => t })
    const err = new Error('oops')
    sink({
      level: 'error',
      scope: 'Unit',
      message: 'failed',
      data: [err],
    })
    await close()
    const text = fs.readFileSync(path.join(tmpDir, 'photonics-2025-01-01.log'), 'utf-8')
    expect(text).toContain('"message":"oops"')
    expect(text).toMatch(/"stack":/)
  })

  it('prunes log files older than retention at startup', async () => {
    const oldPath = path.join(tmpDir, 'photonics-2020-01-01.log')
    fs.writeFileSync(oldPath, 'stale', 'utf-8')
    const now = new Date(2025, 5, 15, 12, 0, 0, 0).getTime()
    const clock = () => now
    const { close } = createFileLogSink({ logsDir: tmpDir, clock, retentionDays: 30 })
    expect(fs.existsSync(oldPath)).toBe(false)
    await close()
  })

  it('stops writing once a day reaches its size cap', async () => {
    const t = new Date(2025, 3, 29, 10, 30, 0, 0).getTime()
    const { sink, close } = createFileLogSink({
      logsDir: tmpDir,
      clock: () => t,
      maxBytesPerDay: 400,
    })

    for (let i = 0; i < 200; i++) {
      sink(entry({ message: `line ${i} with enough text to pass the cap quickly` }))
    }
    await close()

    const written = fs.readFileSync(path.join(tmpDir, 'photonics-2025-04-29.log'), 'utf-8')
    expect(written.length).toBeLessThan(1000)
    expect(written).toContain('line 0')
    expect(written).not.toContain('line 199')
  })

  it('keeps writing when the cap is not reached', async () => {
    const t = new Date(2025, 3, 29, 10, 30, 0, 0).getTime()
    const { sink, close } = createFileLogSink({
      logsDir: tmpDir,
      clock: () => t,
      maxBytesPerDay: 1024 * 1024,
    })

    for (let i = 0; i < 50; i++) {
      sink(entry({ message: `line ${i}` }))
    }
    await close()

    const written = fs.readFileSync(path.join(tmpDir, 'photonics-2025-04-29.log'), 'utf-8')
    expect(written).toContain('line 0')
    expect(written).toContain('line 49')
  })

  it('keeps recording errors after the cap has stopped everything else', async () => {
    // Whatever filled the file is usually the thing being diagnosed, so a cap that silences errors
    // too takes the account of it with them.
    const t = new Date(2025, 3, 29, 10, 30, 0, 0).getTime()
    const { sink, close } = createFileLogSink({
      logsDir: tmpDir,
      clock: () => t,
      maxBytesPerDay: 400,
    })

    for (let i = 0; i < 200; i++) {
      sink(entry({ message: `chatter ${i} with enough text to pass the cap quickly` }))
    }
    sink(entry({ level: 'error', message: 'the thing that actually went wrong' }))
    await close()

    const written = fs.readFileSync(path.join(tmpDir, 'photonics-2025-04-29.log'), 'utf-8')
    expect(written).not.toContain('chatter 199')
    expect(written).toContain('the thing that actually went wrong')
  })

  it('stops recording errors too once the reserve is spent', async () => {
    const t = new Date(2025, 3, 29, 10, 30, 0, 0).getTime()
    const { sink, close } = createFileLogSink({
      logsDir: tmpDir,
      clock: () => t,
      maxBytesPerDay: 200,
      errorReserveBytes: 400,
    })

    for (let i = 0; i < 400; i++) {
      sink(entry({ level: 'error', message: `error ${i} with enough text to spend the reserve` }))
    }
    await close()

    const written = fs.readFileSync(path.join(tmpDir, 'photonics-2025-04-29.log'), 'utf-8')
    expect(written).toContain('error 0')
    expect(written).not.toContain('error 399')
    expect(written.length).toBeLessThan(1200)
  })

  it('opens no further stream once it has been closed', async () => {
    // Close is the last word: nothing after it opens a stream, because nobody is left to end one.
    const t = new Date(2025, 3, 29, 10, 30, 0, 0).getTime()
    const { sink, close } = createFileLogSink({ logsDir: tmpDir, clock: () => t })

    sink(entry({ message: 'before the close' }))
    await close()

    const logFile = path.join(tmpDir, 'photonics-2025-04-29.log')
    const written = fs.readFileSync(logFile, 'utf-8')
    expect(written).toContain('before the close')

    // Taking the file away is how a reopened stream gives itself up, since opening one recreates it.
    fs.rmSync(logFile)
    sink(entry({ level: 'error', message: 'after the close' }))
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))

    expect(fs.existsSync(logFile)).toBe(false)
  })
})
