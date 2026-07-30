/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/middleware',
                '**/middleware.ts',
                './middleware',
                '../middleware',
              ],
              message:
                'Next.js 16 uses `proxy.ts`, not `middleware.ts`. Import from the proxy module instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // shadcn-generated UI primitives — kept close to upstream generator output
    // for easy regeneration. The `createContext<T>({} as T)` and CSS-var
    // typing patterns are shadcn idioms.
    files: ['src/components/ui/**/*.tsx', 'src/components/ui/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as' },
      ],
    },
  },
  {
    files: ['src/services/**/*.service.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Program > :first-child:not(ImportDeclaration[source.value='server-only'])",
          message:
            "Service files must start with `import 'server-only'` (before any other code — doc comments above it are fine) so they can never be bundled into client code.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'src/generated/**',
  ]),
])

export default eslintConfig
