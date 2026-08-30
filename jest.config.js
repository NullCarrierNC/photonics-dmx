/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  silent: true,
  roots: ['<rootDir>/src'],
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
      statements: 61,
      branches: 75,
      functions: 65,
      lines: 61,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/photonics-dmx/tests/jest.setup.ts'],
  // Mirror the `@renderer/*` path alias from tsconfig.web.json so renderer component/unit tests
  // can import modules that use it (ts-jest does not apply tsconfig `paths` at runtime).
  moduleNameMapper: {
    '^@renderer/(.*)$': '<rootDir>/src/renderer/src/$1',
  },
}
