import { defineConfig } from 'vitest/config';

// Comprobación de las APIs reales (requiere internet): npx vitest run -c vitest.live.config.ts
export default defineConfig({
  test: { include: ['scripts/**/*.live.ts'], testTimeout: 180_000 },
});
