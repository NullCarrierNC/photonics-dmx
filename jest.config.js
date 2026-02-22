/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Set to true when running coverage (e.g. npm run test:coverage). Left false for default test run
  // because babel-plugin-istanbul instrumentation can break test loading in this setup.
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  coverageThreshold: {
    global: {
      statements: 30,
      branches: 25,
      functions: 25,
      lines: 30,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/photonics-dmx/tests/jest.setup.ts'],
}
