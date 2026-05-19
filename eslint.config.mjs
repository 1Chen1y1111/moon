import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  {
    files: ['apps/desktop/src/renderer/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message: 'Renderer code must use window.api instead of importing Electron.'
            }
          ],
          patterns: [
            {
              group: [
                '@main',
                '@main/*',
                '@preload',
                '@preload/*',
                'apps/desktop/src/main/*',
                'apps/desktop/src/preload/*',
                'electron/*',
                '@electron-toolkit/*'
              ],
              message: 'Renderer code must not import main/preload/Electron modules.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['packages/shared/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message: 'Shared domain code must stay free of Electron dependencies.'
            },
            {
              name: 'react',
              message: 'Shared domain code must stay free of React dependencies.'
            },
            {
              name: 'react-dom',
              message: 'Shared domain code must stay free of React dependencies.'
            },
            {
              name: 'drizzle-orm',
              message: 'Shared domain code must stay free of Drizzle runtime dependencies.'
            }
          ],
          patterns: [
            {
              group: [
                '@main',
                '@main/*',
                '@preload',
                '@preload/*',
                '@renderer',
                '@renderer/*',
                '@moon/ui',
                '@moon/ui/*',
                'electron/*',
                '@electron-toolkit/*',
                'react/*',
                'react-dom/*',
                'drizzle-orm/*'
              ],
              message:
                'Shared domain code must not import UI, process, Electron, React, or Drizzle modules.'
            }
          ]
        }
      ]
    }
  },
  eslintConfigPrettier,
  {
    files: ['packages/ui/src/ui/*.tsx', 'packages/ui/src/hooks/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      'prettier/prettier': 'off',
      'react-refresh/only-export-components': 'off'
    }
  }
)
