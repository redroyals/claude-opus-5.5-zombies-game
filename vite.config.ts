import { defineConfig } from 'vitest/config';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

export default defineConfig({
  base: './',
  server: {
    port: Number(env.PORT ?? 5173),
    host: '127.0.0.1',
    // Multiplayer: proxy the Worker (wrangler dev on :8787 by default) so the client is same-origin.
    proxy: {
      '/api': { target: env.MP_SERVER ?? 'http://127.0.0.1:8787', changeOrigin: true },
      '/ws': { target: env.MP_SERVER ?? 'http://127.0.0.1:8787', ws: true, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: 'index.html', mp: 'mp.html', samples: 'samples.html' } },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
