/**
 * Production server for hosting the prototype (e.g. Render). Serves the built
 * frontend from dist/ and the Sunny API from the same origin.
 *
 *   npm run build && npm start
 *
 * Runs directly with Node's built-in TypeScript type stripping (Node 22.18+ / 24).
 * GEMINI_API_KEY / GEMINI_MODEL come from the host's environment settings, or
 * from .env.local when run locally. The key is never logged.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { sunnyMiddleware, type ServerConfig } from './http.ts';
import { createGeminiClient, DEFAULT_MODEL, verifyGemini } from './geminiClient.ts';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const config: ServerConfig = {
  apiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
  model: process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
  createClient: (key) => createGeminiClient(key),
  verify: verifyGemini,
  // Protect the shared free-tier quota: at most 30 chat turns per device per 10 minutes.
  rateLimit: { windowMs: 10 * 60_000, max: Number(process.env.SUNNY_RATE_LIMIT_MAX) || 30 },
};

const DIST = resolve('dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    return res.end();
  }
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.statusCode = 400;
    return res.end();
  }
  let file = resolve(join(DIST, pathname));
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    res.statusCode = 403;
    return res.end();
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html'); // single-page app fallback
  if (!existsSync(file)) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('The app has not been built yet. Run "npm run build" first.');
  }
  res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

const api = sunnyMiddleware(() => config);
const server = createServer((req, res) => {
  void api(req, res, () => serveStatic(req, res));
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => {
  console.log(`Sunny is running on port ${port}. Live AI: ${config.apiKey ? `Gemini (${config.model})` : 'not configured (scripted demo only)'}.`);
});
