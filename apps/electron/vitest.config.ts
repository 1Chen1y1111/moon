import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [svgr(), react()],
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@preload': resolve('src/preload'),
      '@renderer': resolve('src/renderer/src'),
      '@ipc': resolve('src/ipc'),
      '@moon/server-core': resolve('../../packages/server-core/src'),
      '@moon/shared': resolve('../../packages/shared/src'),
      '@moon/ui': resolve('../../packages/ui/src'),
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
