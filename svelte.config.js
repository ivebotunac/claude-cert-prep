import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Svelte 5 runes mode. No legacy reactive statements anywhere in this codebase.
    runes: true,
  },
}
