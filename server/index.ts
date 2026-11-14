import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createChatHandler } from './chat';
import { DEFAULT_MODEL, createGeminiPosterReader, createGeminiStep } from './gemini';
import { createExtractHandler } from './extract';
import { catalog } from '../src/data/catalog';

try {
  process.loadEnvFile?.();
} catch {
  /* no .env: rely on the real environment */
}

const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
const fallbacks = process.env.GEMINI_FALLBACK_MODELS?.split(',').map((m) => m.trim()).filter(Boolean);
const step = createGeminiStep(process.env.GEMINI_API_KEY, model, fallbacks);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));
app.post('/api/chat', createChatHandler({ step }));
app.post('/api/extract', createExtractHandler({ read: createGeminiPosterReader(process.env.GEMINI_API_KEY, model, fallbacks), catalog }));

// Warm-up: the page pings this on load so the first real question doesn't pay Gemini's cold start.
let lastWarm = 0;
const warm = () => {
  if (!step || Date.now() - lastWarm < 5 * 60_000) return;
  lastWarm = Date.now();
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 10_000);
  step({ systemInstruction: 'Reply with {"reply":"ok","focusIds":[],"suggestions":[]}', contents: [{ role: 'user', parts: [{ text: 'ping' }] }], tools: false }, ctrl.signal).catch(() => {});
};
app.get('/api/warm', (_req, res) => {
  warm();
  res.json({ ok: true });
});
app.all('/api/{*rest}', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Built SPA: dist/ sits beside dist-server/ (bundle) and server/ (tsx), so ../dist works for both.
const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile('index.html', { root: dist });
  });
}

// Malformed JSON, oversized bodies and anything unexpected: JSON error, never an HTML stack trace.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number })?.status;
  const code = typeof status === 'number' && status >= 400 && status < 500 ? status : 500;
  res.status(code).json({ error: code === 500 ? 'Internal error' : 'Bad request' });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  warm();
  console.log(`APU Campus Graph server on :${port} (guide: ${step ? `gemini ${model}` : 'offline, no GEMINI_API_KEY'})`);
});
