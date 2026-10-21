/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sunnyApi } from './server/vitePlugin.ts';

export default defineConfig(({ mode }) => {
  // Loads .env, .env.local, etc. for the server-side API only. Do not add these
  // values to `define` or rename them with a VITE_ prefix: that would expose them to the browser.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), sunnyApi(env)],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
