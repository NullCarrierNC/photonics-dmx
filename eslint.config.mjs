import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import prettier from '@electron-toolkit/eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import tsParser from '@typescript-eslint/parser'

export default defineConfig([
  // scripts/ holds local-only generators the repository does not carry, so lint leaves it alone and
  // gives the same answer on every machine.
  { ignores: ['out/', 'dist/', 'node_modules/', 'scripts/'] },
  tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'semi': ['error', 'never'],
      '@typescript-eslint/semi': ['error', 'never'],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'no-console': 'error',
    },
  },
  {
    // Rules that need the type checker, so only the sources a tsconfig covers.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // Named rather than discovered, because the test sources sit in their own project and the
        // other two exclude them.
        project: ['./tsconfig.node.json', './tsconfig.web.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A warning, held at its current count by tools/floating-promises-budget.mjs, because the
      // backlog is larger than one pass and each site needs its own answer: await it, catch it, or
      // say with void that its failure is ignorable.
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
  {
    files: ['src/shared/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: [
      'src/photonics-dmx/tests/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['tools/**'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/tests/**/*.ts', '**/tests/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  prettier,
])
