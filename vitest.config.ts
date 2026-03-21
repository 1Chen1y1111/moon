import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shadcn': resolve('src/shadcn'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/renderer/src/test/setup.ts'],
    include: ['src/renderer/src/**/*.test.{ts,tsx}', 'src/main/**/*.test.ts']
  }
})
