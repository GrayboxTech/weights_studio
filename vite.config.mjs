
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    watch: {
      ignored: [
        '**/data/**',
        '**/datasets/**',
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/pilots/**',
        '**/repos/**',
        '**/test_download/**'
      ]
    }
  },
  build: {
    outDir: 'dist',
  },
});
