import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    optimizeDeps: {
      exclude: ['@electric-sql/pglite']
    },
    resolve: {
      alias: {
        '@ipc': resolve('src/ipc'),
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@ipc': resolve('src/ipc'),
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shadcn': resolve('src/shadcn'),
        '@ipc': resolve('src/ipc'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [tailwindcss(), react()]
  }
})
