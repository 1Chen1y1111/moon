import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['@moon/ipc', '@moon/shared']
      }
    },
    optimizeDeps: {
      exclude: ['@electric-sql/pglite']
    },
    resolve: {
      alias: {
        '@moon/ipc': resolve('../../packages/ipc/src'),
        '@moon/shared': resolve('../../packages/shared/src')
      }
    }
  },
  preload: {
    build: {
      externalizeDeps: {
        exclude: ['@moon/ipc', '@moon/shared']
      }
    },
    resolve: {
      alias: {
        '@moon/ipc': resolve('../../packages/ipc/src'),
        '@moon/shared': resolve('../../packages/shared/src')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@moon/ipc': resolve('../../packages/ipc/src'),
        '@moon/shared': resolve('../../packages/shared/src'),
        '@moon/ui': resolve('../../packages/ui/src')
      }
    },
    plugins: [tailwindcss(), svgr(), react()]
  }
})
