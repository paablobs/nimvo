import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

import { precacheServiceWorker } from './vite.pwa.ts'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), precacheServiceWorker()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
