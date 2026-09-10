/**
 * Central logging facade: one sink, optional scope prefix, level filter via PHOTONICS_LOG_LEVEL
 * (debug | info | warn | error). Default minimum level is `info`, and a scope can carry its own.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogEntry = {
  level: LogLevel
  scope: string
  message: string
  data: unknown[]
}

export type LogSink = (entry: LogEntry) => void

const levelOrder: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

let minLevel: LogLevel = parseMinLevelFromEnv()
let currentSink: LogSink = consoleLogSink

/** Scopes that answer to their own floor rather than the process-wide one. */
const scopeMinLevels = new Map<string, LogLevel>()

function parseMinLevelFromEnv(): LogLevel {
  if (typeof process === 'undefined' || !process.env) {
    return 'info'
  }
  const v = process.env.PHOTONICS_LOG_LEVEL?.toLowerCase()
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') {
    return v
  }
  return 'info'
}

/** Default sink: one console method per log level, same as previous `defaultConsoleSink`. */
export function consoleLogSink(entry: LogEntry): void {
  const line = `[${entry.scope}] ${entry.message}`
  const rest = entry.data
  switch (entry.level) {
    case 'debug':
      console.debug(line, ...rest)
      break
    case 'info':
      console.info(line, ...rest)
      break
    case 'warn':
      console.warn(line, ...rest)
      break
    case 'error':
      console.error(line, ...rest)
      break
  }
}

function emit(entry: LogEntry): void {
  const floor = scopeMinLevels.get(entry.scope) ?? minLevel
  if (levelOrder[entry.level] < levelOrder[floor]) {
    return
  }
  currentSink(entry)
}

export type Logger = {
  debug: (message: string, ...data: unknown[]) => void
  info: (message: string, ...data: unknown[]) => void
  warn: (message: string, ...data: unknown[]) => void
  error: (message: string, ...data: unknown[]) => void
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, ...data) => emit({ level: 'debug', scope, message, data }),
    info: (message, ...data) => emit({ level: 'info', scope, message, data }),
    warn: (message, ...data) => emit({ level: 'warn', scope, message, data }),
    error: (message, ...data) => emit({ level: 'error', scope, message, data }),
  }
}

/**
 * Replace the process-wide log sink (e.g. for tests). Pass the default behavior back with `undefined`.
 */
export function setLogSink(sink: LogSink | undefined): void {
  currentSink = sink ?? consoleLogSink
}

/**
 * Minimum level for logs that reach the sink. Does not apply to custom sinks that ignore `minLevel`
 * (tests should use `setLogSink` that records all entries, or call this with `debug` while capturing).
 */
export function setMinLogLevel(level: LogLevel): void {
  minLevel = level
}

/**
 * Minimum level for one scope, in place of the process-wide floor.
 *
 * A single floor has to answer to the loudest scope in the process, which puts anything that logs
 * per frame in charge of what a quiet scope is allowed to record. This lets a scope whose lines are
 * a handful per launch keep them without lifting the floor under everything else. Pass `undefined`
 * to hand the scope back to the process-wide floor.
 */
export function setScopeMinLogLevel(scope: string, level: LogLevel | undefined): void {
  if (level === undefined) {
    scopeMinLevels.delete(scope)
    return
  }
  scopeMinLevels.set(scope, level)
}

/** Restore default sink and re-read PHOTONICS_LOG_LEVEL and default min level. */
export function resetLogConfiguration(): void {
  currentSink = consoleLogSink
  minLevel = parseMinLevelFromEnv()
  scopeMinLevels.clear()
}
