/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the production build works from any static host, including
  // a GitHub Pages project subpath.
  base: './',
  build: {
    target: 'es2022',
    // Three.js is most of the bundle; split it so game-code changes do not
    // invalidate the library chunk in the browser cache.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    open: true,
  },
  test: {
    // Physics tests are pure functions and run fastest in Node. Anything under
    // src/vab drives real keyboard and pointer events, so it needs a DOM.
    environment: 'node',
    environmentMatchGlobs: [
      ['src/vab/**', 'jsdom'],
      ['tests/**', 'jsdom'],
    ],
  },
});
