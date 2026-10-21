/**
 * Framework-free handlers for the local Sunny API:
 *   GET  /api/sunny/status[?verify=1]
 *   POST /api/sunny/chat
 * Mounted into Vite's dev and preview servers by vitePlugin.ts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LIMITS, type AiErrorCode, type ChatErrorBody, type StatusResponse } from '../src/shared/api.ts';
import { AiError, runChatTurn, sanitizeRequest, type ModelClient } from './chat.ts';

export interface ServerConfig {
  apiKey: string | undefined;
  model: string;
  createClient: (apiKey: string) => ModelClient;
  verify: (apiKey: string, model: string) => Promise<{ ok: boolean; message: string }>;
  /** Overall per-turn deadline (all tool rounds). */
  turnTimeoutMs?: number;
}

interface Result {
  status: number;
  body: unknown;
}

const STATUS_FOR: Record<AiErrorCode, number> = {
  not_configured: 503,
  auth_error: 502,
  rate_limited: 429,
  timeout: 504,
  provider_error: 502,
  bad_request: 400,
};

const NOT_CONFIGURED =
  'Gemini conversation is not configured. Add GEMINI_API_KEY to .env.local (key from Google AI Studio) and restart the server.';

function errorResult(code: AiErrorCode, message: string): Result {
  const body: ChatErrorBody = { error: { code, message } };
  return { status: STATUS_FOR[code], body };
}

export async function handleStatus(cfg: ServerConfig, verify: boolean): Promise<Result> {
  if (!cfg.apiKey) {
    const body: StatusResponse = { aiAvailable: false, model: null, reason: NOT_CONFIGURED };
    return { status: 200, body };
  }
  if (!verify) {
    const body: StatusResponse = { aiAvailable: true, model: cfg.model, reason: null };
    return { status: 200, body };
  }
  const check = await cfg.verify(cfg.apiKey, cfg.model);
  const body: StatusResponse = { aiAvailable: check.ok, model: cfg.model, reason: check.ok ? null : check.message, verified: check.ok };
  return { status: 200, body };
}

export async function handleChat(cfg: ServerConfig, rawBody: string, outerSignal?: AbortSignal): Promise<Result> {
  if (!cfg.apiKey) return errorResult('not_configured', NOT_CONFIGURED);
  let req;
  try {
    req = sanitizeRequest(JSON.parse(rawBody));
  } catch (err) {
    return errorResult('bad_request', err instanceof AiError ? err.message : 'Malformed request.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.turnTimeoutMs ?? LIMITS.timeoutMs + 15_000);
  outerSignal?.addEventListener('abort', () => controller.abort());
  try {
    const body = await runChatTurn(req, cfg.createClient(cfg.apiKey), cfg.model, controller.signal);
    return { status: 200, body };
  } catch (err) {
    if (controller.signal.aborted) return errorResult('timeout', 'The AI service took too long to respond.');
    if (err instanceof AiError) return errorResult(err.code, err.message);
    return errorResult('provider_error', 'Something went wrong while contacting the AI service.');
  } finally {
    clearTimeout(timer);
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > LIMITS.maxBodyBytes) {
        reject(new AiError('bad_request', 'Request too large.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, r: Result) {
  res.statusCode = r.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(r.body));
}

/** Connect-style middleware for Vite. */
export function sunnyMiddleware(getConfig: () => ServerConfig) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/sunny/')) return next();
    try {
      if (url.pathname === '/api/sunny/status' && req.method === 'GET') {
        return send(res, await handleStatus(getConfig(), url.searchParams.get('verify') === '1'));
      }
      if (url.pathname === '/api/sunny/chat' && req.method === 'POST') {
        const closed = new AbortController();
        res.on('close', () => {
          if (!res.writableEnded) closed.abort();
        });
        const body = await readBody(req);
        return send(res, await handleChat(getConfig(), body, closed.signal));
      }
      send(res, errorResult('bad_request', 'Unknown endpoint.'));
    } catch (err) {
      send(res, errorResult('bad_request', err instanceof AiError ? err.message : 'Bad request.'));
    }
  };
}
