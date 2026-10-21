// Reports whether Gemini conversation is configured and reachable.
// Reads .env / .env.local from this folder. Never prints the key.
// The check reads model metadata only; it does not generate content.
import { readFileSync, existsSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';

function readEnv() {
  const env = {};
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('GEMINI_'))) };
}

const env = readEnv();
const key = env.GEMINI_API_KEY?.trim();
const model = env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';

if (!key || key === 'replace-with-your-gemini-api-key') {
  console.log('Gemini conversation: NOT CONFIGURED');
  console.log('1. Create a key at https://aistudio.google.com/app/apikey');
  console.log('2. cp .env.example .env.local, then set GEMINI_API_KEY=... in .env.local');
  console.log('Sunny runs in the scripted demo until then.');
  process.exit(1);
}
console.log(`API key: found (${key.length} characters, value hidden)`);
console.log(`Model: ${model}`);
try {
  const info = await new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 15000 } }).models.get({ model });
  console.log(`Gemini conversation: AVAILABLE (key accepted; model "${info.name ?? model}" found)`);
  console.log('Free-tier limits apply per model; see https://aistudio.google.com/rate-limit');
} catch (err) {
  const status = err?.status ?? err?.statusCode;
  console.log(`Gemini conversation: NOT AVAILABLE${status ? ` (HTTP ${status})` : ''}`);
  console.log('Check the key, the model name (GEMINI_MODEL) and your network connection.');
  process.exit(1);
}
