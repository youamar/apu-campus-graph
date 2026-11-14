import { FunctionCallingConfigMode, GoogleGenAI, Type, type Content, type FunctionDeclaration, type Schema } from '@google/genai';
import type { ChatContent, Step, StepResult } from './step';
import { TOOL_DECLARATIONS } from './tools';
import { POSTER_INSTRUCTION, type ReadPoster } from './extract';

/**
 * Checked against this key's models.list on 2026-11-13: gemini-2.5-flash is listed but returns 404
 * ("no longer available to new users"); gemini-3.8-flash / 3.7-flash / 3.5-flash returned 503 (high demand);
 * gemini-3.5-flash-lite answered in ~2s. Override with GEMINI_MODEL.
 */
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/** Structured output contract; parseGuideResponse re-validates every field against the catalog. */
export const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING, description: 'Friendly answer, under 90 words, in the user language.' },
    focusIds: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '0-6 community ids copied exactly from the CATALOG, best first.',
    },
    openId: {
      type: Type.STRING,
      nullable: true,
      description: 'One community id when the user asks about one specific community, otherwise null.',
    },
    suggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Exactly 3 short follow-up questions.',
    },
  },
  required: ['reply', 'focusIds', 'suggestions'],
  propertyOrdering: ['reply', 'focusIds', 'openId', 'suggestions'],
};

/** Backup models, tried in order when the primary is overloaded. Override with GEMINI_FALLBACK_MODELS. */
export const FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'];
/** Overloaded = rate-limited (429) or a server-side failure (500/503): worth trying the next model. */
const overloaded = (err: unknown) => [429, 500, 503].includes((err as { status?: number })?.status ?? 0);

/** One client per key, shared by both adapters; SDK retries off so the agent's own budget decides. */
const clients = new Map<string, GoogleGenAI>();
function client(apiKey: string): GoogleGenAI {
  let ai = clients.get(apiKey);
  if (!ai) clients.set(apiKey, (ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } })));
  return ai;
}

/** Tries `call` on each model in turn while the previous one is overloaded; other errors throw at once. */
export async function withModelFallback<T>(models: string[], call: (model: string) => Promise<T>, signal: AbortSignal, tag: string): Promise<T> {
  let lastErr: unknown;
  for (const m of models) {
    try {
      return await call(m);
    } catch (err) {
      lastErr = err;
      if (signal.aborted || !overloaded(err)) throw err;
      console.warn(`[${tag}] ${m} overloaded (${(err as { status?: number }).status}); trying next model`);
    }
  }
  throw lastErr;
}

/** The Gemini adapter for the Step seam (server/step.ts), used by GuideAgent. Returns null without a key. */

export function createGeminiStep(apiKey: string | undefined, model = DEFAULT_MODEL, fallbacks = FALLBACK_MODELS): Step | null {
  if (!apiKey) return null;
  const models = [model, ...fallbacks.filter((m) => m && m !== model)];
  const ai = client(apiKey);
  const tools = [{ functionDeclarations: TOOL_DECLARATIONS as unknown as FunctionDeclaration[] }];
  return async ({ systemInstruction, contents, tools: allowTools, forceTool, attempt = 0 }, signal) => {
    // A retry starts on the next model; an overloaded model falls through to the next one at once.
    return withModelFallback(models.slice(Math.min(attempt, models.length - 1)), callModel, signal, 'chat');

    async function callModel(m: string): Promise<StepResult> {
    const response = await ai.models.generateContent({
      model: m,
      contents: contents as Content[],
      config: {
        systemInstruction,
        tools,
        // Final and repair steps must answer: tools stay declared (history holds calls) but are switched off.
        toolConfig: {
          functionCallingConfig: {
            mode: allowTools === false ? FunctionCallingConfigMode.NONE : forceTool ? FunctionCallingConfigMode.ANY : FunctionCallingConfigMode.AUTO,
          },
        },
        // Gemini rejects forced (ANY) function calling together with JSON mode: the forced step only plans.
        ...(forceTool ? {} : { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }),
        temperature: 0.3,
        abortSignal: signal,
      },
    });
    const calls = response.functionCalls;
    if (calls?.length) {
      return {
        calls: calls.map((c) => ({ id: c.id, name: c.name ?? '', args: (c.args ?? {}) as Record<string, unknown> })),
        content: response.candidates?.[0]?.content as ChatContent | undefined,
      };
    }
    const text = response.text;
    if (!text) throw new Error('empty model response');
    return { text };
    }
  };
}

const POSTER_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    clubName: { type: Type.STRING, nullable: true },
    fee: { type: Type.STRING, nullable: true },
    register: { type: Type.STRING, nullable: true },
    booking: { type: Type.STRING, nullable: true },
    slots: { type: Type.STRING, nullable: true },
    deadline: { type: Type.STRING, nullable: true },
  },
  propertyOrdering: ['clubName', 'fee', 'register', 'booking', 'slots', 'deadline'],
};

/** The Gemini adapter for ReadPoster (server/extract.ts): multimodal, structured output, same model fallback. */
export function createGeminiPosterReader(apiKey: string | undefined, model = DEFAULT_MODEL, fallbacks = FALLBACK_MODELS): ReadPoster | null {
  if (!apiKey) return null;
  const models = [model, ...fallbacks.filter((m) => m && m !== model)];
  const ai = client(apiKey);
  return async (input, signal) => {
    const parts: Content['parts'] = [];
    if (input.image) parts.push({ inlineData: { mimeType: input.image.mimeType, data: input.image.data } });
    parts.push({ text: input.text ? `<poster_text>${input.text.replace(/<\/?poster_text>/gi, '')}</poster_text>` : 'Read the poster image.' });
    return withModelFallback(
      models,
      async (m) => {
        const r = await ai.models.generateContent({
          model: m,
          contents: [{ role: 'user', parts }],
          config: { systemInstruction: POSTER_INSTRUCTION, responseMimeType: 'application/json', responseSchema: POSTER_SCHEMA, temperature: 0, abortSignal: signal },
        });
        if (!r.text) throw new Error('empty model response');
        return r.text;
      },
      signal,
      'extract',
    );
  };
}
