import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: funciona igual en GitHub Pages, Cloudflare Pages o cualquier hosting estático.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // deck.gl y sus dependencias en un único trozo (se descarga solo con la vista fotorrealista);
        // separarlos crea dependencias circulares entre trozos.
        manualChunks(id) {
          // utilidades que Rollup comparte entre trozos: aparte, para no arrastrar deck.gl al inicio
          if (id.includes('commonjsHelpers') || id.includes('preload-helper')) return 'helpers';
          if (/node_modules\/@(deck\.gl|luma\.gl|loaders\.gl|math\.gl|probe\.gl)\//.test(id)) return 'deckgl';
        },
      },
    },
  },
});
