import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@preload': resolve('src/preload'),
      '@renderer': resolve('src/renderer/src'),
      '@shadcn': resolve('src/shadcn'),
      '@ipc': resolve('src/ipc'),
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
