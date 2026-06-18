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
  // Ratcheted from a Jest --coverage run (global totals); floor(percent) - 1
  coverageThreshold: {
    global: {
      statements: 68,
      branches: 66,
      functions: 54,
      lines: 68,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/photonics-dmx/tests/jest.setup.ts'],
  // Mirror the `@renderer/*` path alias from tsconfig.web.json so renderer component/unit tests
  // can import modules that use it (ts-jest does not apply tsconfig `paths` at runtime).
  moduleNameMapper: {
    '^@renderer/(.*)$': '<rootDir>/src/renderer/src/$1',
  },
}
