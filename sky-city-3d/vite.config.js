import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 4400,
    strictPort: true,
    watch: {
      ignored: ['**/.browser-profiles/**', '**/artifacts/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4400,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 700,
  },
});
