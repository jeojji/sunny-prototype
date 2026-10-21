import type { Plugin } from 'vite';
import { sunnyMiddleware, type ServerConfig } from './http.ts';
import { createGeminiClient, DEFAULT_MODEL, verifyGemini } from './geminiClient.ts';

/**
 * Serves /api/sunny/* from Vite's Node process (dev and preview).
 * Env values are passed in from vite.config.ts and stay server-side:
 * they are not VITE_-prefixed, so Vite never exposes them to client code.
 */
export function sunnyApi(env: Record<string, string | undefined>): Plugin {
  const config: ServerConfig = {
    apiKey: env.GEMINI_API_KEY?.trim() || undefined,
    model: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    createClient: (key) => createGeminiClient(key),
    verify: verifyGemini,
  };
  const middleware = sunnyMiddleware(() => config);
  return {
    name: 'sunny-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
