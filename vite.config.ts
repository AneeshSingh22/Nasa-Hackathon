import { defineConfig } from 'vite';

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
});
