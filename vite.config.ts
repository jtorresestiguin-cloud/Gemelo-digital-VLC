import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: funciona igual en GitHub Pages, Cloudflare Pages o cualquier hosting estático.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
