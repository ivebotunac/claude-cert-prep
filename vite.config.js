import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// `base` must match the GitHub Pages sub-path when deploying to
// https://<user>.github.io/<repo>/. The deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [svelte(), tailwindcss()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      $content: fileURLToPath(new URL('./content', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    // The SQLite WASM binary is ~1.2 MB and is fetched lazily, so keep it out of
    // the entry chunk and stop Rollup warning about it.
    chunkSizeWarningLimit: 1500,
  },
  optimizeDeps: {
    // sqlite-wasm ships a worker + wasm pair that Vite's dep scanner mangles.
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    globals: true,
  },
})
