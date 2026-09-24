/** The wrapper every save writes around a file's data, stamped with the build's format version. */
export interface ConfigWithVersion<T> {
  version: number
  data: T
}

/**
 * A parsed file split into its format version and contents. A file without the envelope is legacy
 * and reads as version 0, with its whole body as the contents.
 */
export type StoredEnvelope<T> =
  | { ok: true; versioned: true; version: number; data: T }
  | { ok: true; versioned: false; version: 0; raw: unknown }
  | { ok: false; schemaText: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON parse result before validation
function isVersionedFormat<T>(parsed: any): parsed is ConfigWithVersion<T> {
  return parsed && typeof parsed === 'object' && 'version' in parsed && 'data' in parsed
}

/** A version a build could have stamped: a whole number from 0 up. */
function isStoredVersion(version: unknown): version is number {
  return typeof version === 'number' && Number.isSafeInteger(version) && version >= 0
}

export function readEnvelope<T>(parsed: unknown): StoredEnvelope<T> {
  if (!isVersionedFormat<T>(parsed)) {
    return { ok: true, versioned: false, version: 0, raw: parsed }
  }
  // Migration walks up one whole version at a time, so it needs a whole number to start from.
  if (!isStoredVersion(parsed.version)) {
    return {
      ok: false,
      schemaText: `version must be a whole number of 0 or more, got ${JSON.stringify(parsed.version)}`,
    }
  }
  return { ok: true, versioned: true, version: parsed.version, data: parsed.data }
}

/** Walks `data` up from one version to another, one whole version per step. */
export function migrateStepwise<T>(
  data: T,
  fromVersion: number,
  toVersion: number,
  step: (data: T, fromVersion: number, toVersion: number) => T,
): T {
  let migrated = data
  for (let version = fromVersion + 1; version <= toVersion; version++) {
    migrated = step(migrated, version - 1, version)
  }
  return migrated
}
