/** What both projects share: TypeScript through ts-jest and the `@renderer/*` alias. */
const shared = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Mirror the `@renderer/*` path alias from tsconfig.web.json so renderer component/unit tests
  // can import modules that use it (ts-jest does not apply tsconfig `paths` at runtime).
  moduleNameMapper: {
    '^@renderer/(.*)$': '<rootDir>/src/renderer/src/$1',
  },
}

const commonSetup = '<rootDir>/src/photonics-dmx/tests/jest.setup.ts'

/** @type {import('jest').Config} */
module.exports = {
  silent: true,
  // The renderer project adds the DOM matchers, and everything else runs without them.
  projects: [
    {
      ...shared,
      displayName: 'engine',
      roots: ['<rootDir>/src'],
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/renderer/'],
      setupFilesAfterEnv: [commonSetup],
    },
    {
      ...shared,
      displayName: 'renderer',
      roots: ['<rootDir>/src/renderer'],
      setupFilesAfterEnv: [commonSetup, '<rootDir>/src/renderer/src/tests/setup.ts'],
    },
  ],
  // `npm test` stays fast; `npm run test:coverage` runs `jest --coverage` (V8 provider).
  collectCoverage: false,
  coverageProvider: 'v8',
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  // Count EVERY source file, not just those a test happens to import — otherwise the headline
  // percentage only reflects tested files and hides untested ones entirely.
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/tests/**',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
  // Ratcheted from a Jest --coverage run over ALL source (global totals); floor(percent) - 1.
  // Every file counts, tested or not, so these cover the whole source rather than only the files a
  // test happens to import. Ratchet upward as coverage improves.
  coverageThreshold: {
    global: {
      statements: 74,
      branches: 78,
      functions: 70,
      lines: 74,
    },
  },
}
