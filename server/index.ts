import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createChatHandler } from './chat';
import { DEFAULT_MODEL, createGeminiGenerate } from './gemini';

try {
  process.loadEnvFile?.();
} catch {
  /* no .env: rely on the real environment */
}

const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
const generate = createGeminiGenerate(process.env.GEMINI_API_KEY, model);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));
app.post('/api/chat', createChatHandler({ generate }));
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
  console.log(`APU Campus Graph server on :${port} (guide: ${generate ? `gemini ${model}` : 'offline, no GEMINI_API_KEY'})`);
});
