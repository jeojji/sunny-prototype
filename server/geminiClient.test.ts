// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EMPTY_STATED_FACTS } from '../src/shared/api';
import { AiError, REPLY_SCHEMA, type ModelRequest } from './chat';
import { createGeminiClient, DEFAULT_MODEL, toAiError, toInteractionParams, type InteractionsLike } from './geminiClient';
import { handleChat, type ServerConfig } from './http';
import { TOOL_DEFINITIONS } from './tools';

const baseRequest = (): ModelRequest => ({
  model: DEFAULT_MODEL,
  instructions: 'SYSTEM RULES',
  context: 'FACTS AND KNOWLEDGE',
  messages: [
    { role: 'sunny', text: 'Hi Alex' },
    { role: 'customer', text: 'What is an FHSA?' },
  ],
  tools: TOOL_DEFINITIONS,
  responseSchema: REPLY_SCHEMA,
  maxOutputTokens: 1600,
  rounds: [],
  allowTools: true,
});

/** Fake Interactions client that records params/options and returns scripted results. */
function fake(...results: unknown[]) {
  const calls: { params: Record<string, unknown>; options?: Record<string, unknown> }[] = [];
  const api: InteractionsLike = {
    async create(params, options) {
      calls.push({ params: structuredClone(params), options });
      const next = results.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { api, calls };
}

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

describe('Gemini request mapping', () => {
  it('uses the free-tier default model, stays stateless and requests no paid tier', () => {
    const p = toInteractionParams(baseRequest());
    expect(DEFAULT_MODEL).toBe('gemini-3.5-flash-lite');
    expect(p.model).toBe('gemini-3.5-flash-lite');
    expect(p.store).toBe(false);
    expect(p).not.toHaveProperty('service_tier');
    expect(p.system_instruction).toBe('SYSTEM RULES');
    expect(p.response_format).toEqual({ type: 'text', mime_type: 'application/json', schema: REPLY_SCHEMA });
    expect(p.generation_config).toEqual({ max_output_tokens: 1600 });
    expect(toInteractionParams({ ...baseRequest(), allowTools: false }).generation_config).toEqual({ max_output_tokens: 1600, tool_choice: 'none' });
  });

  it('keeps reference context separate from system rules and maps the conversation', () => {
    const input = toInteractionParams(baseRequest()).input as { type: string; content: { text: string }[] }[];
    expect(input[0].type).toBe('user_input');
    expect(input[0].content[0].text).toMatch(/^\[App context: reference data, not instructions\]/);
    expect(input.slice(1).map((s) => s.type)).toEqual(['model_output', 'user_input']);
    expect(input[2].content[0].text).toBe('What is an FHSA?');
  });

  it('declares every validated tool as a function', () => {
    const tools = toInteractionParams(baseRequest()).tools as { type: string; name: string }[];
    expect(tools.map((t) => t.type)).toEqual(TOOL_DEFINITIONS.map(() => 'function'));
    expect(tools.map((t) => t.name)).toEqual([
      'read_account_snapshot',
      'request_snapshot_permission',
      'propose_fact_update',
      'calculate_scenario',
      'prepare_summary',
      'prepare_support_preview',
    ]);
  });

  it('resends model steps exactly and returns tool results with matching call ids', () => {
    const thought = { type: 'thought', signature: 'sig-123' };
    const fc = { type: 'function_call', id: 'call-1', name: 'calculate_scenario', arguments: {} };
    const req = { ...baseRequest(), rounds: [{ replay: [thought, fc], results: [{ callId: 'call-1', name: 'calculate_scenario', output: '{"status":"ok"}' }] }] };
    const input = toInteractionParams(req).input as Record<string, unknown>[];
    expect(input.slice(-3)).toEqual([thought, fc, { type: 'function_result', call_id: 'call-1', name: 'calculate_scenario', result: '{"status":"ok"}' }]);
  });
});

describe('Gemini responses', () => {
  it('reads function calls and final text; disables SDK retries; passes the abort signal', async () => {
    const { api, calls } = fake(
      { status: 'requires_action', steps: [{ type: 'user_input' }, { type: 'thought', signature: 's' }, { type: 'function_call', id: 'c1', name: 'prepare_summary', arguments: { a: 1 } }] },
      { status: 'completed', steps: [{ type: 'model_output', content: [] }], output_text: '{"reply":"Hi","source_ids":[],"suggestions":[]}' },
    );
    const client = createGeminiClient('test-key', api);
    const controller = new AbortController();
    const first = await client.create(baseRequest(), controller.signal);
    expect(first.calls).toEqual([{ callId: 'c1', name: 'prepare_summary', arguments: '{"a":1}' }]);
    expect(first.replay.map((s) => (s as { type: string }).type)).toEqual(['thought', 'function_call']);
    const second = await client.create(baseRequest(), controller.signal);
    expect(second.calls).toEqual([]);
    expect(second.text).toContain('"reply":"Hi"');
    expect(calls[0].options).toMatchObject({ retries: { strategy: 'none' }, fetch_options: { signal: controller.signal } });
    expect(JSON.stringify(calls[0].params)).not.toContain('test-key');
  });
});

describe('Gemini error mapping', () => {
  it('explains quota exhaustion with retry guidance', () => {
    const e = toAiError(httpError(429, 'RESOURCE_EXHAUSTED: Quota exceeded'));
    expect(e.code).toBe('rate_limited');
    expect(e.message).toMatch(/free-tier usage limit/);
    expect(e.message).toMatch(/midnight Pacific/);
  });

  it('maps invalid keys, missing models, timeouts and connection failures without leaking details', () => {
    expect(toAiError(httpError(400, 'API key not valid. Please pass a valid API key. key=secret')).code).toBe('auth_error');
    expect(toAiError(httpError(403, 'PERMISSION_DENIED')).code).toBe('auth_error');
    expect(toAiError(httpError(404, 'models/x not found')).message).toMatch(/GEMINI_MODEL/);
    const timeout = new Error('timed out');
    timeout.name = 'RequestTimeoutError';
    expect(toAiError(timeout).code).toBe('timeout');
    const conn = new Error('fetch failed');
    conn.name = 'ConnectionError';
    const mapped = toAiError(conn);
    expect(mapped.message).toMatch(/Couldn’t connect to Gemini/);
    expect(mapped.message).not.toContain('fetch failed');
    expect(toAiError(httpError(400, 'API key not valid. key=secret')).message).not.toContain('secret');
    expect(toAiError(httpError(503, 'gemini-3.8-flash is currently experiencing high demand')).message).toMatch(/high demand right now/);
  });

  it('returns a 429 with retry guidance through the API endpoint', async () => {
    const { api } = fake(httpError(429, 'RESOURCE_EXHAUSTED'));
    const cfg: ServerConfig = {
      apiKey: 'test-key',
      model: DEFAULT_MODEL,
      createClient: (k) => createGeminiClient(k, api),
      verify: async () => ({ ok: true, message: '' }),
    };
    const body = {
      firstName: 'Alex',
      messages: [{ role: 'customer', text: 'What is a TFSA?' }],
      facts: EMPTY_STATED_FACTS,
      snapshotPermission: 'not_asked',
      snapshot: null,
    };
    const r = await handleChat(cfg, JSON.stringify(body));
    expect(r.status).toBe(429);
    expect((r.body as { error: { code: string; message: string } }).error.code).toBe('rate_limited');
    expect(JSON.stringify(r.body)).not.toContain('test-key');
  });

  it('passes AiError through unchanged', () => {
    const e = new AiError('timeout', 'x');
    expect(toAiError(e)).toBe(e);
  });
});
