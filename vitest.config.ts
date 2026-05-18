import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [svgr(), react()],
  resolve: {
    alias: {
      '@ai-sdk/anthropic': resolve('tests/mocks/ai-sdk-anthropic.ts'),
      '@ai-sdk/google': resolve('tests/mocks/ai-sdk-google.ts'),
      '@ai-sdk/openai': resolve('tests/mocks/ai-sdk-openai.ts'),
      '@ai-sdk/openai-compatible': resolve('tests/mocks/ai-sdk-openai-compatible.ts'),
      '@electron-toolkit/utils': resolve('tests/mocks/electron-toolkit-utils.ts'),
      electron: resolve('tests/mocks/electron.ts'),
      '@moon/ipc': resolve('packages/ipc/src'),
      '@moon/shared': resolve('packages/shared/src'),
      '@moon/ui': resolve('packages/ui/src'),
      '@main': resolve('apps/desktop/src/main'),
      '@preload': resolve('apps/desktop/src/preload'),
      '@renderer': resolve('apps/desktop/src/renderer/src'),
      '@tests': resolve('tests')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/helpers/renderer/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}']
  }
})
